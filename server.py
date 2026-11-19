#!/usr/bin/env python3
"""UML Studio static server with a local SQLite recovery database."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import time
import webbrowser
from collections.abc import Iterator
from contextlib import closing, contextmanager
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
MAX_BODY_BYTES = 12 * 1024 * 1024
AUTOSAVE_KEY = "autosave"
PREVIOUS_KEY = "previous"
REVISION_LIMIT = 10
PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


class RequestBodyTooLarge(ValueError):
    """Raised before reading a request whose declared body exceeds the limit."""


def wal_reset_fix_available(version: tuple[int, int, int] | None = None) -> bool:
    """Return whether the linked SQLite includes the 2026 WAL-reset fix.

    SQLite fixed the race in 3.51.3 and published backports in 3.50.7 and
    3.44.6. Other older release lines remain on the conservative rollback
    journal path so concurrent browser tabs cannot exercise the affected WAL
    code.
    """

    current = version or sqlite3.sqlite_version_info
    if current[:2] == (3, 44):
        return current >= (3, 44, 6)
    if current[:2] == (3, 50):
        return current >= (3, 50, 7)
    return current >= (3, 51, 3)


def database_journal_mode(version: tuple[int, int, int] | None = None) -> str:
    return "WAL" if wal_reset_fix_available(version) else "DELETE"


def initialize_database(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as connection, connection:
        configured_mode = database_journal_mode()
        journal_mode = str(connection.execute(f"PRAGMA journal_mode={configured_mode}").fetchone()[0])
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS project_recovery (
                id TEXT PRIMARY KEY,
                project_json TEXT NOT NULL,
                saved_at INTEGER NOT NULL,
                project_version INTEGER,
                byte_length INTEGER NOT NULL
            )
            """
        )
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                project_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                project_version INTEGER,
                byte_length INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS project_revisions (
                project_id TEXT NOT NULL,
                revision INTEGER NOT NULL,
                project_json TEXT NOT NULL,
                saved_at INTEGER NOT NULL,
                project_version INTEGER,
                byte_length INTEGER NOT NULL,
                PRIMARY KEY (project_id, revision),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS project_revisions_recent ON project_revisions(project_id, revision DESC)"
        )
    return journal_mode


class EditorAssetHandler(SimpleHTTPRequestHandler):
    server_version = "UMLStudio/7"
    # The stdlib default is HTTP/1.0, which opens a new TCP connection for every
    # one of the ~60 scripts the page loads. Keep-alive cuts that burst to the
    # browser's six connections; every response below already sets
    # Content-Length, which HTTP/1.1 requires.
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(Path(directory or ROOT).resolve()), **kwargs)

    def send_head(self):
        # GET and HEAD both use this hook. Only resolve browser assets under the
        # static root, including when a requested path is a symbolic link.
        root = Path(self.directory)
        requested = Path(self.translate_path(self.path))
        if requested == root:
            requested = root / "index.html"
        try:
            asset = requested.resolve(strict=True)
            relative = asset.relative_to(root)
        except (OSError, RuntimeError, ValueError):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None

        is_editor_asset = relative in (Path("index.html"), Path("styles.css")) or (
            relative.is_relative_to("dist/browser") and relative.name.endswith((".js", ".js.map"))
        )
        if not is_editor_asset or asset == getattr(self.server, "db_path", None) or not asset.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        return super().send_head()


