"""חיבור ל-Grok (xAI): כתיבת תסריט + יצירת תמונות. כולל מצב הדגמה ללא מפתח."""
from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path

import requests

from . import prompts
from .config import ApiConfig, Style
from .parasha import Parasha


class GrokError(RuntimeError):
    pass


def _parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise GrokError(f"גרוק לא החזיר JSON תקין:\n{text[:500]}")
        return json.loads(m.group(0))


class GrokClient:
    def __init__(self, api: ApiConfig):
        if not api.xai_api_key:
            raise GrokError("חסר XAI_API_KEY (ראו .env.example)")
        self.api = api
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {api.xai_api_key}"})

    def _post(self, path: str, payload: dict, timeout: int = 180) -> dict:
        url = f"{self.api.xai_base_url.rstrip('/')}/{path.lstrip('/')}"
        for attempt in range(4):
            r = self.s.post(url, json=payload, timeout=timeout)
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** (attempt + 1))
                continue
            if r.status_code >= 400:
                raise GrokError(f"xAI {r.status_code}: {r.text[:500]}")
            return r.json()
        raise GrokError("xAI: יותר מדי ניסיונות כושלים")

    def chat_json(self, user: str, temperature: float = 0.8) -> dict:
        data = self._post("chat/completions", {
            "model": self.api.text_model,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": prompts.SYSTEM},
                {"role": "user", "content": user},
            ],
        })
        return _parse_json(data["choices"][0]["message"]["content"])

    def find_theme(self, p: Parasha, style: Style) -> dict:
        return self.chat_json(prompts.theme_prompt(p, style))

    def write_script(self, p: Parasha, theme: dict, style: Style) -> dict:
        return self.chat_json(prompts.script_prompt(p, theme, style), temperature=0.9)

    def image(self, prompt: str, out: Path) -> Path:
        data = self._post("images/generations", {
            "model": self.api.image_model,
            "prompt": prompt,
            "n": 1,
            "response_format": "b64_json",
        })
        item = data["data"][0]
        if item.get("b64_json"):
            out.write_bytes(base64.b64decode(item["b64_json"]))
        else:
            r = requests.get(item["url"], timeout=120)
            r.raise_for_status()
            out.write_bytes(r.content)
        return out


# ---------------------------------------------------------------------------
# מצב הדגמה - מאפשר להריץ את כל הצנרת (כולל רינדור וידאו) בלי מפתח API
# ---------------------------------------------------------------------------

def mock_theme(p: Parasha) -> dict:
    return {
        "candidates": [{
            "title": f"הנושא המרכזי של {p.title_he} (הדגמה)",
            "summary": "זהו טקסט הדגמה. עם מפתח XAI_API_KEY גרוק יבחר כאן את הנושא האמיתי.",
            "anchor_verse": "—",
            "life_message": "כל צעד קטן של אמונה בונה עולם.",
        }],
        "chosen_index": 0,
        "why_chosen": "מצב הדגמה",
    }


def mock_script(p: Parasha, style: Style) -> dict:
    lines = [
        ("מה עושים כשהכל נראה תקוע?", "שאלה אחת", "a lone traveler on a desert path at dawn, seen from behind"),
        (f"ב{p.title_he} התורה מלמדת אותנו משהו עמוק.", p.title_he, "ancient tents in a desert valley at golden hour"),
        ("לפעמים הדרך ארוכה, והתשובה לא נראית באופק.", "הדרך ארוכה", "a long winding road through rocky hills, haze"),
        ("אבל דווקא שם, בצעד הקטן, מתחיל השינוי.", "צעד קטן", "close-up of sandaled feet stepping forward on stones"),
        ("אמונה היא לא לראות את כל הדרך, אלא לעשות את הצעד הבא.", "הצעד הבא", "rays of light breaking through clouds over hills"),
        (f"השבת, קחו איתכם צעד אחד קטן של טוב. {style.outro_text}.", style.outro_text, "shabbat candles glowing on a wooden table, warm light"),
    ]
    return {
        "title": f"{p.title_he} בדקה",
        "hook": lines[0][0],
        "scenes": [
            {"narration": n, "on_screen_text": t, "image_prompt": f"{ip}, {style.visual_style}"}
            for n, t, ip in lines
        ],
        "caption": f"{p.title_he} - מסר קצר לשבת. (הדגמה)",
        "hashtags": ["#פרשת_השבוע", f"#{p.name_he.replace(' ', '_')}", "#שבת_שלום"],
        "sources": [],
    }
