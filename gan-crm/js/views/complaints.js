'use strict';
// Screen: parent complaints.
// (loaded as a classic script; see index.html for the load order)

/* ---------- תלונות הורים ---------- */
function viewComplaints() {
  const u = currentUser();
  const st = fget('compStatus', 'active');
  let list = db.complaints.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!u.isManager) list = list.filter(c => c.createdBy === u.id || c.assignedTo === u.id);
  if (st === 'active') list = list.filter(c => c.status !== 'closed');
  else if (st !== 'all') list = list.filter(c => c.status === st);
  return `${pageHead('תלונות הורים', u.isManager ? 'מעקב וטיפול בפניות ותלונות הורים' : 'תלונות שרשמת או שהועברו לטיפולך', `<button class="btn primary" data-act="newComplaint">+ תלונה חדשה</button>`)}
  ${tabs('compStatus', [['active', 'פתוחות'], ['open', 'חדשות'], ['progress', 'בטיפול'], ['closed', 'טופלו'], ['all', 'הכל']], st)}
  <div class="table-wrap"><table><thead><tr><th>תאריך</th><th>כיתה</th><th>ילד/ה</th><th>הורה</th><th>נושא ופירוט</th><th>עדיפות</th><th>אחראי/ת</th><th>סטטוס</th><th class="acts"></th></tr></thead><tbody>
  ${list.map(c => `<tr><td>${fmtDate(c.date)}</td><td>${esc(className(c.classId))}</td><td>${esc(childName(c.childId))}</td><td>${esc(c.parentName)}<div class="small"><a href="tel:${esc(c.parentPhone)}" dir="ltr">${esc(c.parentPhone)}</a></div></td>
    <td><b>${esc(c.subject)}</b><div class="small">${esc(c.description)}</div>${c.resolution ? `<div class="small ok">טיפול: ${esc(c.resolution)}</div>` : ''}</td>
    <td>${prioPill(c.priority)}</td><td>${c.assignedTo ? esc(staffName(c.assignedTo)) : '—'}</td><td>${statusPill(c.status)}</td>
    <td class="acts">${u.isManager ? `<button class="btn sm" data-act="handleComplaint" data-id="${c.id}">טיפול</button> <button class="btn sm danger" data-act="delComplaint" data-id="${c.id}">מחיקה</button>` : c.assignedTo === u.id && c.status !== 'closed' ? `<button class="btn sm" data-act="handleComplaint" data-id="${c.id}">עדכון טיפול</button>` : ''}</td></tr>`).join('')}
  </tbody></table>${list.length ? '' : empty('אין תלונות להצגה')}</div>`;
}
