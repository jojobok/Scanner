'use strict';
// Screen: manager dashboard.
// (loaded as a classic script; see index.html for the load order)

/* ---------- לוח בקרה (מנהלת) ---------- */
function viewDashboard() {
  const t = todayStr(), att = db.childAttendance[t] || {};
  const kids = activeKids();
  const present = kids.filter(k => att[k.id] === 1).length;
  const marked = kids.filter(k => att[k.id] !== undefined).length;
  const onShift = db.shifts.filter(s => !s.end && s.date === t);
  const openC = db.complaints.filter(c => c.status !== 'closed').sort((a, b) => b.createdAt - a.createdAt);
  const openR = db.reminders.filter(r => r.status !== 'done').sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  const repT = db.reports.filter(r => r.date === t);
  const payroll = activeStaff().reduce((a, s) => a + staffMonth(s.id, t.slice(0, 7)).gross, 0);
  return `${pageHead('לוח בקרה', `${dayName(t)}, ${fmtDate(t)}`)}
  <div class="stats">
    ${stat('ילדים רשומים', kids.length, `ב-${db.classes.length} כיתות`)}
    ${stat('נוכחים היום', present, marked < kids.length ? `סומנו ${marked} מתוך ${kids.length}` : 'כל הנוכחות סומנה')}
    ${stat('צוות במשמרת עכשיו', onShift.length, `מתוך ${activeStaff().length} עובדים`)}
    ${stat('דוחות יומיים היום', `${new Set(repT.map(r => r.classId)).size}/${db.classes.length}`, 'כיתות שהגישו')}
    ${stat('תלונות פתוחות', openC.length, '', openC.length ? 'warn' : '')}
    ${stat('תזכורות פתוחות', openR.length, '', openR.length ? 'warn' : '')}
    ${stat('שכר מצטבר החודש', fmtMoney(payroll), 'לפי שעות שנרשמו')}
  </div>
  <h2 class="sec">הכיתות היום</h2>
  <div class="grid cards4">${db.classes.map(c => {
    const ck = kids.filter(k => k.classId === c.id);
    const p = ck.filter(k => att[k.id] === 1).length;
    const rep = repT.find(r => r.classId === c.id);
    const st = classStaff(c.id);
    const on = st.filter(s => onShift.some(o => o.staffId === s.id));
    return `<div class="card class-card" style="--cc:${esc(c.color)}">
      <div class="cc-head"><h3>${esc(c.name)}</h3><span class="pill">${ck.length}/${c.capacity || '–'} ילדים</span></div>
      <div class="kv"><span>נוכחים היום</span><b>${p}</b></div>
      <div class="kv"><span>דוח יומי</span>${rep ? `<button class="link" data-act="go" data-v="reports" data-cls="${c.id}">✓ הוגש – לצפייה</button>` : '<b class="bad">טרם הוגש</b>'}</div>
      <div class="kv"><span>צוות במשמרת</span><b>${on.length}/${st.length}</b></div>
      <div class="muted small" style="margin-top:6px">${st.map(s => `${esc(s.name)} (${esc(s.role)})`).join(' · ') || 'אין צוות משויך'}</div>
    </div>`;
  }).join('')}</div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h3>🔔 תזכורות מהצוות</h3><button class="link" data-act="nav" data-v="reminders">לכל התזכורות</button></div>
      ${openR.slice(0, 6).map(r => reminderItem(r, true)).join('') || empty('אין תזכורות פתוחות')}</div>
    <div class="card"><div class="card-head"><h3>⚠️ תלונות הורים פתוחות</h3><button class="link" data-act="nav" data-v="complaints">לכל התלונות</button></div>
      ${openC.slice(0, 6).map(c => `<div class="row-item"><div><b>${esc(c.subject)}</b><div class="muted small">${fmtDate(c.date)} · ${esc(className(c.classId))} · ${esc(childName(c.childId))}</div></div>${statusPill(c.status)}</div>`).join('') || empty('אין תלונות פתוחות')}</div>
  </div>`;
}
