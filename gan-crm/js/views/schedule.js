'use strict';
// Screen: daily schedule per class.
// (loaded as a classic script; see index.html for the load order)

/* ---------- סדר יום ---------- */
function scheduleList(cid) {
  const items = (db.schedules[cid] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  if (!items.length) return empty('לא הוגדר סדר יום');
  const now = nowTime();
  let cur = -1;
  items.forEach((it, i) => { if (it.time.padStart(5, '0') <= now) cur = i; });
  if (cur === items.length - 1 && now > '17:00') cur = -1;
  return `<ul class="timeline">${items.map((it, i) => `<li class="${i === cur ? 'now' : ''}"><time>${esc(it.time)}</time><span>${esc(it.activity)}</span></li>`).join('')}</ul>`;
}
function canEditSchedule(cid) { const u = currentUser(); return u.isManager || (u.classId === cid && u.role === 'גננת'); }
function viewSchedule() {
  const u = currentUser();
  const cid = fget('schedClass', u.isManager ? db.classes[0]?.id : u.classId);
  return `${pageHead('סדר יום', 'סדר היום הקבוע לכל כיתה', `<button class="btn" data-act="print">הדפסה</button>${canEditSchedule(cid) ? `<button class="btn primary" data-act="editSchedule" data-cls="${cid}">עריכת סדר היום</button>` : ''}`)}
  ${tabs('schedClass', db.classes.map(c => [c.id, c.name]), cid)}
  <div class="card class-card" style="--cc:${esc(classColor(cid))}"><div class="card-head"><h3>${esc(className(cid))}</h3></div>${scheduleList(cid)}</div>`;
}
