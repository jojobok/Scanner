"""Regression tests for offline, non-destructive Scanner behavior.

Run: python -m unittest discover -s tests -v
No API credentials, network calls, or media generation are required.
"""
import tempfile
import unittest
from pathlib import Path

from parasha_video.config import Style, load_style
from parasha_video.parasha import next_shabbat
from parasha_video.render import _chunks, _esc, _ts
import datetime as dt
import json


class ConfigTests(unittest.TestCase):
    def test_defaults_are_vertical_and_text_free(self):
        style = Style()
        self.assertEqual((style.width, style.height), (720, 1280))
        self.assertFalse(style.show_captions)
        self.assertFalse(style.show_titles)

    def test_style_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "style.json"
            path.write_text(json.dumps({"fps": 30, "show_captions": True}), encoding="utf-8")
            style = load_style(str(path))
            self.assertEqual(style.fps, 30)
            self.assertTrue(style.show_captions)
            self.assertEqual(style.width, 720)

    def test_unknown_style_option_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "style.json"
            path.write_text('{"unknown_setting": true}', encoding="utf-8")
            with self.assertRaises(ValueError):
                load_style(str(path))


class TimelineHelpersTests(unittest.TestCase):
    def test_next_shabbat(self):
        self.assertEqual(next_shabbat(dt.date(2026, 11, 2)), dt.date(2026, 11, 7))
        self.assertEqual(next_shabbat(dt.date(2026, 11, 7)), dt.date(2026, 11, 7))

    def test_caption_chunks(self):
        self.assertEqual(_chunks("one two three four five", 2),
                         ["one two", "three four", "five"])

    def test_ass_escaping(self):
        self.assertEqual(_esc("a{b}\\c\nd"), "a(b)cd")

    def test_timestamp(self):
        self.assertEqual(_ts(65.25), "0:01:05.25")


if __name__ == "__main__":
    unittest.main()
