'use strict';
// Screen: staff list and employee card.
// (loaded as a classic script; see index.html for the load order)

/* ---------- צוות ---------- */
function viewStaff() {
  if (state.p.id) return viewStaffProfile(state.p.id);
  const m = todayStr().slice(0, 7);
  return `${pageHead('צוות הגן', `${activeStaff().length} עובדים פעילים`, `<button class="btn primary" data-act="editStaff">+ עובד/ת חדש/ה</button>`)}
  <div class="table-wrap"><table><thead><tr><th>שם</th><th>תפקיד</th><th>כיתה</th><th>טלפון</th><th class="num">שכר לשעה</th><th class="num">שעות ב${MONTHS[Number(m.slice(5)) - 1]}</th><th class="num">ברוטו מצטבר</th><th>סטטוס</th><th class="acts"></th></tr></thead><tbody>
  ${db.staff.map(s => { const sm = staffMonth(s.id, m); const on = openShift(s.id); return `<tr><td><button class="link" style="font-size:15px;font-weight:600" data-act="go" data-v="staff" data-id="${s.id}">${esc(s.name)}</button></td><td>${esc(s.role)}</td><td>${esc(className(s.classId))}</td><td dir="ltr" style="text-align:right">${esc(s.phone)}</td><td class="num">${fmtMoney(s.hourlyRate)}</td><td class="num">${fmtHours(sm.mins)}</td><td class="num">${fmtMoney(sm.gross)}</td>
    <td>${s.active === false ? '<span class="pill">לא פעיל/ה</span>' : on ? '<span class="pill ok">במשמרת</span>' : '<span class="pill">לא במשמרת</span>'}</td>
    <td class="acts"><button class="btn sm" data-act="go" data-v="staff" data-id="${s.id}">כרטיס עובד</button> <button class="btn sm" data-act="editStaff" data-id="${s.id}">עריכה</button></td></tr>`; }).join('')}
  </tbody></table>${db.staff.length ? '' : empty('אין עובדים עדיין')}</div>`;
}

function viewStaffProfile(id) {
  const s = db.staff.find(x => x.id === id);
  if (!s) return empty('העובד/ת לא נמצא/ה');
  const m = fget('profMonth', todayStr().slice(0, 7));
  const sm = staffMonth(id, m);
  const shifts = db.shifts.filter(x => x.staffId === id && x.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date));
  const reps = db.reports.filter(r => r.staffId === id && r.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date));
  const rems = db.reminders.filter(r => r.fromStaffId === id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const msgs = db.messages.filter(x => x.recipients.includes(id)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const comps = db.complaints.filter(c => c.createdBy === id || c.assignedTo === id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const log = db.log.filter(l => l.userId === id).slice(0, 30);
  return `${pageHead(s.name, `${esc(s.role)} · ${esc(className(s.classId))} · ${esc(s.phone)} · ${fmtMoney(s.hourlyRate)} לשעה`,
    `<button class="btn" data-act="nav" data-v="staff">→ חזרה לצוות</button><button class="btn" data-act="editStaff" data-id="${s.id}">עריכת פרטים</button><button class="btn primary" data-act="newMessage" data-to="${s.id}">✉️ הודעה אישית</button>`)}
  <div class="filters">${filterInput('profMonth', 'חודש', m, 'month')}</div>
  <div class="stats">${stat('ימי עבודה', sm.days)}${stat('שעות', fmtHours(sm.mins), fmtHM(sm.mins))}${stat('שכר ברוטו', fmtMoney(sm.gross), `${fmtHours(sm.mins)} × ${fmtMoney(sm.rate)}`)}${stat('דוחות יומיים שנכתבו', reps.length)}</div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h3>🕒 משמרות – ${monthLabel(m)}</h3></div>
      ${shifts.length ? `<table><thead><tr><th>תאריך</th><th>כניסה</th><th>יציאה</th><th class="num">שעות</th></tr></thead><tbody>${shifts.map(x => `<tr><td>${fmtDate(x.date)} <span class="muted small">${DAYS[dow(x.date)]}</span></td><td>${esc(x.start)}</td><td>${x.end ? esc(x.end) : '<span class="pill ok">פתוחה</span>'}</td><td class="num">${fmtHM(shiftMinutes(x))}</td></tr>`).join('')}</tbody></table>` : empty('אין משמרות בחודש זה')}</div>
    <div class="card"><div class="card-head"><h3>📝 דוחות יומיים – ${monthLabel(m)}</h3></div>
      ${reps.map(r => `<div class="row-item"><div><b>${fmtDate(r.date)}</b> · ${esc(className(r.classId))} · ${r.childrenCount} ילדים<div class="small muted">${esc(r.summary.slice(0, 120))}${r.summary.length > 120 ? '…' : ''}</div></div></div>`).join('') || empty('אין דוחות')}</div>
    <div class="card"><div class="card-head"><h3>🔔 תזכורות ששלחה</h3></div>${rems.map(r => reminderItem(r, false)).join('') || empty('אין תזכורות')}</div>
    <div class="card"><div class="card-head"><h3>✉️ הודעות שקיבלה</h3></div>
      ${msgs.map(x => `<div class="row-item"><div><b>${esc(x.subject)}</b><div class="muted small">${fmtDateTime(x.createdAt)} · ${esc(x.toLabel)}</div></div>${x.readBy.includes(id) ? '<span class="pill ok">נקראה</span>' : '<span class="pill warn">לא נקראה</span>'}</div>`).join('') || empty('אין הודעות')}</div>
    <div class="card"><div class="card-head"><h3>⚠️ תלונות הורים (רשמה / באחריותה)</h3></div>
      ${comps.map(c => `<div class="row-item"><div><b>${esc(c.subject)}</b><div class="muted small">${fmtDate(c.date)} · ${esc(childName(c.childId))}</div></div>${statusPill(c.status)}</div>`).join('') || empty('אין תלונות')}</div>
    <div class="card"><div class="card-head"><h3>📜 פעולות אחרונות במערכת</h3></div>
      ${log.map(l => `<div class="row-item"><div class="small">${esc(l.text)}</div><span class="muted small">${fmtDateTime(l.ts)}</span></div>`).join('') || empty('אין פעולות')}</div>
  </div>`;
}
