'use strict';
// Screen: classes.
// (loaded as a classic script; see index.html for the load order)

/* ---------- כיתות ---------- */
function viewClasses() {
  const t = todayStr(), att = db.childAttendance[t] || {};
  const total = activeKids().length;
  return `${pageHead('כיתות', `סה״כ ${total} ילדים ב-${db.classes.length} כיתות`, `<button class="btn primary" data-act="editClass">+ כיתה חדשה</button>`)}
  <div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>כיתה</th><th>גיל</th><th class="num">ילדים</th><th class="num">תפוסה מקסימלית</th><th class="num">מקומות פנויים</th><th class="num">נוכחים היום</th><th>צוות</th></tr></thead><tbody>
    ${db.classes.map(c => { const k = classKids(c.id); return `<tr><td><span class="dot" style="background:${esc(c.color)}"></span><b>${esc(c.name)}</b></td><td>${esc(c.age)}</td><td class="num">${k.length}</td><td class="num">${c.capacity || '–'}</td><td class="num">${c.capacity ? Math.max(0, c.capacity - k.length) : '–'}</td><td class="num">${k.filter(x => att[x.id] === 1).length}</td><td>${classStaff(c.id).map(s => esc(s.name)).join(', ') || '—'}</td></tr>`; }).join('')}
  </tbody><tfoot><tr><td>סה״כ</td><td></td><td class="num">${total}</td><td class="num">${db.classes.reduce((a, c) => a + (Number(c.capacity) || 0), 0)}</td><td></td><td class="num">${activeKids().filter(x => att[x.id] === 1).length}</td><td></td></tr></tfoot></table></div>
  <div class="grid cards4">${db.classes.map(c => {
    const k = classKids(c.id);
    return `<div class="card class-card" style="--cc:${esc(c.color)}">
      <div class="cc-head"><h3>${esc(c.name)}</h3><span class="pill">${k.length} ילדים</span></div>
      <div class="muted small">${classStaff(c.id).map(s => `${esc(s.role)}: ${esc(s.name)}`).join(' · ') || 'אין צוות משויך'}</div>
      <div class="chips">${k.map(x => `<span class="chip">${esc(x.firstName)} ${esc(x.lastName)}</span>`).join('') || '<span class="muted small">אין ילדים</span>'}</div>
      <div class="actions" style="margin-top:12px">
        <button class="btn sm" data-act="go" data-v="children" data-cls="${c.id}">ילדים</button>
        <button class="btn sm" data-act="go" data-v="schedule" data-cls="${c.id}">סדר יום</button>
        <button class="btn sm" data-act="go" data-v="reports" data-cls="${c.id}">דוחות</button>
        <button class="btn sm" data-act="editClass" data-id="${c.id}">עריכה</button>
      </div></div>`;
  }).join('')}</div>`;
}
