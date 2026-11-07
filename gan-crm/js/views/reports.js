'use strict';
// Screen: daily reports.
// (loaded as a classic script; see index.html for the load order)

/* ---------- דוחות יומיים ---------- */
function viewReports() {
  const u = currentUser();
  const cls = u.isManager ? fget('repClass', '') : u.classId;
  const m = fget('repMonth', todayStr().slice(0, 7));
  const list = db.reports.filter(r => (!cls || r.classId === cls) && (!validMonth(m) || r.date.startsWith(m))).sort((a, b) => b.date.localeCompare(a.date) || a.classId.localeCompare(b.classId));
  let missing = '';
  if (u.isManager) {
    const t = todayStr();
    const miss = db.classes.filter(c => !db.reports.some(r => r.date === t && r.classId === c.id));
    if (miss.length) missing = `<div class="notice">טרם הוגש דוח יומי להיום: ${miss.map(c => esc(c.name)).join(', ')}</div>`;
  }
  return `${pageHead('דוחות יומיים', 'דוח יומי של הגננת: כמות ילדים, סיכום פעילות, ארוחות ואירועים מיוחדים', `<button class="btn" data-act="print">הדפסה</button><button class="btn primary" data-act="newReport">+ דוח יומי</button>`)}
  ${missing}
  <div class="filters">${u.isManager ? filterSel('repClass', 'כיתה', classOpts(cls, 'כל הכיתות')) : ''}${filterInput('repMonth', 'חודש', m, 'month')}</div>
  ${list.map(r => `<div class="card report" style="--cc:${esc(classColor(r.classId))}">
    <div class="meta"><b>${dayName(r.date)}, ${fmtDate(r.date)}</b><span class="pill info">${esc(className(r.classId))}</span><span class="pill">👶 ${r.childrenCount} ילדים</span><span class="muted small">נכתב ע״י ${esc(staffName(r.staffId))}</span>
      <span style="margin-inline-start:auto" class="no-print">${(u.isManager || r.staffId === u.id || r.classId === u.classId) ? `<button class="btn sm" data-act="editReport" data-id="${r.id}">עריכה</button>` : ''} ${u.isManager ? `<button class="btn sm danger" data-act="delReport" data-id="${r.id}">מחיקה</button>` : ''}</span></div>
    <h4>סיכום פעילות</h4><p>${esc(r.summary)}</p>
    ${r.meals ? `<h4>ארוחות</h4><p>${esc(r.meals)}</p>` : ''}
    ${r.highlights ? `<h4>אירועים מיוחדים / פציעות / הערות</h4><p>${esc(r.highlights)}</p>` : ''}
  </div>`).join('') || empty('אין דוחות בתקופה זו')}`;
}
