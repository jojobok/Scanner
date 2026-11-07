'use strict';
// Forms: child, employee, daily report, complaint.
// (loaded as a classic script; see index.html for the load order)

/* ============================ טפסים ============================ */
function childForm(k = {}) {
  return `<div class="form-grid">
    ${fld('שם פרטי', inp('firstName', k.firstName, 'text', 'required'))}${fld('שם משפחה', inp('lastName', k.lastName, 'text', 'required'))}
    ${fld('כיתה', `<select name="classId" required>${classOpts(k.classId || fget('kidsClass', ''))}</select>`)}${fld('תאריך לידה', inp('birthDate', k.birthDate, 'date'))}
    ${fld('שם הורה', inp('parentName', k.parentName))}${fld('טלפון הורה', inp('parentPhone', k.parentPhone, 'tel'))}
    ${fld('אלרגיות / רגישויות', inp('allergies', k.allergies))}${fld('תאריך הצטרפות', inp('startDate', k.startDate || todayStr(), 'date'))}
    ${fld('הערות', area('notes', k.notes), 'full')}</div>`;
}
function staffForm(s = {}) {
  return `<div class="form-grid">
    ${fld('שם מלא', inp('name', s.name, 'text', 'required'))}
    ${fld('תפקיד', `<select name="role">${['גננת', 'סייעת', 'מטפלת', 'אחר'].map(r => opt(r, r, s.role || 'סייעת')).join('')}</select>`)}
    ${fld('כיתה', `<select name="classId">${opt('', 'ללא כיתה קבועה', s.classId)}${classOpts(s.classId)}</select>`)}
    ${fld('שכר לשעה (₪)', inp('hourlyRate', s.hourlyRate, 'number', 'min="0" step="0.01" required'))}
    ${fld('טלפון', inp('phone', s.phone, 'tel'))}
    ${fld('קוד כניסה אישי', inp('pin', s.pin, 'text', 'required inputmode="numeric" autocomplete="off"'))}
    ${fld('תאריך תחילת עבודה', inp('startDate', s.startDate || todayStr(), 'date'))}
    <label class="fld check"><input type="checkbox" name="active" ${s.active === false ? '' : 'checked'}> עובד/ת פעיל/ה</label></div>`;
}

function requireFields(data, names) {
  for (const n of names) if (!String(data[n] ?? '').trim()) { toast('יש למלא את כל שדות החובה', true); return false; }
  return true;
}

// Daily report form.
// - Editing an existing report: class and date are locked (in the form AND when saving),
//   so a report can never move to another class or day.
// - "+ daily report": the report of the chosen class for today. If that class already
//   has today's report, it opens for editing (locked). Otherwise a new report is created;
//   saving a new report for a class+date that already has one is blocked.
function openReportModal(r) {
  const u = currentUser();
  const today = todayStr();
  if (!r) {
    const hasReport = c => db.reports.some(x => x.date === today && x.classId === c);
    const cls = u.isManager
      ? (fget('repClass', '') || (db.classes.find(c => !hasReport(c.id)) || db.classes[0] || {}).id)
      : u.classId;
    r = db.reports.find(x => x.date === today && x.classId === cls) || null;
    if (!r) return openNewReportModal(u, cls, today);
  }
  const report = r;
  const att = db.childAttendance[report.date] || {};
  const autoCount = classKids(report.classId).filter(k => att[k.id] === 1).length;
  openModal('עריכת דוח יומי', `<div class="form-grid">
    ${fld('תאריך', `<input value="${esc(fmtDate(report.date))}" disabled data-locked="date">`)}
    ${fld('כיתה', `<input value="${esc(className(report.classId))}" disabled data-locked="class">`)}
    <p class="small muted full" style="margin:0">בעריכת דוח קיים הכיתה והתאריך נעולים. לדוח של כיתה או יום אחרים יוצרים דוח חדש.</p>
    ${reportFieldsHtml(report, autoCount)}</div>`,
  data => {
    if (!requireFields(data, ['summary'])) return false;
    if (!db.reports.includes(report)) { toast('הדוח נמחק בינתיים ולא נשמר.', true); return false; }
    Object.assign(report, reportContent(data), { updatedAt: Date.now() });
    logAction(`עדכון דוח יומי – ${className(report.classId)} ${fmtDate(report.date)} (${report.childrenCount} ילדים)`);
    toast('הדוח נשמר');
  });
}

