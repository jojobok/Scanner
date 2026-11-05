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
    fps: int = 30
    max_seconds: float = 90.0     # תקרה קשיחה - דקה וחצי
    target_seconds: float = 75.0  # היעד שגרוק מקבל לכתיבת התסריט
    scenes_min: int = 6
    scenes_max: int = 9
    ken_burns_zoom: float = 1.12  # כמה "זום איטי" על כל תמונה

    # --- סגנון ויזואלי (מועבר לגרוק כדי שכל פרומפטי התמונות יהיו אחידים) ---
    visual_style: str = (
        "cinematic, photorealistic, ancient Near East biblical era, warm golden-hour light, "
        "soft volumetric haze, rich earthy colors, shallow depth of field, epic but intimate, "
        "vertical 9:16 composition with the subject centered"
    )
    # רגישות דתית - נשלח לגרוק כהנחיה לכל פרומפט תמונה
    image_rules: str = (
        "Never depict God in any form (use light, clouds, fire or rays instead). "
        "Show biblical figures (patriarchs, matriarchs, Moses, Aaron, prophets) from behind, "
        "in silhouette, or at a distance - no clear faces. No text, letters or watermarks in the image. "
        "No idols shown in a glorifying way, no immodest clothing, no gore."
    )
    image_fit: str = "cover"      # cover = חיתוך למילוי המסך, blur = התמונה במרכז על רקע מטושטש

    # --- טון וכתיבה ---
    tone: str = (
        "מרגש, חם ומעורר השראה, בגובה העיניים. פתיחה עם Hook חזק בשנייה הראשונה, "
        "סיפור קצר מהפרשה, ואז מסר אישי ומעשי לחיים של היום. סיום עם משפט שנשאר בלב."
    )
    audience: str = "קהל ישראלי רחב, דתיים ומסורתיים, צופים ברשתות חברתיות"
    language: str = "he"

    # --- קריינות ---
    tts_voice: str = "he-IL-AvriNeural"   # קול גברי. קול נשי: he-IL-HilaNeural
    tts_rate: str = "+0%"

    # --- כתוביות ---
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
