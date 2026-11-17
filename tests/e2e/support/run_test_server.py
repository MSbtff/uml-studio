#!/usr/bin/env python3
"""Run UML Studio on an ephemeral port with an auto-deleted SQLite database."""

from __future__ import annotations

import json
import signal
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from server import ROOT, create_server


def interrupt_server(_signum: int, _frame: object) -> None:
    raise KeyboardInterrupt


def main() -> None:
    signal.signal(signal.SIGTERM, interrupt_server)
    signal.signal(signal.SIGINT, interrupt_server)
    with TemporaryDirectory(prefix="uml-studio-e2e-") as runtime_directory:
        database = Path(runtime_directory) / "uml-studio-e2e.db"
        server = create_server(port=0, db_path=database, directory=ROOT)
        host, port = server.server_address
        print(json.dumps({"url": f"http://{host}:{port}", "database": database.name}), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
