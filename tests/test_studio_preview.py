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
