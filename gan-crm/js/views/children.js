'use strict';
// Screen: children.
// (loaded as a classic script; see index.html for the load order)

/* ---------- ילדים ---------- */
function viewChildren() {
  const u = currentUser();
  const cls = u.isManager ? fget('kidsClass', '') : u.classId;
  const q = fget('kidsSearch', '').trim();
  let list = activeKids().filter(k => !cls || k.classId === cls);
  if (q) list = list.filter(k => `${k.firstName} ${k.lastName} ${k.parentName} ${k.parentPhone}`.includes(q));
  return `${pageHead('ילדים', `${list.length} ילדים${cls ? ' ב' + esc(className(cls)) : ''}`, u.isManager ? `<button class="btn" data-act="exportKids">ייצוא לאקסל</button><button class="btn primary" data-act="editChild">+ ילד/ה חדש/ה</button>` : '')}
  <div class="filters">
    ${u.isManager ? filterSel('kidsClass', 'כיתה', classOpts(cls, 'כל הכיתות')) : ''}
    ${fld('חיפוש', `<input id="kidsSearch" type="search" data-input="kidsSearch" value="${esc(q)}" placeholder="שם ילד / הורה / טלפון">`)}
  </div>
  <div class="table-wrap"><table><thead><tr><th>שם</th><th>כיתה</th><th>גיל</th><th>הורה</th><th>טלפון</th><th>רגישויות / הערות</th>${u.isManager ? '<th class="acts"></th>' : ''}</tr></thead><tbody>
  ${list.map(k => `<tr><td><b>${esc(k.firstName)} ${esc(k.lastName)}</b></td><td><span class="dot" style="background:${esc(classColor(k.classId))}"></span>${esc(className(k.classId))}</td><td>${ageText(k.birthDate)}</td><td>${esc(k.parentName)}</td><td><a href="tel:${esc(k.parentPhone)}" dir="ltr">${esc(k.parentPhone)}</a></td><td>${k.allergies ? `<span class="pill bad">${esc(k.allergies)}</span> ` : ''}${esc(k.notes)}</td>
    ${u.isManager ? `<td class="acts"><button class="btn sm" data-act="editChild" data-id="${k.id}">עריכה</button> <button class="btn sm danger" data-act="delChild" data-id="${k.id}">מחיקה</button></td>` : ''}</tr>`).join('')}
  </tbody></table>${list.length ? '' : empty('לא נמצאו ילדים')}</div>`;
}
