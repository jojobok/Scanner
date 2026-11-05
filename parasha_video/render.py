"""הרכבת הסרטון עם ffmpeg: זום איטי (Ken Burns) על כל תמונה, קריינות, כתוביות ומוזיקה."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import Style


@dataclass
class Scene:
    image: Path          # תמונה מוכנה בגודל פי 2
    audio: Path
    audio_seconds: float
    narration: str
    on_screen_text: str
    seconds: float = 0.0


def _run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg נכשל:\n" + " ".join(cmd) + "\n" + r.stderr[-2000:])


def fit_timeline(scenes: list[Scene], style: Style) -> float:
    """קובע אורך לכל סצנה ומוודא שהסה"כ לא עובר את התקרה (דקה וחצי)."""
    gap = 0.35
    for i, s in enumerate(scenes):
        s.seconds = s.audio_seconds + gap + (0.9 if i == len(scenes) - 1 else 0)
    total = sum(s.seconds for s in scenes)
    if total > style.max_seconds:
        factor = (style.max_seconds - 0.2) / total
        print(f"   ⚠ הסרטון יצא {total:.1f} שניות - מאיץ קריינות פי {1 / factor:.2f} כדי לעמוד ב-{style.max_seconds:.0f}")
        for s in scenes:
            s.seconds *= factor
        total = sum(s.seconds for s in scenes)
    return total


def _atempo_chain(tempo: float) -> str:
    parts = []
    while tempo > 2.0:
        parts.append("atempo=2.0")
        tempo /= 2.0
    parts.append(f"atempo={tempo:.4f}")
    return ",".join(parts)


