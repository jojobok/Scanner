"""עיבוד תמונות וקריינות."""
from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .config import Style

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size)


# ------------------------------------------------------------------ images

def prepare_image(src: Path, dst: Path, style: Style, scale: int = 2) -> Path:
    """מביא כל תמונה לגודל (רוחב*scale, גובה*scale) - פי 2 כדי שהזום יהיה חלק."""
    W, H = style.width * scale, style.height * scale
    img = Image.open(src).convert("RGB")
    if style.image_fit == "blur":
        bg = _cover(img, W, H).filter(ImageFilter.GaussianBlur(40))
        fg = img.copy()
        fg.thumbnail((W, H), Image.LANCZOS)
        bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
        out = bg
    else:
        out = _cover(img, W, H)
    out.save(dst, "PNG")
    return dst


def _cover(img: Image.Image, W: int, H: int) -> Image.Image:
    r = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    left, top = (img.width - W) // 2, (img.height - H) // 2
    return img.crop((left, top, left + W, top + H))


PALETTES = [((40, 26, 12), (196, 140, 62)), ((14, 26, 48), (92, 128, 176)),
            ((44, 18, 18), (186, 98, 60)), ((20, 34, 26), (128, 160, 104))]


def placeholder_image(dst: Path, idx: int, caption: str, style: Style) -> Path:
    """תמונת דמה למצב הדגמה (כשאין מפתח API)."""
    W, H = style.width, style.height
    top, bottom = PALETTES[idx % len(PALETTES)]
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    d.ellipse((W * 0.2, H * 0.28, W * 0.8, H * 0.28 + W * 0.6), outline=(255, 230, 180), width=6)
    d.text((W / 2, H * 0.12), f"תמונה {idx + 1}", font=_font(60), fill=(255, 240, 210), anchor="mm")
    d.multiline_text((W / 2, H * 0.62), _wrap(caption, 34), font=_font(34),
                     fill=(255, 255, 255), anchor="ma", align="center", spacing=10)
    img.save(dst, "PNG")
    return dst


def _wrap(text: str, width: int) -> str:
    lines, cur = [], ""
    for w in text.split():
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    return "\n".join(lines + [cur])


# ------------------------------------------------------------------ audio

def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def estimate_seconds(text: str) -> float:
    return max(1.5, len(text.split()) / 2.1)


_TTS_DOWN = False  # אחרי כישלון ראשון לא מנסים שוב בכל סצנה


def synthesize(text: str, dst: Path, style: Style) -> tuple[Path, bool]:
    """קריינות עם edge-tts (חינמי, קולות עברית של מיקרוסופט).
    אם אין רשת / אין חבילה - מחזיר שקט באורך משוער, כדי שהצנרת לא תיתקע.
    מחזיר (נתיב, האם_זו_קריינות_אמיתית)."""
    global _TTS_DOWN
    if dst.exists() and dst.stat().st_size > 1000:
        return dst, True  # כבר הוקלט בהרצה קודמת
    if not _TTS_DOWN:
        try:
            import os
            import ssl

            import edge_tts
            import edge_tts.communicate as _c

            # edge-tts (aiohttp) לא קורא HTTPS_PROXY / SSL_CERT_FILE לבד - מעבירים ידנית
            proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
            cafile = os.environ.get("SSL_CERT_FILE")
            if cafile and hasattr(_c, "_SSL_CTX"):
                _c._SSL_CTX = ssl.create_default_context(cafile=cafile)

            async def run():
                await edge_tts.Communicate(text, style.tts_voice, rate=style.tts_rate,
                                           proxy=proxy).save(str(dst))

            asyncio.run(run())
            if dst.exists() and dst.stat().st_size > 1000:
                return dst, True
        except Exception as e:  # noqa: BLE001
            print(f"   ⚠ קריינות נכשלה ({type(e).__name__}: {str(e)[:120]}) - משתמש בשקט זמני")
        _TTS_DOWN = True
        dst.unlink(missing_ok=True)
    silent = dst.with_suffix(".silent.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
         "-t", f"{estimate_seconds(text):.2f}", str(silent)],
        check=True,
    )
    return silent, False
