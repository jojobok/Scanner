"""Tests for the offline studio-to-engine preview bridge."""
import unittest
from studio.server import preview_script


class StudioPreviewTests(unittest.TestCase):
    def test_demo_script_uses_existing_engine(self):
        result = preview_script("וירא")
        self.assertTrue(result["demo"])
        self.assertEqual(result["parasha"], "וירא")
        self.assertEqual(len(result["scenes"]), 6)
        self.assertTrue(all("image_prompt" in scene for scene in result["scenes"]))
        self.assertTrue(all(scene["approved"] is False for scene in result["scenes"]))

    def test_invalid_portion_rejected(self):
        for portion in ("", "../secret", "a" * 61):
            with self.subTest(portion=portion):
                with self.assertRaises(ValueError):
                    preview_script(portion)


if __name__ == "__main__":
    unittest.main()


class StudioServerFilesTests(unittest.TestCase):
    """Every script and file that studio/index.html loads must be served by studio/server.py."""

    def test_server_serves_every_file_the_page_loads(self):
        import re
        import threading
        import urllib.request
        from http.server import ThreadingHTTPServer
        from studio.server import ROOT, Handler

        html = (ROOT / "index.html").read_text(encoding="utf-8")
        refs = sorted(set(re.findall(r'(?:src|href)="\./([^"]+)"', html)))
        self.assertIn("requests.js", refs)
        self.assertIn("grok.js", refs)
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for ref in refs:
                with self.subTest(file=ref):
                    url = f"http://127.0.0.1:{server.server_port}/{ref}"
                    with urllib.request.urlopen(url) as resp:
                        self.assertEqual(resp.status, 200)
        finally:
            server.shutdown()
            server.server_close()