def render_scene_clip(s: Scene, idx: int, out: Path, style: Style) -> Path:
    W, H, fps = style.width, style.height, style.fps
    frames = max(2, round(s.seconds * fps))
    zmax = style.ken_burns_zoom
    zoom_in = f"1+({zmax}-1)*on/{frames}"
    zoom_out = f"{zmax}-({zmax}-1)*on/{frames}"
    # מחליפים תנועה בין סצנות כדי שלא יהיה מונוטוני
    variants = [
        (zoom_in, "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
        (zoom_out, "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
        (f"{zmax}", f"(iw-iw/zoom)*on/{frames}", "ih/2-(ih/zoom/2)"),          # פאן ימינה
        (zoom_in, "iw/2-(iw/zoom/2)", f"(ih-ih/zoom)*(1-on/{frames})"),       # זום + עלייה
    ]
    z, x, y = variants[idx % len(variants)]
    vf = (f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={W}x{H}:fps={fps},"
          f"setsar=1,format=yuv420p")
    _run(["ffmpeg", "-y", "-v", "error", "-i", str(s.image), "-vf", vf, "-frames:v", str(frames),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", str(fps), str(out)])
    return out


def render_scene_audio(s: Scene, out: Path) -> Path:
    tempo = s.audio_seconds / max(0.1, s.seconds - 0.2)
    af = (_atempo_chain(tempo) + "," if tempo > 1.0 else "") + "apad"
    _run(["ffmpeg", "-y", "-v", "error", "-i", str(s.audio), "-af", af, "-t", f"{s.seconds:.3f}",
          "-ar", "44100", "-ac", "2", str(out)])
    return out


# ------------------------------------------------------------------ subtitles (ASS)

def _ts(t: float) -> str:
    h, rem = divmod(max(0.0, t), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _esc(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def _chunks(text: str, n: int) -> list[str]:
    words = text.split()
    return [" ".join(words[i:i + n]) for i in range(0, len(words), n)] or [""]


def build_ass(scenes: list[Scene], style: Style, title: str, out: Path) -> Path:
    W, H = style.width, style.height
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{style.font_name},{style.font_size},{style.text_color},&H000000FF,{style.outline_color},&H96000000,1,0,0,0,100,100,0,0,1,6,3,2,80,80,{style.subtitle_margin_v},1
Style: Title,{style.font_name},{style.title_font_size},{style.highlight_color},&H000000FF,{style.outline_color},&H96000000,1,0,0,0,100,100,0,0,1,7,4,8,70,70,300,1
Style: Mark,{style.font_name},38,&H66FFFFFF,&H000000FF,&H80000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,8,40,40,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    t = 0.0
    total = sum(s.seconds for s in scenes)
    for i, s in enumerate(scenes):
        heading = s.on_screen_text or (title if i == 0 else "")
        if heading:
            ev.append(f"Dialogue: 1,{_ts(t)},{_ts(t + s.seconds - 0.05)},Title,,0,0,0,,"
                      f"{{\\fad(250,200)\\blur1}}{_esc(heading)}")
        parts = _chunks(s.narration, style.words_per_caption)
        speak = max(0.5, s.seconds - 0.35)
        weights = [max(1, len(p)) for p in parts]
        ct = t
        for p, w in zip(parts, weights):
            d = speak * w / sum(weights)
            ev.append(f"Dialogue: 0,{_ts(ct)},{_ts(ct + d)},Caption,,0,0,0,,"
                      f"{{\\fad(80,60)}}{_esc(p)}")
            ct += d
        t += s.seconds
    if style.watermark:
        ev.append(f"Dialogue: 2,{_ts(0)},{_ts(total)},Mark,,0,0,0,,{_esc(style.watermark)}")
    out.write_text(head + "\n".join(ev) + "\n", encoding="utf-8")
    return out


# ------------------------------------------------------------------ final assembly

def assemble(scenes: list[Scene], style: Style, title: str, work: Path, out: Path,
             fonts_dir: Path | None = None) -> Path:
    total = fit_timeline(scenes, style)
    clips, auds = [], []
    for i, s in enumerate(scenes):
        print(f"   🎞  סצנה {i + 1}/{len(scenes)} ({s.seconds:.1f} שנ')")
        clips.append(render_scene_clip(s, i, work / f"clip_{i:02d}.mp4", style))
        auds.append(render_scene_audio(s, work / f"aud_{i:02d}.wav"))

    vlist, alist = work / "clips.txt", work / "auds.txt"
    vlist.write_text("".join(f"file '{c.resolve()}'\n" for c in clips), encoding="utf-8")
    alist.write_text("".join(f"file '{a.resolve()}'\n" for a in auds), encoding="utf-8")
    _run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(vlist), "-c", "copy",
          str(work / "video_raw.mp4")])
    _run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(alist),
          str(work / "voice.wav")])

    ass = build_ass(scenes, style, title, work / "subs.ass")
    ass_arg = str(ass).replace("\\", "/").replace(":", "\\:")
    sub = f"ass='{ass_arg}'"
    if fonts_dir and fonts_dir.is_dir():
        sub += f":fontsdir='{str(fonts_dir).replace(chr(92), '/').replace(':', chr(92) + ':')}'"
    fade_out = max(0.0, total - 0.8)
    vfilter = f"[0:v]{sub},fade=t=in:st=0:d=0.4,fade=t=out:st={fade_out:.2f}:d=0.8[v]"

    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(work / "video_raw.mp4"), "-i", str(work / "voice.wav")]
    if style.music_path and Path(style.music_path).exists():
        cmd += ["-stream_loop", "-1", "-i", style.music_path]
        afilter = (f"[2:a]volume={style.music_volume},afade=t=in:d=1.5,"
                   f"afade=t=out:st={max(0, total - 2.5):.2f}:d=2.5[m];"
                   f"[1:a][m]amix=inputs=2:duration=first:normalize=0[a]")
    else:
        afilter = "[1:a]anull[a]"
    cmd += ["-filter_complex", f"{vfilter};{afilter}", "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
            "-t", f"{min(total, style.max_seconds):.2f}", str(out)]
    _run(cmd)
    return out
