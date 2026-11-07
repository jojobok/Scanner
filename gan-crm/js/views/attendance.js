'use strict';
// Screen: children attendance (daily, monthly) and staff hours.
// (loaded as a classic script; see index.html for the load order)

/* ---------- נוכחות ---------- */
function viewAttendance() {
  const u = currentUser();
  const tab = fget('attTab', 'kids');
  const head = pageHead('נוכחות', u.isManager ? 'נוכחות ילדים יומית, דוח חודשי ושעות עבודה של הצוות' : 'סימון נוכחות ילדים והמשמרות שלי');
  const t = tabs('attTab', [['kids', 'נוכחות ילדים – יומי'], ['kidsMonth', 'נוכחות ילדים – דוח חודשי'], ['staff', u.isManager ? 'נוכחות צוות / שעות' : 'המשמרות שלי']], tab);
  if (tab === 'kidsMonth') return head + t + attKidsMonth(u);
  if (tab === 'staff') return head + t + attStaff(u);
  return head + t + attKidsDay(u);
}

function attKidsDay(u) {
  const date = fget('attDate', todayStr());
  const cls = u.isManager ? fget('attClass', db.classes[0]?.id || '') : u.classId;
  const kids = classKids(cls);
  const att = db.childAttendance[date] || {};
  const p = kids.filter(k => att[k.id] === 1).length, a = kids.filter(k => att[k.id] === 0).length;
  return `<div class="filters">
    ${filterInput('attDate', 'תאריך', date, 'date')}
    ${u.isManager ? filterSel('attClass', 'כיתה', classOpts(cls)) : ''}
    <button class="btn" data-act="markAll" data-cls="${cls}" data-val="1">סימון כולם נוכחים</button>
    <button class="btn" data-act="markAll" data-cls="${cls}" data-val="">ניקוי סימון</button>
  </div>
  <div class="info-box"><b>${esc(className(cls))}</b> · ${dayName(date)} ${fmtDate(date)} · נוכחים: <b>${p}</b> · נעדרים: <b>${a}</b> · לא סומנו: <b>${kids.length - p - a}</b> · סה״כ: ${kids.length}</div>
  <div class="att-list">${kids.map(k => { const v = att[k.id]; return `<div class="att-row ${v === 1 ? 'present' : v === 0 ? 'absent' : ''}">
    <div><b>${esc(k.firstName)} ${esc(k.lastName)}</b>${k.allergies ? ` <span class="pill bad" title="${esc(k.allergies)}">!</span>` : ''}</div>
    <div class="btns"><button class="btn sm ${v === 1 ? 'on' : ''}" data-act="att" data-id="${k.id}" data-val="1" aria-pressed="${v === 1}">נוכח/ת</button><button class="btn sm ${v === 0 ? 'off' : ''}" data-act="att" data-id="${k.id}" data-val="0" aria-pressed="${v === 0}">נעדר/ת</button></div></div>`; }).join('') || empty('אין ילדים בכיתה')}</div>`;
}

