"""זיהוי פרשת השבוע.

קודם מנסה את Hebcal (לוח ארץ ישראל), ואם אין רשת - מחשב מקומית עם pyluach.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import requests


@dataclass
class Parasha:
    name_he: str          # למשל "חיי שרה"
    name_en: str          # למשל "Chayei Sara"
    shabbat_date: dt.date
    source: str

    @property
    def title_he(self) -> str:
        return f"פרשת {self.name_he}"


def next_shabbat(today: dt.date) -> dt.date:
    # weekday(): Monday=0 ... Saturday=5
    return today + dt.timedelta(days=(5 - today.weekday()) % 7)


def _from_hebcal(shabbat: dt.date, israel: bool) -> Parasha | None:
    params = {
        "v": "1", "cfg": "json", "s": "on", "i": "on" if israel else "off",
        "start": shabbat.isoformat(), "end": shabbat.isoformat(),
    }
    r = requests.get("https://www.hebcal.com/hebcal", params=params, timeout=10)
    r.raise_for_status()
    for item in r.json().get("items", []):
        if item.get("category") == "parashat":
            he = item.get("hebrew", "").replace("פרשת", "").strip()
            en = item.get("title", "").replace("Parashat", "").strip()
            return Parasha(he, en, shabbat, "hebcal")
    return None  # שבת של חג - אין פרשה רגילה


def _from_pyluach(shabbat: dt.date, israel: bool) -> Parasha | None:
    from pyluach import dates, parshios

    d = dates.GregorianDate(shabbat.year, shabbat.month, shabbat.day)
    he = parshios.getparsha_string(d, israel=israel, hebrew=True)
    en = parshios.getparsha_string(d, israel=israel)
    if not he:
        return None
    return Parasha(he, en or he, shabbat, "pyluach")


def get_weekly_parasha(today: dt.date | None = None, israel: bool = True) -> Parasha:
    shabbat = next_shabbat(today or dt.date.today())
    errors = []
    for fn in (_from_hebcal, _from_pyluach):
        try:
            p = fn(shabbat, israel)
            if p:
                return p
            errors.append(f"{fn.__name__}: אין פרשה בשבת הזו (כנראה חג)")
        except Exception as e:  # noqa: BLE001 - ממשיכים למקור הבא
            errors.append(f"{fn.__name__}: {e}")
    raise RuntimeError(
        f"לא הצלחתי לזהות את פרשת השבוע לשבת {shabbat}. "
        f"אפשר להעביר ידנית עם --parasha. פרטים: {errors}"
    )
