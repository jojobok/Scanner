'use strict';
// Screen: activity log.
// (loaded as a classic script; see index.html for the load order)

/* ---------- יומן פעולות ---------- */
function viewLog() {
  const who = fget('logUser', '');
  const list = db.log.filter(l => !who || l.userId === who).slice(0, 400);
  return `${pageHead('יומן פעולות', 'מה כל אחד עשה במערכת ומתי')}
  <div class="filters">${filterSel('logUser', 'משתמש/ת', opt('', 'כולם', who) + opt('manager', db.settings.managerName + ' (מנהלת)', who) + db.staff.map(s => opt(s.id, s.name, who)).join(''))}</div>
  <div class="table-wrap"><table><thead><tr><th>זמן</th><th>משתמש/ת</th><th>פעולה</th></tr></thead><tbody>
  ${list.map(l => `<tr><td class="small" style="white-space:nowrap">${fmtDateTime(l.ts)}</td><td>${esc(staffName(l.userId))}</td><td>${esc(l.text)}</td></tr>`).join('')}
  </tbody></table>${list.length ? '' : empty('אין פעולות')}</div>`;
}
