"""שימוש:
    python -m parasha_video                       # פרשת השבוע הקרובה, הכל אוטומטי
    python -m parasha_video --parasha "וירא"      # פרשה ספציפית
    python -m parasha_video --stop-after script   # רק תסריט + פרומפטים, לעריכה ידנית
    python -m parasha_video --from-plan output/.../plan.json   # להמשיך מתסריט ערוך
    python -m parasha_video --demo                # בלי מפתח API (תמונות דמה)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

from . import grok, media
from .config import ApiConfig, load_dotenv, load_style
from .parasha import Parasha, get_weekly_parasha, next_shabbat
from .render import Scene, assemble

PKG_DIR = Path(__file__).resolve().parent


def slug(text: str) -> str:
    return re.sub(r"[^\w֐-׿]+", "_", text).strip("_")


def write_prompts_md(plan: dict, path: Path) -> None:
    p = plan["parasha"]
    theme = plan["theme"]
    s = plan["script"]
    lines = [
        f"# {p['title_he']} — {s.get('title', '')}", "",
        f"**הנושא המרכזי:** {theme.get('title', '')}", "",
        f"{theme.get('summary', '')}", "",
        f"**פסוק עוגן:** {theme.get('anchor_verse', '')}", "",
        f"**למה נבחר:** {plan.get('why_chosen', '')}", "",
        "## סצנות", "",
    ]
    for i, sc in enumerate(s["scenes"], 1):
        lines += [f"### סצנה {i} — {sc.get('on_screen_text', '')}", "",
                  f"קריינות: {sc['narration']}", "",
                  "פרומפט לתמונה (אפשר להדביק גם ב-Grok Imagine):", "",
                  "```", sc["image_prompt"], "```", ""]
    lines += ["## פוסט", "", s.get("caption", ""), "", " ".join(s.get("hashtags", [])), ""]
    if s.get("sources"):
        lines += ["## מקורות (לבדוק לפני פרסום!)", ""] + [f"- {x}" for x in s["sources"]]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="parasha_video", description="מחולל סרטוני פרשת השבוע")
    ap.add_argument("--parasha", help='שם הפרשה בעברית, למשל "וירא" (ברירת מחדל: הפרשה של השבת הקרובה)')
    ap.add_argument("--date", help="תאריך YYYY-MM-DD שממנו מחשבים את השבת הקרובה")
    ap.add_argument("--diaspora", action="store_true", help="לוח חו\"ל במקום לוח ארץ ישראל")
    ap.add_argument("--theme", help="לכפות נושא מרכזי במקום שגרוק יבחר")
    ap.add_argument("--style", help="קובץ style.json עם הסגנון שלך")
    ap.add_argument("--out", default="output", help="תיקיית פלט")
    ap.add_argument("--from-plan", help="להמשיך מ-plan.json קיים (למשל אחרי עריכה ידנית)")
    ap.add_argument("--stop-after", choices=["theme", "script", "images"], help="לעצור אחרי שלב")
    ap.add_argument("--demo", action="store_true", help="מצב הדגמה - בלי קריאות לגרוק")
    ap.add_argument("--regen-images", action="store_true", help="ליצור מחדש תמונות קיימות")
    args = ap.parse_args(argv)

    load_dotenv()
    style = load_style(args.style)
    api = ApiConfig()
    demo = args.demo or not api.xai_api_key
    if demo and not args.demo:
        print("ℹ לא נמצא XAI_API_KEY - רץ במצב הדגמה (תמונות דמה, תסריט לדוגמה).")
    client = None if demo else grok.GrokClient(api)

    # ---------------------------------------------------------------- 1. פרשה + נושא + תסריט
    if args.from_plan:
        plan_path = Path(args.from_plan)
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        work = plan_path.parent
        pd = plan["parasha"]
        parasha = Parasha(pd["name_he"], pd["name_en"], dt.date.fromisoformat(pd["shabbat_date"]), pd["source"])
        print(f"📖 ממשיך מתסריט קיים: {parasha.title_he}")
    else:
        today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
        if args.parasha:
            parasha = Parasha(args.parasha.replace("פרשת", "").strip(), args.parasha, next_shabbat(today), "manual")
        else:
            parasha = get_weekly_parasha(today, israel=not args.diaspora)
        print(f"📖 {parasha.title_he} (שבת {parasha.shabbat_date}, מקור: {parasha.source})")

        work = Path(args.out) / f"{parasha.shabbat_date}_{slug(parasha.name_he)}"
        work.mkdir(parents=True, exist_ok=True)

        print("🤖 גרוק מחפש את הנושא המרכזי...")
        if args.theme:
            theme_res = {"candidates": [{"title": args.theme, "summary": args.theme,
                                         "anchor_verse": "", "life_message": ""}],
                         "chosen_index": 0, "why_chosen": "נבחר ידנית"}
        else:
            theme_res = grok.mock_theme(parasha) if demo else client.find_theme(parasha, style)
        cands = theme_res.get("candidates") or [{}]
        idx = int(theme_res.get("chosen_index", 0) or 0)
        theme = cands[idx if 0 <= idx < len(cands) else 0]
        for i, c in enumerate(cands):
            print(f"   {'★' if c is theme else ' '} {c.get('title')}")
        plan = {"parasha": {"name_he": parasha.name_he, "name_en": parasha.name_en,
                            "title_he": parasha.title_he, "shabbat_date": parasha.shabbat_date.isoformat(),
                            "source": parasha.source},
                "candidates": cands, "theme": theme, "why_chosen": theme_res.get("why_chosen", "")}
        plan_path = work / "plan.json"
        if args.stop_after == "theme":
            plan["script"] = {"scenes": []}
            plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"✅ נשמר: {plan_path}")
            return 0

        print("✍  גרוק כותב תסריט...")
        script = grok.mock_script(parasha, style) if demo else client.write_script(parasha, theme, style)
        scenes = script.get("scenes") or []
        if not scenes:
            print("❌ גרוק החזיר תסריט בלי סצנות", file=sys.stderr)
            return 1
        script["scenes"] = scenes[: style.scenes_max + 2]
        plan["script"] = script
        plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        write_prompts_md(plan, work / "prompts.md")
        print(f"   «{script.get('title')}» — {len(script['scenes'])} סצנות")
        print(f"   נשמר: {plan_path} + prompts.md")
        if args.stop_after == "script":
            print("✅ אפשר לערוך את plan.json ולהמשיך עם --from-plan")
            return 0

    script = plan["script"]
    write_prompts_md(plan, work / "prompts.md")

    # ---------------------------------------------------------------- 2. תמונות
    img_dir, aud_dir, tmp = work / "images", work / "audio", work / "build"
    for d in (img_dir, aud_dir, tmp):
        d.mkdir(exist_ok=True)
    print("🎨 יוצר תמונות...")
    raw_images = []
    for i, sc in enumerate(script["scenes"]):
        existing = sorted(img_dir.glob(f"scene_{i + 1:02d}.*"))
        if existing and not args.regen_images:
            raw_images.append(existing[0])  # מאפשר גם להחליף תמונה ידנית
            continue
        dst = img_dir / f"scene_{i + 1:02d}.png"
        if demo:
            media.placeholder_image(dst, i, sc["image_prompt"][:140], style)
        else:
            print(f"   🖼  {i + 1}/{len(script['scenes'])}")
            client.image(sc["image_prompt"], dst)
        raw_images.append(dst)
    if args.stop_after == "images":
        print(f"✅ התמונות ב-{img_dir}. אפשר להחליף ידנית (scene_XX.png/jpg) ולהמשיך עם --from-plan")
        return 0

    # ---------------------------------------------------------------- 3. קריינות
    print("🎙  מקליט קריינות...")
    scenes: list[Scene] = []
    real_voice = True
    for i, (sc, raw) in enumerate(zip(script["scenes"], raw_images)):
        audio, ok = media.synthesize(sc["narration"], aud_dir / f"scene_{i + 1:02d}.mp3", style)
        real_voice &= ok
        prepared = media.prepare_image(raw, tmp / f"img_{i:02d}.png", style)
        scenes.append(Scene(prepared, audio, media.probe_duration(audio),
                            sc["narration"], sc.get("on_screen_text", "")))

    # ---------------------------------------------------------------- 4. וידאו
    print("🎬 מרכיב וידאו...")
    out = work / f"{slug(parasha.title_he)}.mp4"
    assemble(scenes, style, script.get("title", parasha.title_he), tmp, out, fonts_dir=PKG_DIR / "fonts")
    dur = media.probe_duration(out)
    print(f"✅ מוכן: {out}  ({dur:.1f} שניות)")
    if not real_voice:
        print("⚠ חלק מהקריינות היא שקט זמני (edge-tts לא היה זמין). הריצו שוב עם חיבור לאינטרנט.")
    if demo:
        print("ℹ זה סרטון הדגמה. הוסיפו XAI_API_KEY לקובץ .env כדי לקבל תוכן ותמונות אמיתיים מגרוק.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
