'use strict';
// All button actions (the ACTIONS map).
// (loaded as a classic script; see index.html for the load order)

/* ============================ פעולות ============================ */
const ACTIONS = {
  nav: d => { state.view = d.v; state.p = {}; render(); window.scrollTo(0, 0); },
  go: d => {
    state.view = d.v; state.p = d.id ? { id: d.id } : {};
    if (d.cls) { if (d.v === 'children') F.kidsClass = d.cls; if (d.v === 'reports') F.repClass = d.cls; if (d.v === 'schedule') F.schedClass = d.cls; }
    render(); window.scrollTo(0, 0);
  },
  setF: d => { F[d.k] = d.val; render(); },
  logout: () => { logAction('יציאה מהמערכת'); save(); me = null; sessSave(); for (const k in F) delete F[k]; state.view = 'dashboard'; render(); },
  closeModal: () => closeModal(),
  print: () => window.print(),

  clock: () => {
    const u = currentUser(), t = todayStr(), now = nowTime();
    const open = openShift(u.id);
    if (open && open.date !== t) {
      open.end = open.start;
      open.note = (open.note ? open.note + ' · ' : '') + 'לא נרשמה יציאה – יש לעדכן';
      logAction(`משמרת מ-${fmtDate(open.date)} נשארה פתוחה – סומנה לבדיקה`);
      db.shifts.push({ id: uid(), staffId: u.id, date: t, start: now, end: '', note: '' });
      logAction('כניסה למשמרת ' + now);
      return commit('המשמרת הקודמת לא נסגרה ונשלחה לתיקון המנהלת. נרשמה כניסה חדשה ' + now);
    }
    if (open) { open.end = now; logAction(`יציאה ממשמרת (${open.start}–${now})`); return commit('יציאה נרשמה ' + now); }
    db.shifts.push({ id: uid(), staffId: u.id, date: t, start: now, end: '', note: '' });
    logAction('כניסה למשמרת ' + now);
    commit('כניסה נרשמה ' + now);
  },

  att: (d) => {
    const date = fget('attDate', todayStr());
    if (!db.childAttendance[date]) db.childAttendance[date] = {};
    const v = Number(d.val);
    if (db.childAttendance[date][d.id] === v) delete db.childAttendance[date][d.id];
    else db.childAttendance[date][d.id] = v;
    commit();
  },
  markAll: d => {
    const date = fget('attDate', todayStr());
    if (!db.childAttendance[date]) db.childAttendance[date] = {};
    classKids(d.cls).forEach(k => { if (d.val === '') delete db.childAttendance[date][k.id]; else db.childAttendance[date][k.id] = 1; });
    logAction(`${d.val === '' ? 'ניקוי' : 'סימון כל הילדים נוכחים'} – ${className(d.cls)} ${fmtDate(date)}`);
    commit();
  },

  editClass: d => {
    const c = db.classes.find(x => x.id === d.id);
    openModal(c ? 'עריכת כיתה' : 'כיתה חדשה', `<div class="form-grid">
      ${fld('שם הכיתה', inp('name', c?.name, 'text', 'required'))}${fld('קבוצת גיל', inp('age', c?.age))}
      ${fld('תפוסה מקסימלית', inp('capacity', c?.capacity, 'number', 'min="0"'))}${fld('צבע', inp('color', c?.color || '#86b6f2', 'color'))}</div>
      ${c ? `<button type="button" class="btn danger" data-act="delClass" data-id="${c.id}" style="align-self:flex-start">מחיקת הכיתה</button>` : ''}`,
    data => {
      if (!requireFields(data, ['name'])) return false;
      const rec = { name: data.name.trim(), age: data.age.trim(), capacity: Number(data.capacity) || 0, color: data.color };
      if (c) Object.assign(c, rec); else { const id = uid(); db.classes.push({ id, ...rec }); db.schedules[id] = DEFAULT_SCHED.map(([time, activity]) => ({ time, activity })); }
      logAction(`${c ? 'עדכון' : 'יצירת'} כיתה: ${rec.name}`);
    });
  },
  delClass: d => {
    const c = db.classes.find(x => x.id === d.id);
    if (classKids(d.id).length) return toast('לא ניתן למחוק כיתה שיש בה ילדים. יש להעביר אותם קודם.', true);
    if (!d._ok) return askConfirm(`למחוק את ${c.name}?`, () => ACTIONS.delClass({ ...d, _ok: '1' }));
    db.classes = db.classes.filter(x => x.id !== d.id); delete db.schedules[d.id];
    logAction('מחיקת כיתה: ' + c.name); closeModal(); commit('הכיתה נמחקה');
  },

  editChild: d => {
    const k = db.children.find(x => x.id === d.id);
    openModal(k ? 'עריכת פרטי ילד/ה' : 'ילד/ה חדש/ה', childForm(k), data => {
      if (!requireFields(data, ['firstName', 'lastName', 'classId'])) return false;
      const rec = { firstName: data.firstName.trim(), lastName: data.lastName.trim(), classId: data.classId, birthDate: data.birthDate, parentName: data.parentName.trim(), parentPhone: data.parentPhone.trim(), allergies: data.allergies.trim(), startDate: data.startDate, notes: data.notes.trim() };
      if (k) { if (k.classId !== rec.classId) logAction(`העברת ${rec.firstName} ${rec.lastName} מ${className(k.classId)} ל${className(rec.classId)}`); Object.assign(k, rec); }
      else db.children.push({ id: uid(), active: true, ...rec });
      logAction(`${k ? 'עדכון' : 'הוספת'} ילד/ה: ${rec.firstName} ${rec.lastName}`);
    });
  },
  delChild: d => {
    const k = db.children.find(x => x.id === d.id);
    if (!d._ok) return askConfirm(`למחוק את ${k.firstName} ${k.lastName}? היסטוריית הנוכחות תימחק מהדוחות.`, () => ACTIONS.delChild({ ...d, _ok: '1' }));
    db.children = db.children.filter(x => x.id !== d.id);
    logAction(`מחיקת ילד/ה: ${k.firstName} ${k.lastName}`); commit('נמחק');
  },
  exportKids: () => {
    const rows = [['שם פרטי', 'שם משפחה', 'כיתה', 'תאריך לידה', 'גיל', 'הורה', 'טלפון', 'אלרגיות', 'הערות']]
      .concat(activeKids().map(k => [k.firstName, k.lastName, className(k.classId), fmtDate(k.birthDate), ageText(k.birthDate), k.parentName, k.parentPhone, k.allergies, k.notes]));
    downloadCsv('רשימת-ילדים.csv', rows);
  },

  editStaff: d => {
    const s = db.staff.find(x => x.id === d.id);
    openModal(s ? 'עריכת עובד/ת' : 'עובד/ת חדש/ה', staffForm(s), data => {
      if (!requireFields(data, ['name', 'hourlyRate', 'pin'])) return false;
      const rec = { name: data.name.trim(), role: data.role, classId: data.classId, hourlyRate: Number(data.hourlyRate) || 0, phone: data.phone.trim(), pin: data.pin.trim(), startDate: data.startDate, active: data.active === 'on' };
      if (s && s.hourlyRate !== rec.hourlyRate) logAction(`שינוי שכר לשעה ל${rec.name}: ${fmtMoney(s.hourlyRate)} ← ${fmtMoney(rec.hourlyRate)}`);
      if (s) Object.assign(s, rec); else db.staff.push({ id: uid(), ...rec });
      logAction(`${s ? 'עדכון' : 'הוספת'} עובד/ת: ${rec.name}`);
    });
  },

  editShift: d => {
    const s = db.shifts.find(x => x.id === d.id);
    openModal(s ? 'עריכת משמרת' : 'הוספת משמרת', `<div class="form-grid">
      ${fld('עובד/ת', `<select name="staffId" required>${staffOpts(s?.staffId || fget('shiftStaff', ''))}</select>`)}${fld('תאריך', inp('date', s?.date || todayStr(), 'date', 'required'))}
      ${fld('שעת כניסה', inp('start', s?.start || '07:00', 'time', 'required'))}${fld('שעת יציאה', inp('end', s?.end || '', 'time'))}
      ${fld('הערה', inp('note', s?.note), 'full')}</div>`,
    data => {
      if (!requireFields(data, ['staffId', 'date', 'start'])) return false;
      const rec = { staffId: data.staffId, date: data.date, start: data.start, end: data.end, note: data.note.trim() };
      if (s) { logAction(`תיקון משמרת של ${staffName(rec.staffId)} ${fmtDate(rec.date)}: ${s.start}–${s.end || '?'} ← ${rec.start}–${rec.end || '?'}`); Object.assign(s, rec); }
      else { db.shifts.push({ id: uid(), ...rec }); logAction(`הוספת משמרת ידנית ל${staffName(rec.staffId)} ${fmtDate(rec.date)} ${rec.start}–${rec.end || '?'}`); }
    });
  },
  delShift: d => {
    const s = db.shifts.find(x => x.id === d.id);
    if (!d._ok) return askConfirm('למחוק את המשמרת?', () => ACTIONS.delShift({ ...d, _ok: '1' }));
    db.shifts = db.shifts.filter(x => x.id !== d.id);
    logAction(`מחיקת משמרת של ${staffName(s.staffId)} ${fmtDate(s.date)}`); commit('נמחק');
  },
  exportShifts: d => {
    const list = db.shifts.filter(s => s.date.startsWith(d.m) && (!d.sid || s.staffId === d.sid)).sort((a, b) => a.date.localeCompare(b.date));
    downloadCsv(`נוכחות-צוות-${d.m}.csv`, [['תאריך', 'יום', 'עובד/ת', 'כניסה', 'יציאה', 'שעות', 'הערה']].concat(list.map(s => [fmtDate(s.date), DAYS[dow(s.date)], staffName(s.staffId), s.start, s.end, fmtHours(shiftMinutes(s)), s.note])));
  },
  exportKidsMonth: d => {
    const { days, rows } = kidsMonthData(d.cls, d.m);
    downloadCsv(`נוכחות-${className(d.cls)}-${d.m}.csv`, [['ילד/ה'].concat(days.map(fmtDate), ['נוכח', 'נעדר', '%'])].concat(rows.map(r => [`${r.k.firstName} ${r.k.lastName}`].concat(r.vals.map(v => (v === 1 ? 'V' : v === 0 ? 'X' : '')), [r.pres, r.abs, r.pct ?? '']))));
  },

  newReport: () => openReportModal(null),
  editReport: d => openReportModal(db.reports.find(r => r.id === d.id)),
  delReport: d => {
    const r = db.reports.find(x => x.id === d.id);
    if (!d._ok) return askConfirm('למחוק את הדוח?', () => ACTIONS.delReport({ ...d, _ok: '1' }));
    db.reports = db.reports.filter(x => x.id !== d.id);
    logAction(`מחיקת דוח יומי – ${className(r.classId)} ${fmtDate(r.date)}`); commit('נמחק');
  },

  newComplaint: () => openComplaintModal(),
  handleComplaint: d => {
    const c = db.complaints.find(x => x.id === d.id);
    const u = currentUser();
    openModal('טיפול בתלונה', `<div class="info-box"><b>${esc(c.subject)}</b><br>${esc(c.description)}<br><span class="small muted">${fmtDate(c.date)} · ${esc(childName(c.childId))} · ${esc(c.parentName)}</span></div>
      <div class="form-grid">
      ${fld('סטטוס', `<select name="status">${Object.entries(COMPLAINT_STATUS).map(([v, [l]]) => opt(v, l, c.status)).join('')}</select>`)}
      ${u.isManager ? fld('אחראי/ת לטיפול', `<select name="assignedTo">${staffOpts(c.assignedTo, 'המנהלת')}</select>`) : ''}
      ${fld('אופן הטיפול / סיכום', area('resolution', c.resolution, 'rows="3"'), 'full')}</div>`,
    data => {
      const before = c.status;
      c.status = data.status; c.resolution = data.resolution.trim(); c.updatedAt = Date.now();
      if (u.isManager) c.assignedTo = data.assignedTo;
      logAction(`עדכון תלונה "${c.subject}": ${COMPLAINT_STATUS[before][0]} ← ${COMPLAINT_STATUS[c.status][0]}`);
    });
  },
  delComplaint: d => {
    const c = db.complaints.find(x => x.id === d.id);
    if (!d._ok) return askConfirm('למחוק את התלונה?', () => ACTIONS.delComplaint({ ...d, _ok: '1' }));
    db.complaints = db.complaints.filter(x => x.id !== d.id);
    logAction(`מחיקת תלונה: ${c.subject}`); commit('נמחק');
  },

  editSchedule: d => {
    if (!canEditSchedule(d.cls)) return;
    const items = (db.schedules[d.cls] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
    openModal(`עריכת סדר יום – ${className(d.cls)}`, `<p class="small muted" style="margin:0">שורה לכל פעילות, בפורמט: <b>שעה פעילות</b>. לדוגמה: <code dir="ltr">08:00 ארוחת בוקר</code></p>
      ${fld('סדר היום', area('lines', items.map(i => `${i.time} ${i.activity}`).join('\n'), 'rows="14" dir="rtl"'))}`,
    data => {
      const out = [], bad = [];
      data.lines.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
        const m = l.match(/^(\d{1,2}:\d{2})\s*[-–:]?\s*(.+)$/);
        if (m) out.push({ time: m[1].padStart(5, '0'), activity: m[2].trim() }); else bad.push(l);
      });
      if (bad.length) { toast('שורות לא תקינות: ' + bad.join(' | '), true); return false; }
      db.schedules[d.cls] = out.sort((a, b) => a.time.localeCompare(b.time));
      logAction(`עדכון סדר יום – ${className(d.cls)}`);
    });
  },

  newMessage: d => {
    const groups = [opt('all', 'כל הצוות', d.to ? '' : 'all'), opt('role:גננת', 'כל הגננות', ''), opt('role:סייעת', 'כל הסייעות', '')]
      .concat(db.classes.map(c => opt('class:' + c.id, `צוות ${c.name}`, '')));
    openModal('הודעה חדשה', `${fld('אל', `<select name="to">${`<optgroup label="קבוצות">${groups.join('')}</optgroup><optgroup label="הודעה אישית">${activeStaff().map(s => opt(s.id, s.name, d.to)).join('')}</optgroup>`}</select>`)}
      ${fld('נושא', inp('subject', '', 'text', 'required'))}${fld('תוכן ההודעה', area('body', '', 'rows="5" required'))}`,
    data => {
      if (!requireFields(data, ['subject', 'body'])) return false;
      let recipients = [], toLabel = '';
      const act = activeStaff();
      if (data.to === 'all') { recipients = act.map(s => s.id); toLabel = 'כל הצוות'; }
      else if (data.to.startsWith('role:')) { const r = data.to.slice(5); recipients = act.filter(s => s.role === r).map(s => s.id); toLabel = r === 'גננת' ? 'כל הגננות' : 'כל הסייעות'; }
      else if (data.to.startsWith('class:')) { const c = data.to.slice(6); recipients = act.filter(s => s.classId === c).map(s => s.id); toLabel = 'צוות ' + className(c); }
      else { recipients = [data.to]; toLabel = staffName(data.to); }
      if (!recipients.length) { toast('אין נמענים בקבוצה שנבחרה', true); return false; }
      db.messages.push({ id: uid(), toLabel, recipients, subject: data.subject.trim(), body: data.body.trim(), createdAt: Date.now(), readBy: [] });
      logAction(`שליחת הודעה "${data.subject.trim()}" אל ${toLabel}`);
      toast('ההודעה נשלחה');
    }, 'שליחה');
  },
  readMsg: d => { const m = db.messages.find(x => x.id === d.id); if (m && !m.readBy.includes(me.id)) { m.readBy.push(me.id); logAction(`קריאת הודעה: ${m.subject}`); } commit(); },
  readAll: () => { myMessages().forEach(m => { if (!m.readBy.includes(me.id)) m.readBy.push(me.id); }); logAction('סימון כל ההודעות כנקראו'); commit(); },
  delMessage: d => { if (!d._ok) return askConfirm('למחוק את ההודעה?', () => ACTIONS.delMessage({ ...d, _ok: '1' })); const m = db.messages.find(x => x.id === d.id); db.messages = db.messages.filter(x => x.id !== d.id); logAction('מחיקת הודעה: ' + m.subject); commit(); },

  newReminder: () => {
    openModal('תזכורת / בקשה למנהלת', `${fld('מה צריך?', area('text', '', 'rows="3" required placeholder="לדוגמה: נגמרו מגבונים, צריך להזמין"'))}
      <div class="form-grid">${fld('עד תאריך', inp('dueDate', '', 'date'))}${fld('עדיפות', `<select name="priority">${['רגילה', 'גבוהה', 'דחופה'].map(p => opt(p, p, 'רגילה')).join('')}</select>`)}</div>`,
    data => {
      if (!requireFields(data, ['text'])) return false;
      db.reminders.push({ id: uid(), fromStaffId: me.id, text: data.text.trim(), dueDate: data.dueDate, priority: data.priority, status: 'open', managerNote: '', createdAt: Date.now() });
      logAction('שליחת תזכורת למנהלת: ' + data.text.trim());
      toast('התזכורת נשלחה למנהלת');
    }, 'שליחה');
  },
  doneReminder: d => { const r = db.reminders.find(x => x.id === d.id); r.status = 'done'; r.doneAt = Date.now(); logAction('סימון תזכורת כבוצעה: ' + r.text); commit('סומן כבוצע'); },
  reopenReminder: d => { const r = db.reminders.find(x => x.id === d.id); r.status = 'open'; logAction('פתיחה מחדש של תזכורת: ' + r.text); commit(); },
  noteReminder: d => {
    const r = db.reminders.find(x => x.id === d.id);
    openModal('תשובה לתזכורת', `<div class="info-box">${esc(r.text)}<br><span class="small muted">מאת ${esc(staffName(r.fromStaffId))}</span></div>${fld('תשובת המנהלת', area('note', r.managerNote, 'rows="3"'))}
      <label class="fld check"><input type="checkbox" name="done" ${r.status === 'done' ? 'checked' : ''}> סימון כבוצע</label>`,
    data => { r.managerNote = data.note.trim(); r.status = data.done === 'on' ? 'done' : 'open'; logAction('תשובה לתזכורת: ' + r.text); });
  },
  delReminder: d => { if (!d._ok) return askConfirm('למחוק את התזכורת?', () => ACTIONS.delReminder({ ...d, _ok: '1' })); db.reminders = db.reminders.filter(x => x.id !== d.id); commit(); },

  payDetail: d => { F.attTab = 'staff'; F.shiftStaff = d.sid; F.shiftMonth = d.m; state.view = 'attendance'; state.p = {}; render(); window.scrollTo(0, 0); },
  exportPayroll: d => {
    const rows = db.staff.map(s => ({ s, ...staffMonth(s.id, d.m) })).filter(r => r.s.active !== false || r.mins > 0);
    const tot = rows.reduce((a, r) => ({ mins: a.mins + r.mins, gross: a.gross + r.gross }), { mins: 0, gross: 0 });
    downloadCsv(`דוח-שכר-${d.m}.csv`, [['עובד/ת', 'תפקיד', 'כיתה', 'ימי עבודה', 'שעות', 'שכר לשעה', 'ברוטו']]
      .concat(rows.map(r => [r.s.name, r.s.role, className(r.s.classId), r.days, (r.mins / 60).toFixed(2), r.rate, r.gross.toFixed(2)]))
      .concat([['סה״כ', '', '', '', (tot.mins / 60).toFixed(2), '', tot.gross.toFixed(2)]]));
  },

  restoreText: () => {
    openModal('שחזור מטקסט גיבוי', `${fld('מדביקים כאן את טקסט הגיבוי', area('json', '', 'rows="8" dir="ltr" required'))}<p class="small muted" style="margin:0">כל הנתונים הנוכחיים יוחלפו.</p>`, data => {
      try {
        const parsed = JSON.parse(data.json);
        if (!parsed || !Array.isArray(parsed.classes) || !Array.isArray(parsed.staff)) throw new Error('הטקסט אינו גיבוי תקין');
        db = migrate(parsed); logAction('שחזור מגיבוי'); toast('השחזור הושלם');
      } catch (err) { toast('שחזור נכשל: ' + err.message, true); return false; }
    }, 'שחזור');
  },
  backup: () => { downloadFile(`גיבוי-גן-${todayStr()}.json`, JSON.stringify(db, null, 1), 'application/json'); logAction('הורדת גיבוי'); save(); },
  wipe: (d = {}) => {
    if (!d._ok) return askConfirm('למחוק את כל הנתונים? מומלץ להוריד גיבוי קודם. הפעולה אינה הפיכה.', () => ACTIONS.wipe({ ...d, _ok: '1' }));
    const keep = db.settings;
    db = emptyDb(); db.settings = { ...keep, demo: false };
    db.classes = baseClasses();
    db.classes.forEach(c => { db.schedules[c.id] = (c.id === 'c1' ? BABY_SCHED : DEFAULT_SCHED).map(([time, activity]) => ({ time, activity })); });
    logAction('מחיקת כל הנתונים'); commit('הנתונים נמחקו. אפשר להתחיל להוסיף צוות וילדים.');
  },
  loadDemo: (d = {}) => {
    if (!d._ok) return askConfirm('לטעון נתוני הדגמה? כל הנתונים הנוכחיים יוחלפו.', () => ACTIONS.loadDemo({ ...d, _ok: '1' }));
    db = seed(); me = { id: 'manager' }; sessSave(); commit('נתוני ההדגמה נטענו');
  }
};

ACTIONS.copyBox = () => {
  const t = document.getElementById('copyBox');
  const fallback = () => { t.focus(); t.select(); toast('הטקסט מסומן. אפשר להעתיק אותו ידנית.'); };
  try { navigator.clipboard.writeText(t.value).then(() => toast('הועתק'), fallback); } catch (e) { fallback(); }
};
