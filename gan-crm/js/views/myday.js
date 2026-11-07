'use strict';
// Screen: staff 'my day'.
// (loaded as a classic script; see index.html for the load order)

/* ---------- היום שלי (צוות) ---------- */
function viewMyDay() {
  const u = currentUser(), t = todayStr();
  const open = openShift(u.id);
  const todayMins = db.shifts.filter(s => s.staffId === u.id && s.date === t).reduce((a, s) => a + (s.end ? shiftMinutes(s) : minutesBetween(s.start, nowTime())), 0);
  const kids = classKids(u.classId), att = db.childAttendance[t] || {};
  const present = kids.filter(k => att[k.id] === 1).length;
  const rep = db.reports.find(r => r.date === t && r.classId === u.classId);
  const unread = myMessages().filter(m => !m.readBy.includes(u.id));
  const month = staffMonth(u.id, t.slice(0, 7));
  return `${pageHead(`שלום ${u.name.split(' ')[0]} 👋`, `${dayName(t)}, ${fmtDate(t)} · ${esc(u.role)} ב${esc(className(u.classId))}`)}
  <div class="card clock-card">
    <div><div class="muted">${open ? `במשמרת מאז ${open.start}${open.date !== t ? ` (${fmtDate(open.date)})` : ''}` : 'לא במשמרת כרגע'}</div>
      <div class="big-time" id="liveClock">${nowTime()}</div>
      <div class="muted small">היום: ${fmtHM(todayMins)} שעות · החודש: ${fmtHours(month.mins)} שעות ב-${month.days} ימים</div></div>
    <button class="btn big ${open ? 'off' : 'on'}" data-act="clock">${open ? '⏹ יציאה ממשמרת' : '▶ כניסה למשמרת'}</button>
  </div>
  <div class="stats" style="margin-top:14px">
    ${stat('ילדים בכיתה', kids.length)}
    ${stat('נוכחים היום', present, Object.keys(att).some(id => kids.some(k => k.id === id)) ? '' : 'טרם סומנה נוכחות')}
    ${stat('דוח יומי', rep ? 'הוגש ✓' : 'טרם הוגש', '', rep ? '' : 'warn')}
    ${stat('הודעות שלא נקראו', unread.length, '', unread.length ? 'warn' : '')}
  </div>
  <div class="actions" style="margin:14px 0">
    <button class="btn" data-act="nav" data-v="attendance">✅ סימון נוכחות ילדים</button>
    <button class="btn primary" data-act="newReport">📝 ${rep ? 'עריכת הדוח היומי' : 'כתיבת דוח יומי'}</button>
    <button class="btn" data-act="newReminder">🔔 תזכורת למנהלת</button>
    <button class="btn" data-act="newComplaint">⚠️ רישום תלונת הורה</button>
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h3>✉️ הודעות חדשות</h3><button class="link" data-act="nav" data-v="messages">לכל ההודעות</button></div>
      ${unread.map(m => `<div class="row-item"><div><b>${esc(m.subject)}</b><div class="small">${esc(m.body)}</div><div class="muted small">${fmtDateTime(m.createdAt)}</div></div><button class="btn sm" data-act="readMsg" data-id="${m.id}">קראתי</button></div>`).join('') || empty('אין הודעות חדשות')}</div>
    <div class="card"><div class="card-head"><h3>📅 סדר היום – ${esc(className(u.classId))}</h3></div>${scheduleList(u.classId)}</div>
  </div>`;
}
