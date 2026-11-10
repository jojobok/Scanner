"""Loopback-only Scanner Studio preview server.

Run from repository root: python -m studio.server
No API keys, paid calls, or production rendering.
"""
from __future__ import annotations

import datetime as dt
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from parasha_video.config import Style
from parasha_video.grok import mock_script
from parasha_video.parasha import Parasha, next_shabbat

ROOT = Path(__file__).resolve().parent
MAX_BODY = 4096


def preview_script(portion: str) -> dict:
    portion = portion.strip().removeprefix("פרשת").strip()
    if not portion or len(portion) > 60:
        raise ValueError("שם הפרשה חייב להכיל 1 עד 60 תווים")
    if not all(c.isalpha() or c.isspace() or c in "'״׳-" for c in portion):
        raise ValueError("שם הפרשה מכיל תווים לא חוקיים")
    today = dt.date.today()
    parasha = Parasha(portion, portion, next_shabbat(today), "manual")
    script = mock_script(parasha, Style())
    return {"parasha": portion, "title": script["title"],
            "scenes": [{"narration": sc["narration"], "image_prompt": sc["image_prompt"],
                        "approved": False} for sc in script["scenes"]],
            "demo": True}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, value: dict) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "mode": "demo-only"})
        if path == "/":
            path = "/index.html"
        allowed = {"/index.html": "text/html; charset=utf-8",
                   "/studio.js": "text/javascript; charset=utf-8",
                   "/requests.js": "text/javascript; charset=utf-8",
                   "/grok.js": "text/javascript; charset=utf-8",
                   "/media.js": "text/javascript; charset=utf-8",
                   "/cloud.js": "text/javascript; charset=utf-8",
                   "/assemble.js": "text/javascript; charset=utf-8",
                   "/manifest.webmanifest": "application/manifest+json"}
        if path not in allowed:
            return self.send_error(404)
        body = (ROOT / path.lstrip("/")).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", allowed[path])
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/demo-script":
            return self.send_json(404, {"error": "Not found"})
        origin = self.headers.get("Origin")
        expected = f"http://127.0.0.1:{self.server.server_port}"
        if origin and origin != expected:
            return self.send_json(403, {"error": "Invalid origin"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.send_json(415, {"error": "Expected JSON"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_BODY:
                return self.send_json(413, {"error": "Invalid request size"})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or not isinstance(data.get("portion"), str):
                raise ValueError("Missing portion")
            return self.send_json(200, preview_script(data["portion"]))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self.send_json(400, {"error": str(exc)})


def main() -> None:
    with ThreadingHTTPServer(("127.0.0.1", 8765), Handler) as server:
        print("Scanner Studio demo: http://127.0.0.1:8765")
        server.serve_forever()


if __name__ == "__main__":
    main()
