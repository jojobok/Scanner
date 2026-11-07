'use strict';
// Screen: settings and backup.
// (loaded as a classic script; see index.html for the load order)

/* ---------- הגדרות ---------- */
function viewSettings() {
  const s = db.settings;
  return `${pageHead('הגדרות וגיבוי')}
  <div class="grid two" style="margin-top:0">
    <div class="card"><div class="card-head"><h3>פרטי הגן</h3></div>
      <form id="settingsForm" class="form-grid">
        ${fld('שם הגן', inp('gardenName', s.gardenName, 'text', 'required'), 'full')}
        ${fld('שם המנהלת', inp('managerName', s.managerName, 'text', 'required'))}
        ${fld('קוד כניסה למנהלת', inp('managerPin', s.managerPin, 'password', 'required inputmode="numeric" autocomplete="new-password"'))}
        <div class="full"><button class="btn primary">שמירה</button></div>
      </form></div>
    <div class="card"><div class="card-head"><h3>גיבוי ושחזור</h3></div>
      <p class="small muted">הנתונים נשמרים בדפדפן הזה בלבד. מומלץ להוריד גיבוי באופן קבוע ולשמור אותו במקום בטוח (מחשב, דרייב, מייל).</p>
      <div class="actions"><button class="btn primary" data-act="backup">⬇ הורדת גיבוי</button>
        <label class="btn">⬆ שחזור מקובץ<input type="file" accept=".json,application/json" id="restoreFile" hidden></label>
        <button class="btn" data-act="restoreText">שחזור מטקסט</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      <p class="small muted">איפוס: התחלה מחדש עם 4 הכיתות בלבד (ללא ילדים וצוות), או טעינת נתוני ההדגמה.</p>
      <div class="actions"><button class="btn danger" data-act="wipe">מחיקת כל הנתונים</button><button class="btn" data-act="loadDemo">טעינת נתוני הדגמה</button></div>
    </div>
  </div>`;
}
