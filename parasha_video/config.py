"""הגדרות כלליות + "סגנון" הסרטון.

את הסגנון אפשר לשנות בלי לגעת בקוד: יוצרים קובץ style.json (ראו style.example.json)
ומעבירים אותו עם --style. כל מפתח שמופיע בקובץ דורס את ברירת המחדל שכאן.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class Style:
    # --- וידאו ---
    width: int = 1080
    height: int = 1920            # אנכי 9:16 (רילס / שורטס / טיקטוק)
    fps: int = 24
    max_seconds: float = 90.0     # תקרה קשיחה - דקה וחצי
    target_seconds: float = 72.0  # היעד שגרוק מקבל לכתיבת התסריט (הסרטון לדוגמה: 74 שנ')
    scenes_min: int = 12
    scenes_max: int = 16          # בסרטון לדוגמה ~15 תמונות, ~5 שניות כל אחת
    ken_burns_zoom: float = 1.07  # זום איטי ועדין
    transition: str = "fade"      # מעבר בין תמונות (xfade): fade / dissolve / fadeblack / none
    transition_seconds: float = 1.0
    final_hold_seconds: float = 2.5  # השהייה על התמונה האחרונה (כמו הנר בסוף הסרטון לדוגמה)

    # --- סגנון ויזואלי (מועבר לגרוק כדי שכל פרומפטי התמונות יהיו אחידים) ---
    visual_style: str = (
        "hyper-realistic cinematic film still, ancient biblical-era Middle East desert, "
        "dramatic sky with crepuscular god rays bursting through clouds, golden-hour backlight, "
        "warm amber and deep teal color grade, floating dust and haze, high detail skin and fabric textures, "
        "weathered robes, epic yet intimate, shallow depth of field, 35mm lens, vertical 9:16 portrait composition"
    )
    # רגישות דתית - נשלח לגרוק כהנחיה לכל פרומפט תמונה
    image_rules: str = (
        "Never depict God in any form (use light, rays, clouds or fire instead). "
        "Keep every recurring character visually identical across all scenes (same face, age, beard, clothing colors). "
        "No text, letters or watermarks in the image. Modest clothing, no gore, no idols glorified."
    )
    image_fit: str = "cover"      # cover = חיתוך למילוי המסך, blur = התמונה במרכז על רקע מטושטש

    # --- טון וכתיבה ---
    tone: str = (
        "סיפורי וקולנועי: מספרים את סיפור הפרשה כרצף תמונות, כמו טריילר. "
        "פתיחה חזקה, סיפור שזורם לפי סדר האירועים, ובסוף מסר אחד שנוגע ללב ומתחבר לחיים שלנו היום. "
        "משפטים קצרים, עברית יפה ופשוטה."
    )
    audience: str = "קהל ישראלי רחב, דתיים ומסורתיים, צופים ברשתות חברתיות"
    language: str = "he"

    # --- קריינות ---
    tts_voice: str = "he-IL-AvriNeural"   # קול גברי. קול נשי: he-IL-HilaNeural
    tts_rate: str = "+0%"

    # --- טקסט על המסך (בסרטון לדוגמה אין בכלל טקסט - לכן כבוי כברירת מחדל) ---
    show_captions: bool = False           # כתוביות של הקריינות
    show_titles: bool = False             # כותרת גדולה לכל סצנה
    font_name: str = "DejaVu Sans"
    font_size: int = 74
    title_font_size: int = 92
    text_color: str = "&H00FFFFFF"        # ASS: &HAABBGGRR - לבן
    highlight_color: str = "&H0000D7FF"   # זהב
    outline_color: str = "&H00000000"
    subtitle_margin_v: int = 380          # מרחק הכתוביות מתחתית המסך
    words_per_caption: int = 4

    # --- מוזיקת רקע (אופציונלי) ---
    music_path: str = ""
    music_volume: float = 0.12

    # --- מיתוג ---
    outro_text: str = "שבת שלום"
    watermark: str = ""                   # למשל שם העמוד שלך


def load_style(path: str | None) -> Style:
    style = Style()
    if path:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        known = set(asdict(style))
        for k, v in data.items():
            if k.startswith("_"):
                continue
            if k not in known:
                raise ValueError(f"מפתח לא מוכר בקובץ הסגנון: {k}")
            setattr(style, k, v)
    return style


@dataclass
class ApiConfig:
    xai_api_key: str = field(default_factory=lambda: os.environ.get("XAI_API_KEY", ""))
    xai_base_url: str = field(default_factory=lambda: os.environ.get("XAI_BASE_URL", "https://api.x.ai/v1"))
    text_model: str = field(default_factory=lambda: os.environ.get("GROK_MODEL", "grok-4"))
    image_model: str = field(default_factory=lambda: os.environ.get("GROK_IMAGE_MODEL", "grok-2-image"))


def load_dotenv(path: str = ".env") -> None:
    """טעינה פשוטה של קובץ .env בלי תלות חיצונית."""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