function openNewReportModal(u, cls, date) {
  const att = db.childAttendance[date] || {};
  const autoCount = classKids(cls).filter(k => att[k.id] === 1).length;
  openModal('דוח יומי חדש', `<div class="form-grid">
    ${fld('תאריך', inp('date', date, 'date', 'required'))}
    ${u.isManager ? fld('כיתה', `<select name="classId">${classOpts(cls)}</select>`) : `<input type="hidden" name="classId" value="${esc(cls)}">` + fld('כיתה', `<input value="${esc(className(cls))}" disabled>`)}
    ${reportFieldsHtml(null, autoCount)}</div>`,
  data => {
    if (!requireFields(data, ['date', 'classId', 'summary'])) return false;
    const classId = u.isManager ? data.classId : u.classId;
    if (db.reports.some(x => x.date === data.date && x.classId === classId)) {
      toast(`ל${className(classId)} כבר יש דוח בתאריך ${fmtDate(data.date)}. הדוח הקיים לא שונה – אפשר לערוך אותו מרשימת הדוחות.`, true);
      return false;
    }
    const rec = { date: data.date, classId, ...reportContent(data) };
    db.reports.push({ id: uid(), staffId: u.id, createdAt: Date.now(), ...rec });
    logAction(`הגשת דוח יומי – ${className(classId)} ${fmtDate(data.date)} (${rec.childrenCount} ילדים)`);
    toast('הדוח נשמר');
  });
}

function reportFieldsHtml(r, autoCount) {
  return `${fld(`כמות ילדים שהגיעו היום ${autoCount ? `<span class="muted">(לפי הנוכחות: ${autoCount})</span>` : ''}`, inp('childrenCount', r ? r.childrenCount : autoCount, 'number', 'min="0" required'))}
    <div></div>
    ${fld('סיכום הפעילות היום *', area('summary', r?.summary, 'required rows="4" placeholder="מה עשינו היום: פעילויות, נושא שבועי, חוגים, משחקים…"'), 'full')}
    ${fld('ארוחות', area('meals', r?.meals, 'rows="2" placeholder="מה אכלו, מי לא אכל…"'), 'full')}
    ${fld('אירועים מיוחדים / פציעות / הערות', area('highlights', r?.highlights, 'rows="2"'), 'full')}`;
}
const reportContent = data => ({ childrenCount: Number(data.childrenCount) || 0, summary: data.summary.trim(), meals: data.meals.trim(), highlights: data.highlights.trim() });

function openComplaintModal() {
  const u = currentUser();
  const kids = u.isManager ? activeKids() : activeKids().filter(k => k.classId === u.classId).concat(activeKids().filter(k => k.classId !== u.classId));
  openModal('תלונת הורה חדשה', `<div class="form-grid">
    ${fld('תאריך', inp('date', todayStr(), 'date', 'required'))}
    ${fld('ילד/ה', `<select name="childId" data-change="complaintChild" required>${opt('', 'בחירה…', '')}${kids.map(k => opt(k.id, `${k.firstName} ${k.lastName} – ${className(k.classId)}`, '')).join('')}</select>`)}
    ${fld('שם ההורה', inp('parentName'))}${fld('טלפון ההורה', inp('parentPhone', '', 'tel'))}
    ${fld('נושא *', inp('subject', '', 'text', 'required'), 'full')}
    ${fld('פירוט התלונה', area('description', '', 'rows="4"'), 'full')}
    ${fld('עדיפות', `<select name="priority">${['רגילה', 'גבוהה', 'דחופה'].map(p => opt(p, p, 'רגילה')).join('')}</select>`)}
    ${u.isManager ? fld('אחראי/ת לטיפול', `<select name="assignedTo">${staffOpts('', 'המנהלת')}</select>`) : ''}</div>`,
  data => {
    if (!requireFields(data, ['date', 'childId', 'subject'])) return false;
    const child = db.children.find(k => k.id === data.childId);
    db.complaints.push({ id: uid(), date: data.date, childId: data.childId, classId: child ? child.classId : '', parentName: data.parentName.trim(), parentPhone: data.parentPhone.trim(), subject: data.subject.trim(), description: data.description.trim(), priority: data.priority, status: 'open', assignedTo: data.assignedTo || '', resolution: '', createdBy: u.id, createdAt: Date.now() });
    logAction(`רישום תלונת הורה: "${data.subject.trim()}" (${childName(data.childId)})`);
    toast('התלונה נרשמה');
  });
}