class UMLStudioHandler(EditorAssetHandler):
    @property
    def db_path(self) -> Path:
        return self.server.db_path  # type: ignore[attr-defined]

    @contextmanager
    def database(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if status >= HTTPStatus.BAD_REQUEST:
            # Some error paths answer before reading the request body (oversized
            # or malformed PUTs). Leaving those bytes on a keep-alive socket would
            # corrupt the next request, so an error always ends the connection.
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.wfile.write(body)

    def api_record(self, record_id: str) -> None:
        with self.database() as connection:
            row = connection.execute(
                "SELECT id, project_json, saved_at, project_version, byte_length FROM project_recovery WHERE id = ?",
                (record_id,),
            ).fetchone()
        if row is None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "recovery_not_found"})
            return
        self.send_json(
            HTTPStatus.OK,
            {
                "id": row["id"],
                "json": row["project_json"],
                "savedAt": row["saved_at"],
                "projectVersion": row["project_version"],
                "byteLength": row["byte_length"],
                "backend": "sqlite",
            },
        )

    @staticmethod
    def project_metadata(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "name": row["name"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "revision": row["revision"],
            "projectVersion": row["project_version"],
            "byteLength": row["byte_length"],
            "backend": "sqlite",
        }

    @staticmethod
    def project_route(path: str) -> tuple[str, int | None] | None:
        parts = [unquote(part) for part in path.strip("/").split("/")]
        if len(parts) < 3 or parts[:2] != ["api", "projects"]:
            return None
        project_id = parts[2]
        if not PROJECT_ID_PATTERN.fullmatch(project_id):
            return None
        if len(parts) == 3:
            return project_id, None
        if len(parts) == 4 and parts[3] == "revisions":
            return project_id, -1
        if len(parts) == 5 and parts[3] == "revisions" and parts[4].isdigit():
            return project_id, int(parts[4])
        return None

    def read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("invalid content length") from error
        if length > MAX_BODY_BYTES:
            raise RequestBodyTooLarge("request body is too large")
        if length <= 0:
            raise ValueError("invalid body size")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("body must be an object")
        return payload

    @staticmethod
    def validated_project_payload(payload: dict) -> tuple[str, dict, int, int, str]:
        project_json = payload["json"]
        if not isinstance(project_json, str):
            raise TypeError("json must be a string")
        encoded = project_json.encode("utf-8")
        if len(encoded) > MAX_BODY_BYTES:
            raise ValueError("project is too large")
        project = json.loads(project_json)
        if not isinstance(project, dict) or not isinstance(project.get("diagrams"), list):
            raise ValueError("invalid project root")
        saved_at = int(payload.get("savedAt") or time.time() * 1000)
        project_version = int(payload.get("projectVersion") or project.get("version") or 0)
        name = str(payload.get("name") or project.get("projectName") or "Untitled Project").strip()[:200]
        return project_json, project, saved_at, project_version, name or "Untitled Project"

    def list_projects(self) -> None:
        with self.database() as connection:
            rows = connection.execute(
                "SELECT id, name, created_at, updated_at, revision, project_version, byte_length "
                "FROM projects ORDER BY updated_at DESC"
            ).fetchall()
        self.send_json(HTTPStatus.OK, {"projects": [self.project_metadata(row) for row in rows]})

    def get_project(self, project_id: str) -> None:
        with self.database() as connection:
            row = connection.execute(
                "SELECT id, name, project_json, created_at, updated_at, revision, project_version, byte_length "
                "FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()
        if row is None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "project_not_found"})
            return
        payload = self.project_metadata(row)
        payload["json"] = row["project_json"]
        self.send_json(HTTPStatus.OK, payload)

    def list_project_revisions(self, project_id: str) -> None:
        with self.database() as connection:
            rows = connection.execute(
                "SELECT project_id, revision, saved_at, project_version, byte_length "
                "FROM project_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT ?",
                (project_id, REVISION_LIMIT),
            ).fetchall()
        revisions = [
            {
                "id": f"{row['project_id']}:{row['revision']}",
                "projectId": row["project_id"],
                "revision": row["revision"],
                "savedAt": row["saved_at"],
                "projectVersion": row["project_version"],
                "byteLength": row["byte_length"],
                "backend": "sqlite",
            }
            for row in rows
        ]
        self.send_json(HTTPStatus.OK, {"revisions": revisions})

    def get_project_revision(self, project_id: str, revision: int) -> None:
        with self.database() as connection:
            row = connection.execute(
                "SELECT project_id, revision, project_json, saved_at, project_version, byte_length "
                "FROM project_revisions WHERE project_id = ? AND revision = ?",
                (project_id, revision),
            ).fetchone()
        if row is None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "revision_not_found"})
            return
        self.send_json(
            HTTPStatus.OK,
            {
                "id": f"{row['project_id']}:{row['revision']}",
                "projectId": row["project_id"],
                "revision": row["revision"],
                "json": row["project_json"],
                "savedAt": row["saved_at"],
                "projectVersion": row["project_version"],
                "byteLength": row["byte_length"],
                "backend": "sqlite",
            },
        )

    def put_project(self, project_id: str) -> None:
        try:
            payload = self.read_json_body()
            project_json, project, saved_at, project_version, name = self.validated_project_payload(payload)
            expected_revision = payload.get("expectedRevision")
            if expected_revision is not None:
                expected_revision = int(expected_revision)
            json_project_id = project.get("projectId")
            if json_project_id not in (None, "", project_id):
                raise ValueError("project id does not match request path")
            encoded_length = len(project_json.encode("utf-8"))
        except RequestBodyTooLarge as error:
            self.send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {
                    "error": "payload_too_large",
                    "detail": str(error),
                },
            )
            return
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_project", "detail": str(error)})
            return

        try:
            with self.database() as connection:
                connection.execute("BEGIN IMMEDIATE")
                current = connection.execute(
                    "SELECT id, name, project_json, created_at, updated_at, revision, project_version, byte_length "
                    "FROM projects WHERE id = ?",
                    (project_id,),
                ).fetchone()
                if (
                    current is not None
                    and expected_revision is not None
                    and expected_revision != current["revision"]
                    and current["project_json"] != project_json
                ):
                    connection.rollback()
                    self.send_json(
                        HTTPStatus.CONFLICT,
                        {
                            "error": "revision_conflict",
                            "expectedRevision": expected_revision,
                            "actualRevision": current["revision"],
                        },
                    )
                    return
                if current is not None and current["project_json"] == project_json and current["name"] == name:
                    connection.rollback()
                    self.send_json(HTTPStatus.OK, self.project_metadata(current))
                    return
                revision = (current["revision"] if current is not None else 0) + 1
                created_at = current["created_at"] if current is not None else saved_at
                connection.execute(
                    """
                    INSERT INTO projects
                        (id, name, project_json, created_at, updated_at, revision, project_version, byte_length)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        project_json = excluded.project_json,
                        updated_at = excluded.updated_at,
                        revision = excluded.revision,
                        project_version = excluded.project_version,
                        byte_length = excluded.byte_length
                    """,
                    (project_id, name, project_json, created_at, saved_at, revision, project_version, encoded_length),
                )
                connection.execute(
                    """
                    INSERT INTO project_revisions
                        (project_id, revision, project_json, saved_at, project_version, byte_length)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (project_id, revision, project_json, saved_at, project_version, encoded_length),
                )
                connection.execute(
                    "DELETE FROM project_revisions WHERE project_id = ? AND revision NOT IN "
                    "(SELECT revision FROM project_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT ?)",
                    (project_id, project_id, REVISION_LIMIT),
                )
                row = connection.execute(
                    "SELECT id, name, created_at, updated_at, revision, project_version, byte_length "
                    "FROM projects WHERE id = ?",
                    (project_id,),
                ).fetchone()
        except sqlite3.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "database_error", "detail": str(error)})
            return
        self.send_json(HTTPStatus.OK, self.project_metadata(row))

    def patch_project(self, project_id: str) -> None:
        try:
            payload = self.read_json_body()
            name = str(payload["name"]).strip()[:200]
            if not name:
                raise ValueError("project name is empty")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_project_name", "detail": str(error)})
            return
        with self.database() as connection:
            cursor = connection.execute("UPDATE projects SET name = ? WHERE id = ?", (name, project_id))
            row = connection.execute(
                "SELECT id, name, created_at, updated_at, revision, project_version, byte_length "
                "FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()
        if cursor.rowcount < 1 or row is None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "project_not_found"})
            return
        self.send_json(HTTPStatus.OK, self.project_metadata(row))

    def delete_project(self, project_id: str) -> None:
        with self.database() as connection:
            cursor = connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if cursor.rowcount < 1:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "project_not_found"})
            return
        self.send_json(HTTPStatus.OK, {"ok": True, "id": project_id})

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "database": self.db_path.name,
                    "journalMode": self.server.journal_mode,  # type: ignore[attr-defined]
                    "sqliteVersion": sqlite3.sqlite_version,
                },
            )
            return
        if path == "/api/recovery/autosave":
            self.api_record(AUTOSAVE_KEY)
            return
        if path == "/api/recovery/previous":
            self.api_record(PREVIOUS_KEY)
            return
        if path == "/api/projects":
            self.list_projects()
            return
        project_route = self.project_route(path)
        if project_route:
            project_id, revision = project_route
            if revision is None:
                self.get_project(project_id)
            elif revision == -1:
                self.list_project_revisions(project_id)
            else:
                self.get_project_revision(project_id, revision)
            return
        if path.startswith("/api/"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        super().do_GET()

    def do_PUT(self) -> None:  # noqa: N802 - stdlib handler API
        path = urlparse(self.path).path
        project_route = self.project_route(path)
        if project_route and project_route[1] is None:
            self.put_project(project_route[0])
            return
        if path != "/api/recovery/autosave":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "invalid_body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            project_json = payload["json"]
            if not isinstance(project_json, str):
                raise TypeError("json must be a string")
            encoded = project_json.encode("utf-8")
            if len(encoded) > MAX_BODY_BYTES:
                raise ValueError("project is too large")
            project = json.loads(project_json)
            if not isinstance(project, dict) or not isinstance(project.get("diagrams"), list):
                raise ValueError("invalid project root")
            saved_at = int(payload.get("savedAt") or time.time() * 1000)
            project_version = int(payload.get("projectVersion") or project.get("version") or 0)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_project", "detail": str(error)})
            return

        try:
            with self.database() as connection:
                connection.execute("BEGIN IMMEDIATE")
                current = connection.execute(
                    "SELECT project_json, saved_at, project_version, byte_length FROM project_recovery WHERE id = ?",
                    (AUTOSAVE_KEY,),
                ).fetchone()
                if current is not None and current["project_json"] != project_json:
                    connection.execute(
                        """
                        INSERT INTO project_recovery
                            (id, project_json, saved_at, project_version, byte_length)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            project_json = excluded.project_json,
                            saved_at = excluded.saved_at,
                            project_version = excluded.project_version,
                            byte_length = excluded.byte_length
                        """,
                        (
                            PREVIOUS_KEY,
                            current["project_json"],
                            current["saved_at"],
                            current["project_version"],
                            current["byte_length"],
                        ),
                    )
                connection.execute(
                    """
                    INSERT INTO project_recovery
                        (id, project_json, saved_at, project_version, byte_length)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        project_json = excluded.project_json,
                        saved_at = excluded.saved_at,
                        project_version = excluded.project_version,
                        byte_length = excluded.byte_length
                    """,
                    (AUTOSAVE_KEY, project_json, saved_at, project_version, len(encoded)),
                )
        except sqlite3.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "database_error", "detail": str(error)})
            return
        self.send_json(HTTPStatus.OK, {"ok": True, "savedAt": saved_at, "backend": "sqlite"})

    def do_PATCH(self) -> None:  # noqa: N802 - stdlib handler API
        project_route = self.project_route(urlparse(self.path).path)
        if not project_route or project_route[1] is not None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        self.patch_project(project_route[0])

    def do_DELETE(self) -> None:  # noqa: N802 - stdlib handler API
        project_route = self.project_route(urlparse(self.path).path)
        if not project_route or project_route[1] is not None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        self.delete_project(project_route[0])

    def end_headers(self) -> None:
        if not urlparse(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class UMLStudioServer(ThreadingHTTPServer):
    """Threaded server with an injected database and static-file root."""

    daemon_threads = True
    # The stdlib listen backlog is 5. A browser opening the app fires dozens of
    # connections at once, and on macOS an overflowed backlog resets them
    # (ERR_CONNECTION_RESET) instead of queueing, so random scripts failed to
    # load whenever the machine was busy.
    request_queue_size = 128

    def __init__(
        self,
        server_address: tuple[str, int],
        db_path: Path,
        directory: Path = ROOT,
        handler_class: type[UMLStudioHandler] = UMLStudioHandler,
    ) -> None:
        self.db_path = db_path.expanduser().resolve()
        self.static_directory = directory.expanduser().resolve()
        self.journal_mode = initialize_database(self.db_path)
        handler = partial(handler_class, directory=str(self.static_directory))
        super().__init__(server_address, handler)


def create_server(
    host: str = "127.0.0.1",
    port: int = 8000,
    db_path: Path = ROOT / "uml-studio.db",
    directory: Path = ROOT,
    handler_class: type[UMLStudioHandler] = UMLStudioHandler,
) -> UMLStudioServer:
    """Build a server without starting it, allowing isolated test instances."""

    return UMLStudioServer((host, port), db_path, directory, handler_class)


def open_editor_in_browser(url: str) -> None:
    try:
        if webbrowser.open(url, new=2):
            return
    except (OSError, webbrowser.Error):
        pass
    print(f"Open {url} in your browser.", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run UML Studio with SQLite autosave")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", type=Path, default=ROOT / "uml-studio.db")
    parser.add_argument("--open-browser", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--static-only", action="store_true", help="serve editor assets without starting SQLite")
    args = parser.parse_args()
    server = (
        ThreadingHTTPServer((args.host, args.port), EditorAssetHandler)
        if args.static_only
        else create_server(args.host, args.port, args.db)
    )
    browser_host = "127.0.0.1" if args.host in ("", "0.0.0.0") else args.host
    url = f"http://{browser_host}:{server.server_port}"
    print(f"UML Studio: {url}", flush=True)
    if isinstance(server, UMLStudioServer):
        print(f"SQLite DB: {server.db_path}")
        print(f"SQLite journal: {server.journal_mode}", flush=True)
    try:
        if args.open_browser:
            Thread(target=open_editor_in_browser, args=(url,), daemon=True).start()
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
