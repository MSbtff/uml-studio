"""HTTP integration tests for SQLite project storage.

Every test starts an actual threaded UML Studio server on an ephemeral port and
injects a database under TemporaryDirectory. The workspace's uml-studio.db is
never opened or modified.
"""

from __future__ import annotations

import http.client
import json
import socket
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from http import HTTPStatus
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import (
    MAX_BODY_BYTES,
    REVISION_LIMIT,
    UMLStudioHandler,
    create_server,
    database_journal_mode,
    wal_reset_fix_available,
)


class QuietHandler(UMLStudioHandler):
    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass


class StorageServerTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(prefix="uml-studio-storage-test-")
        self.temp_root = Path(self.temporary_directory.name)
        self.db_path = self.temp_root / "isolated.db"
        browser_build = self.temp_root / "dist" / "browser"
        browser_build.mkdir(parents=True)
        (self.temp_root / "index.html").write_text("<!doctype html><title>UML Studio</title>", encoding="utf-8")
        (self.temp_root / "styles.css").touch()
        (browser_build / "app.js").touch()
        self.server = create_server(
            "127.0.0.1",
            0,
            self.db_path,
            directory=self.temp_root,
            handler_class=QuietHandler,
        )
        host, port = self.server.server_address[:2]
        self.base_url = f"http://{host}:{port}"
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=5)
        self.temporary_directory.cleanup()

    def request(
        self,
        method: str,
        path: str,
        payload: object | None = None,
        *,
        raw_body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict, str]:
        body = raw_body
        request_headers = {"Accept": "application/json", **(headers or {})}
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        request = Request(
            f"{self.base_url}{path}",
            data=body,
            headers=request_headers,
            method=method,
        )
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "")
            parsed = json.loads(raw.decode("utf-8")) if raw else {}
            return response.status, parsed, content_type

    @staticmethod
    def project_json(project_id: str, name: str, marker: int = 0) -> str:
        return json.dumps(
            {
                "version": 30,
                "projectId": project_id,
                "projectName": name,
                "models": {"marker": {"id": "marker", "kind": "note", "name": str(marker)}},
                "diagrams": [],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    def save_payload(
        self,
        project_id: str,
        name: str,
        marker: int,
        expected_revision: int | None = None,
    ) -> dict:
        payload = {
            "json": self.project_json(project_id, name, marker),
            "name": name,
            "savedAt": 1_700_000_000_000 + marker,
            "projectVersion": 30,
        }
        if expected_revision is not None:
            payload["expectedRevision"] = expected_revision
        return payload

    def test_uses_only_injected_temporary_database(self) -> None:
        status, health, content_type = self.request("GET", "/api/health")

        self.assertEqual(status, HTTPStatus.OK)
        self.assertIn("application/json", content_type)
        self.assertEqual(Path(self.server.db_path), self.db_path.resolve())
        self.assertTrue(str(self.server.db_path).startswith(str(self.temp_root.resolve())))
        self.assertEqual(health["database"], "isolated.db")
        self.assertEqual(health["journalMode"], database_journal_mode().lower())
        self.assertEqual(health["sqliteVersion"], sqlite3.sqlite_version)
        self.assertTrue(self.db_path.exists())

    def test_disallows_http_access_to_private_storage_files(self) -> None:
        sidecars = [f"{self.db_path.name}{suffix}" for suffix in ("-wal", "-shm", "-journal")]
        for name in sidecars:
            (self.temp_root / name).touch()

        for name in [self.db_path.name, *sidecars]:
            for method in ("GET", "HEAD"):
                with self.subTest(name=name, method=method):
                    request = Request(f"{self.base_url}/{name}", method=method)
                    with self.assertRaises(HTTPError) as failure:
                        urlopen(request, timeout=10)
                    with failure.exception as response:
                        self.assertEqual(response.code, HTTPStatus.NOT_FOUND)

        for asset in ("/", "/styles.css?v=1", "/dist/browser/app.js"):
            with self.subTest(asset=asset), urlopen(f"{self.base_url}{asset}", timeout=10) as response:
                self.assertEqual(response.status, HTTPStatus.OK)

    def test_create_list_read_rename_delete_and_revision_cascade(self) -> None:
        project_id = "p-crud"
        project_json = self.project_json(project_id, "처음 프로젝트", 1)
        status, created, _ = self.request(
            "PUT",
            f"/api/projects/{project_id}",
            {
                "json": project_json,
                "name": "처음 프로젝트",
                "savedAt": 1_700_000_000_001,
                "projectVersion": 30,
            },
        )
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(created["revision"], 1)
        self.assertEqual(created["byteLength"], len(project_json.encode("utf-8")))

        status, listed, _ = self.request("GET", "/api/projects")
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual([item["id"] for item in listed["projects"]], [project_id])

        status, loaded, _ = self.request("GET", f"/api/projects/{project_id}")
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(loaded["json"], project_json)
        self.assertEqual(loaded["name"], "처음 프로젝트")

        status, renamed, _ = self.request("PATCH", f"/api/projects/{project_id}", {"name": "이름 변경"})
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(renamed["name"], "이름 변경")
        self.assertEqual(renamed["revision"], 1, "이름 변경은 모델 내용 revision을 만들지 않는다")

        status, revisions, _ = self.request("GET", f"/api/projects/{project_id}/revisions")
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual([item["revision"] for item in revisions["revisions"]], [1])

        status, deleted, _ = self.request("DELETE", f"/api/projects/{project_id}")
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(deleted, {"ok": True, "id": project_id})
        self.assertEqual(self.request("GET", f"/api/projects/{project_id}")[0], HTTPStatus.NOT_FOUND)
        with closing(sqlite3.connect(self.db_path)) as connection:
            revision_count = connection.execute(
                "SELECT COUNT(*) FROM project_revisions WHERE project_id = ?",
                (project_id,),
            ).fetchone()[0]
        self.assertEqual(revision_count, 0, "프로젝트 삭제는 revision도 연쇄 삭제해야 한다")

    def test_concurrent_tabs_allow_one_writer_and_reject_stale_revision(self) -> None:
        project_id = "p-concurrent"
        self.assertEqual(
            self.request("PUT", f"/api/projects/{project_id}", self.save_payload(project_id, "Base", 1))[1]["revision"],
            1,
        )
        barrier = threading.Barrier(2)

        def save_from_tab(marker: int) -> tuple[int, dict, str]:
            barrier.wait(timeout=5)
            return self.request(
                "PUT",
                f"/api/projects/{project_id}",
                self.save_payload(project_id, f"Tab {marker}", marker, expected_revision=1),
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(save_from_tab, (2, 3)))

        self.assertEqual(sorted(result[0] for result in results), [HTTPStatus.OK, HTTPStatus.CONFLICT])
        conflict = next(result[1] for result in results if result[0] == HTTPStatus.CONFLICT)
        winner = next(result[1] for result in results if result[0] == HTTPStatus.OK)
        self.assertEqual(
            conflict,
            {
                "error": "revision_conflict",
                "expectedRevision": 1,
                "actualRevision": 2,
            },
        )
        self.assertEqual(winner["revision"], 2)

        status, loaded, _ = self.request("GET", f"/api/projects/{project_id}")
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(loaded["revision"], 2)
        self.assertIn(loaded["name"], {"Tab 2", "Tab 3"})

    def test_keeps_ten_revisions_and_can_restore_an_older_snapshot(self) -> None:
        project_id = "p-history"
        for revision in range(1, 13):
            status, saved, _ = self.request(
                "PUT",
                f"/api/projects/{project_id}",
                self.save_payload(
                    project_id,
                    f"Revision {revision}",
                    revision,
                    expected_revision=revision - 1 if revision > 1 else None,
                ),
            )
            self.assertEqual(status, HTTPStatus.OK)
            self.assertEqual(saved["revision"], revision)

        status, history, _ = self.request("GET", f"/api/projects/{project_id}/revisions")
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(len(history["revisions"]), REVISION_LIMIT)
        self.assertEqual([item["revision"] for item in history["revisions"]], list(range(12, 2, -1)))
        self.assertEqual(
            self.request("GET", f"/api/projects/{project_id}/revisions/2")[0],
            HTTPStatus.NOT_FOUND,
        )

        status, old_snapshot, _ = self.request("GET", f"/api/projects/{project_id}/revisions/3")
        self.assertEqual(status, HTTPStatus.OK)
        old_project = json.loads(old_snapshot["json"])
        self.assertEqual(old_project["projectName"], "Revision 3")

        status, restored, _ = self.request(
            "PUT",
            f"/api/projects/{project_id}",
            {
                "json": old_snapshot["json"],
                "name": "Revision 3",
                "savedAt": 1_700_000_000_013,
                "projectVersion": 30,
                "expectedRevision": 12,
            },
        )
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(restored["revision"], 13)
        current = self.request("GET", f"/api/projects/{project_id}")[1]
        self.assertEqual(current["json"], old_snapshot["json"])

        # Retrying the exact restored content is idempotent even with the now-stale expectation.
        status, repeated, _ = self.request(
            "PUT",
            f"/api/projects/{project_id}",
            {
                "json": old_snapshot["json"],
                "name": "Revision 3",
                "expectedRevision": 12,
            },
        )
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(repeated["revision"], 13)

    def test_legacy_autosave_preserves_previous_different_snapshot(self) -> None:
        first_json = self.project_json("p-autosave", "First", 1)
        second_json = self.project_json("p-autosave", "Second", 2)

        status, first, _ = self.request(
            "PUT",
            "/api/recovery/autosave",
            {
                "json": first_json,
                "savedAt": 100,
                "projectVersion": 30,
            },
        )
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(first["backend"], "sqlite")
        self.assertEqual(self.request("GET", "/api/recovery/previous")[0], HTTPStatus.NOT_FOUND)

        self.assertEqual(
            self.request(
                "PUT",
                "/api/recovery/autosave",
                {
                    "json": second_json,
                    "savedAt": 200,
                    "projectVersion": 30,
                },
            )[0],
            HTTPStatus.OK,
        )
        self.assertEqual(self.request("GET", "/api/recovery/autosave")[1]["json"], second_json)
        self.assertEqual(self.request("GET", "/api/recovery/previous")[1]["json"], first_json)

        # Saving identical content must not replace the previous distinct recovery point.
        self.assertEqual(
            self.request(
                "PUT",
                "/api/recovery/autosave",
                {
                    "json": second_json,
                    "savedAt": 300,
                    "projectVersion": 30,
                },
            )[0],
            HTTPStatus.OK,
        )
        self.assertEqual(self.request("GET", "/api/recovery/previous")[1]["json"], first_json)

    def test_rejects_malformed_mismatched_and_oversized_projects(self) -> None:
        invalid_requests = [
            (None, b"{", {"Content-Type": "application/json"}),
            ({"json": "{"}, None, None),
            ({"json": {"diagrams": []}}, None, None),
            ({"json": json.dumps({"version": 30, "diagrams": {}})}, None, None),
            (
                {
                    "json": self.project_json("another-project", "Mismatch"),
                    "name": "Mismatch",
                },
                None,
                None,
            ),
        ]
        for payload, raw_body, headers in invalid_requests:
            with self.subTest(payload=payload, raw_body=raw_body):
                status, detail, content_type = self.request(
                    "PUT",
                    "/api/projects/p-invalid",
                    payload,
                    raw_body=raw_body,
                    headers=headers,
                )
                self.assertEqual(status, HTTPStatus.BAD_REQUEST)
                self.assertEqual(detail["error"], "invalid_project")
                self.assertIn("application/json", content_type)

        status, detail, _ = self.request(
            "PUT",
            "/api/projects/p-too-large",
            raw_body=b"{}",
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(MAX_BODY_BYTES + 1),
            },
        )
        self.assertEqual(status, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        self.assertEqual(detail["error"], "payload_too_large")

        status, detail, _ = self.request(
            "PUT",
            "/api/recovery/autosave",
            raw_body=b"{}",
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(MAX_BODY_BYTES + 1),
            },
        )
        self.assertEqual(status, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        self.assertEqual(detail["error"], "invalid_body_size")

    def test_missing_resources_and_unknown_api_routes_return_json(self) -> None:
        checks = [
            ("GET", "/api/projects/missing", None, "project_not_found"),
            ("GET", "/api/projects/missing/revisions/1", None, "revision_not_found"),
            ("PATCH", "/api/projects/missing", {"name": "Nope"}, "project_not_found"),
            ("DELETE", "/api/projects/missing", None, "project_not_found"),
            ("GET", "/api/projects/bad%20id", None, "not_found"),
            ("GET", "/api/unknown", None, "not_found"),
        ]
        for method, path, payload, expected_error in checks:
            with self.subTest(method=method, path=path):
                status, detail, content_type = self.request(method, path, payload)
                self.assertEqual(status, HTTPStatus.NOT_FOUND)
                self.assertEqual(detail["error"], expected_error)
                self.assertIn("application/json", content_type)

    def test_keeps_connections_alive_and_survives_a_browser_sized_burst(self) -> None:
        """A page load fires ~60 requests at once; the stdlib backlog of 5 reset them."""
        self.assertEqual(UMLStudioHandler.protocol_version, "HTTP/1.1")
        self.assertGreaterEqual(type(self.server).request_queue_size, 64)

        host, port = self.server.server_address[:2]
        with closing(socket.create_connection((host, port), timeout=5)) as sock:
            for _ in range(2):
                sock.sendall(b"GET /api/health HTTP/1.1\r\nHost: x\r\nAccept: application/json\r\n\r\n")
                response = http.client.HTTPResponse(sock)
                response.begin()
                self.assertEqual(response.status, HTTPStatus.OK)
                self.assertIn(b'"ok":true', response.read())
                self.assertNotEqual(response.getheader("Connection", "").lower(), "close")

            # an error response may leave an unread body behind, so it must close
            sock.sendall(
                b"PUT /api/projects/burst HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n"
                b"Content-Length: 99999999\r\n\r\n"
            )
            response = http.client.HTTPResponse(sock)
            response.begin()
            self.assertEqual(response.status, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            self.assertEqual(response.getheader("Connection", "").lower(), "close")
            response.read()

        def fetch(path: str) -> int:
            with closing(urlopen(f"{self.base_url}{path}", timeout=10)) as reply:
                reply.read()
                return reply.status

        paths = ["/index.html", "/dist/browser/app.js", "/styles.css", "/api/health"] * 20
        with ThreadPoolExecutor(max_workers=40) as pool:
            statuses = list(pool.map(fetch, paths))
        self.assertEqual(statuses, [HTTPStatus.OK] * len(paths))


class JournalPolicyTestCase(unittest.TestCase):
    def test_wal_is_used_only_by_versions_with_the_reset_fix(self) -> None:
        vulnerable = [(3, 44, 5), (3, 49, 2), (3, 50, 4), (3, 51, 2)]
        fixed = [(3, 44, 6), (3, 50, 7), (3, 51, 3), (3, 52, 0)]
        for version in vulnerable:
            with self.subTest(version=version):
                self.assertFalse(wal_reset_fix_available(version))
                self.assertEqual(database_journal_mode(version), "DELETE")
        for version in fixed:
            with self.subTest(version=version):
                self.assertTrue(wal_reset_fix_available(version))
                self.assertEqual(database_journal_mode(version), "WAL")


if __name__ == "__main__":
    unittest.main()
