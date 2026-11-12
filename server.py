"""Zero-dependency local server for the simulated cockpit and QA runner."""

from __future__ import annotations

import json
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import android_bridge
from cockpit import Cockpit
from qa import QARunner

ROOT = Path(__file__).resolve().parent
COCKPIT = Cockpit()
QA = QARunner(COCKPIT)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def _json(self, payload, status=200, download=False):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if download:
            self.send_header("Content-Disposition", 'attachment; filename="cockpit-qa-report.json"')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            return self._json(COCKPIT.snapshot())
        if path == "/api/report":
            return self._json(QA.report())
        if path == "/api/report/download":
            return self._json(QA.report(), download=True)
        if path == "/api/android/status":
            return self._json(android_bridge.status())
        if path == "/api/android/screen":
            try:
                body = android_bridge.screenshot()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
                self._json({"error": str(exc)}, 503)
            return
        if path == "/health":
            return self._json({"status": "ok"})
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in {"/api/events", "/api/scenarios", "/api/android/tap"}:
            return self._json({"error": "Unknown endpoint"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 4096:
                return self._json({"error": "Request too large"}, 413)
            body = json.loads(self.rfile.read(length) or b"{}")
            if path == "/api/android/tap":
                android_bridge.tap(int(body.get("x")), int(body.get("y")))
                return self._json({"ok": True})
            if path == "/api/events":
                if QA.report()["status"] == "running":
                    return self._json({"error": "Controls are locked during a test"}, 409)
                event = body.get("event")
                state = COCKPIT.dispatch(event, body.get("value"))
                if event == "speed_set" and android_bridge.status()["online"]:
                    try:
                        state["aaos_vhal"] = android_bridge.inject_speed(state["speed_kmh"])
                    except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
                        state["aaos_vhal_error"] = str(exc)
                return self._json(state)
            return self._json(QA.start(body.get("scenario"), bool(body.get("inject_fault", False))))
        except (ValueError, TypeError, json.JSONDecodeError, RuntimeError, subprocess.SubprocessError) as exc:
            return self._json({"error": str(exc)}, 400)


def main():
    host, port = "127.0.0.1", 8765
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Cockpit QA Lab: http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