function kidsMonthData(cls, m) {
  const t = todayStr();
  const kids = classKids(cls);
  const days = daysInMonth(m).filter(d => d <= t && dow(d) !== 6 && (dow(d) !== 5 || kids.some(k => (db.childAttendance[d] || {})[k.id] !== undefined)));
  return { kids, days, rows: kids.map(k => { const vals = days.map(d => (db.childAttendance[d] || {})[k.id]); const pres = vals.filter(v => v === 1).length, abs = vals.filter(v => v === 0).length; return { k, vals, pres, abs, pct: pres + abs ? Math.round(pres / (pres + abs) * 100) : null }; }) };
}
function attKidsMonth(u) {
  const m = fget('attMonth', todayStr().slice(0, 7));
  const cls = u.isManager ? fget('attClass', db.classes[0]?.id || '') : u.classId;
  if (!validMonth(m)) return empty('יש לבחור חודש');
  const { days, rows } = kidsMonthData(cls, m);
  return `<div class="filters">${filterInput('attMonth', 'חודש', m, 'month')}${u.isManager ? filterSel('attClass', 'כיתה', classOpts(cls)) : ''}
    <button class="btn" data-act="exportKidsMonth" data-cls="${cls}" data-m="${m}">ייצוא לאקסל</button><button class="btn" data-act="print">הדפסה</button></div>
  <div class="info-box">${esc(className(cls))} · ${monthLabel(m)} · ${days.length} ימי פעילות</div>
  <div class="table-wrap"><table class="matrix"><thead><tr><th>ילד/ה</th>${days.map(d => `<th>${Number(d.slice(8))}<br><span class="muted">${DAYS[dow(d)][0]}׳</span></th>`).join('')}<th>נוכח</th><th>נעדר</th><th>%</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.k.firstName)} ${esc(r.k.lastName)}</td>${r.vals.map(v => `<td class="${v === 1 ? 'y' : v === 0 ? 'n' : ''}">${v === 1 ? '✓' : v === 0 ? '✗' : '·'}</td>`).join('')}<td><b>${r.pres}</b></td><td>${r.abs}</td><td>${r.pct ?? '–'}${r.pct != null ? '%' : ''}</td></tr>`).join('')}
  </tbody></table>${rows.length ? '' : empty('אין ילדים בכיתה')}</div>`;
}

function attStaff(u) {
  const m = fget('shiftMonth', todayStr().slice(0, 7));
  const sid = u.isManager ? fget('shiftStaff', '') : u.id;
  if (!validMonth(m)) return empty('יש לבחור חודש');
  const list = db.shifts.filter(s => s.date.startsWith(m) && (!sid || s.staffId === sid)).sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start));
  const total = list.reduce((a, s) => a + shiftMinutes(s), 0);
  const open = openShift(u.id);
  return `${!u.isManager ? `<div class="card clock-card" style="margin-bottom:14px"><div><b>${open ? `במשמרת מאז ${open.start}` : 'לא במשמרת כרגע'}</b><div class="muted small">רק המנהלת יכולה לתקן שעות. אם שכחת להחתים – שלחי תזכורת.</div></div><button class="btn big ${open ? 'off' : 'on'}" data-act="clock">${open ? '⏹ יציאה' : '▶ כניסה'}</button></div>` : ''}
  <div class="filters">${filterInput('shiftMonth', 'חודש', m, 'month')}${u.isManager ? filterSel('shiftStaff', 'עובד/ת', staffOpts(sid, 'כל העובדים')) : ''}
    ${u.isManager ? '<button class="btn primary" data-act="editShift">+ הוספת משמרת ידנית</button>' : ''}
    <button class="btn" data-act="exportShifts" data-m="${m}" data-sid="${sid}">ייצוא לאקסל</button><button class="btn" data-act="print">הדפסה</button></div>
  <div class="info-box">${monthLabel(m)} · ${list.length} משמרות · סה״כ <b>${fmtHours(total)}</b> שעות (${fmtHM(total)})</div>
  <div class="table-wrap"><table><thead><tr><th>תאריך</th><th>יום</th>${u.isManager ? '<th>עובד/ת</th>' : ''}<th>כניסה</th><th>יציאה</th><th class="num">משך</th><th>הערה</th>${u.isManager ? '<th class="acts"></th>' : ''}</tr></thead><tbody>
  ${list.map(s => `<tr><td>${fmtDate(s.date)}</td><td>${DAYS[dow(s.date)]}</td>${u.isManager ? `<td>${esc(staffName(s.staffId))}</td>` : ''}<td>${esc(s.start)}</td><td>${s.end ? esc(s.end) : '<span class="pill ok">פתוחה</span>'}</td><td class="num">${fmtHM(shiftMinutes(s))}</td><td class="small">${esc(s.note)}</td>
    ${u.isManager ? `<td class="acts"><button class="btn sm" data-act="editShift" data-id="${s.id}">עריכה</button> <button class="btn sm danger" data-act="delShift" data-id="${s.id}">מחיקה</button></td>` : ''}</tr>`).join('')}
  </tbody></table>${list.length ? '' : empty('אין משמרות בחודש זה')}</div>`;
}
