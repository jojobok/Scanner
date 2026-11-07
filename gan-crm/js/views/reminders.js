'use strict';
// Screen: reminders.
// (loaded as a classic script; see index.html for the load order)

/* ---------- תזכורות ---------- */
function reminderItem(r, withActions) {
  const overdue = r.status !== 'done' && r.dueDate && r.dueDate < todayStr();
  return `<div class="row-item"><div><b>${esc(r.text)}</b>
    <div class="muted small">מאת ${esc(staffName(r.fromStaffId))} · ${r.dueDate ? `<span class="${overdue ? 'overdue' : ''}">עד ${fmtDate(r.dueDate)}${overdue ? ' (באיחור)' : ''}</span>` : 'ללא תאריך'}</div>
    ${r.managerNote ? `<div class="small ok">תשובת המנהלת: ${esc(r.managerNote)}</div>` : ''}</div>
    <div class="actions">${prioPill(r.priority)}${r.status === 'done' ? '<span class="pill ok">בוצע</span>' : ''}${withActions && isManager() && r.status !== 'done' ? `<button class="btn sm" data-act="doneReminder" data-id="${r.id}">✓ בוצע</button>` : ''}</div></div>`;
}
function viewReminders() {
  const u = currentUser();
  const st = fget('remStatus', 'open');
  let list = db.reminders.slice();
  if (!u.isManager) list = list.filter(r => r.fromStaffId === u.id);
  if (st !== 'all') list = list.filter(r => (st === 'done' ? r.status === 'done' : r.status !== 'done'));
  list.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.createdAt - a.createdAt);
  return `${pageHead(u.isManager ? 'תזכורות מהצוות' : 'התזכורות שלי למנהלת', u.isManager ? 'בקשות ותזכורות שהגננות והסייעות שלחו' : 'שליחת תזכורות ובקשות למנהלת', u.isManager ? '' : '<button class="btn primary" data-act="newReminder">+ תזכורת חדשה</button>')}
  ${tabs('remStatus', [['open', 'פתוחות'], ['done', 'בוצעו'], ['all', 'הכל']], st)}
  <div class="table-wrap"><table><thead><tr><th>תזכורת</th>${u.isManager ? '<th>מאת</th>' : ''}<th>תאריך יעד</th><th>עדיפות</th><th>סטטוס</th><th>תשובת המנהלת</th><th class="acts"></th></tr></thead><tbody>
  ${list.map(r => { const overdue = r.status !== 'done' && r.dueDate && r.dueDate < todayStr(); return `<tr><td><b>${esc(r.text)}</b><div class="muted small">נשלח ${fmtDateTime(r.createdAt)}</div></td>${u.isManager ? `<td>${esc(staffName(r.fromStaffId))}</td>` : ''}
    <td class="${overdue ? 'overdue' : ''}">${fmtDate(r.dueDate) || '—'}</td><td>${prioPill(r.priority)}</td><td>${r.status === 'done' ? '<span class="pill ok">בוצע</span>' : '<span class="pill warn">פתוח</span>'}</td><td class="small">${esc(r.managerNote)}</td>
    <td class="acts">${u.isManager ? `${r.status === 'done' ? `<button class="btn sm" data-act="reopenReminder" data-id="${r.id}">פתיחה מחדש</button>` : `<button class="btn sm primary" data-act="doneReminder" data-id="${r.id}">✓ בוצע</button>`} <button class="btn sm" data-act="noteReminder" data-id="${r.id}">תשובה</button>` : r.status !== 'done' ? `<button class="btn sm danger" data-act="delReminder" data-id="${r.id}">מחיקה</button>` : ''}</td></tr>`; }).join('')}
  </tbody></table>${list.length ? '' : empty('אין תזכורות')}</div>`;
}
