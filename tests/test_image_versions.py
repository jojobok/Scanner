"""Offline tests for safe image regeneration and version history."""
import tempfile
import unittest
from pathlib import Path

from parasha_video.image_versions import replace_scene_image


class ImageVersionTests(unittest.TestCase):
    def test_existing_media_and_provenance_are_archived(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "scene_01.jpg"
            old.write_bytes(b"original image")
            source = root / "scene_01.source.txt"
            source.write_text("old prompt", encoding="utf-8")

            def generate(path):
                path.write_bytes(b"new image")

            result = replace_scene_image(root, "scene_01", [old], source,
                                         "new prompt", generate)
            self.assertEqual(result.read_bytes(), b"new image")
            self.assertFalse(old.exists())
            self.assertEqual(source.read_text(encoding="utf-8"), "new prompt")
            backups = list((root / "versions" / "scene_01").glob("*/scene_01.jpg"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), b"original image")
            self.assertEqual((backups[0].parent / source.name).read_text(encoding="utf-8"),
                             "old prompt")

    def test_generation_failure_preserves_originals(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "scene_01.png"
            old.write_bytes(b"original")
            source = root / "scene_01.source.txt"
            source.write_text("old", encoding="utf-8")

            def generate(path):
                path.write_bytes(b"partial")
                raise RuntimeError("generation failed")

            with self.assertRaisesRegex(RuntimeError, "generation failed"):
                replace_scene_image(root, "scene_01", [old], source, "new", generate)
            self.assertEqual(old.read_bytes(), b"original")
            self.assertEqual(source.read_text(encoding="utf-8"), "old")
            self.assertFalse(list(root.glob("*.pending.png")))

    def test_empty_generated_file_does_not_replace_existing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "scene_01.png"
            old.write_bytes(b"original")
            with self.assertRaisesRegex(RuntimeError, "no usable file"):
                replace_scene_image(root, "scene_01", [old],
                                    root / "scene_01.source.txt", "new",
                                    lambda path: path.touch())
            self.assertEqual(old.read_bytes(), b"original")


if __name__ == "__main__":
    unittest.main()
