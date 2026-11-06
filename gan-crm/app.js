'use strict';
/* =====================================================================
   מערכת CRM לניהול גן ילדים
   קובץ יחיד, ללא שרת. כל הנתונים נשמרים ב-localStorage של הדפדפן.
   ===================================================================== */

const STORE_KEY = 'gan_crm_v1';
const SESSION_KEY = 'gan_crm_session';

/* ---------------------------- עזרים ---------------------------- */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dateToStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dateToStr(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseDate = s => new Date(s + 'T12:00:00');
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateToStr(d); };
const dow = s => parseDate(s).getDay();
const fmtDate = s => (s ? s.split('-').reverse().join('/') : '');
const fmtDateTime = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const dayName = s => 'יום ' + DAYS[dow(s)];
const monthLabel = m => { const [y, mm] = m.split('-').map(Number); return `${MONTHS[mm - 1]} ${y}`; };
const fmtMoney = n => '₪' + (Number(n) || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtHM = mins => `${Math.floor(mins / 60)}:${pad(Math.round(mins % 60))}`;
const fmtHours = mins => (Math.round(mins / 60 * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const validMonth = m => /^\d{4}-\d{2}$/.test(m || '');
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const validTime = t => /^\d{1,2}:\d{2}$/.test(t || '');

function minutesBetween(a, b) {
  if (!validTime(a) || !validTime(b)) return 0;
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  let d = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (d < 0) d += 24 * 60; // משמרת שעוברת חצות
  return d;
}
function daysInMonth(m) {
  const [y, mm] = m.split('-').map(Number);
  const n = new Date(y, mm, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${m}-${pad(i + 1)}`);
}
function ageText(birth) {
  if (!validDate(birth)) return '';
  const b = parseDate(birth), t = new Date();
  let months = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth());
  if (t.getDate() < b.getDate()) months--;
  if (months < 0) return '';
  if (months < 12) return `${months} חודשים`;
  const y = Math.floor(months / 12), m = months % 12;
  const ys = y === 1 ? 'שנה' : y === 2 ? 'שנתיים' : `${y} שנים`;
  return m ? `${ys} ו-${m} ח׳` : ys;
}

/* ---------------------------- נתונים ---------------------------- */
function emptyDb() {
  return {
    version: 1,
    settings: { gardenName: 'הגן שלנו', managerName: 'המנהלת', managerPin: '1234', demo: false },
    classes: [], staff: [], children: [], childAttendance: {}, shifts: [], reports: [],
    complaints: [], schedules: {}, messages: [], reminders: [], log: []
  };
}

const DEFAULT_SCHED = [['07:00', 'קבלת ילדים ומשחק חופשי'], ['08:00', 'ארוחת בוקר'], ['08:45', 'מפגש בוקר – שירים וסיפור'], ['09:30', 'פעילות מרכזית / יצירה'], ['10:15', 'משחק בחצר'], ['11:00', 'פרי ושתייה'], ['11:30', 'ארוחת צהריים'], ['12:15', 'שנת צהריים'], ['14:30', 'ארוחת מנחה'], ['15:00', 'משחק חופשי ופעילות שקטה'], ['16:00', 'איסוף ילדים']];
const BABY_SCHED = [['07:00', 'קבלת תינוקות'], ['07:30', 'בקבוק / ארוחת בוקר'], ['08:30', 'שנת בוקר (לפי צורך)'], ['09:30', 'החתלה ופעילות חושית'], ['10:30', 'טיול בעגלה / חצר'], ['11:15', 'ארוחת צהריים'], ['12:00', 'שנת צהריים'], ['14:00', 'החתלה ובקבוק'], ['14:30', 'משחק על השטיח'], ['16:00', 'איסוף']];

function baseClasses() {
  return [
    { id: 'c1', name: 'תינוקייה', age: 'עד שנה', capacity: 8, color: '#f4a3c8' },
    { id: 'c2', name: 'גיל שנה וחצי', age: 'שנה וחצי', capacity: 12, color: '#f5c74f' },
    { id: 'c3', name: 'גיל שנתיים', age: 'שנתיים', capacity: 14, color: '#7fd19a' },
    { id: 'c4', name: 'גיל שנתיים וחצי', age: 'שנתיים וחצי', capacity: 16, color: '#86b6f2' }
  ];
}

function seed() {
  const d = emptyDb();
  d.settings.gardenName = 'גן השמש';
  d.settings.demo = true;
  d.classes = baseClasses();
  d.classes.forEach(c => { d.schedules[c.id] = (c.id === 'c1' ? BABY_SCHED : DEFAULT_SCHED).map(([time, activity]) => ({ time, activity })); });

  const staff = [['רונית כהן', 'גננת', 'c1', 62], ['מירב לוי', 'סייעת', 'c1', 42], ['שירה אברהם', 'גננת', 'c2', 60], ['אורית מזרחי', 'סייעת', 'c2', 40],
    ['יעל פרץ', 'גננת', 'c3', 64], ['נועה ביטון', 'סייעת', 'c3', 41], ['הדס דהן', 'גננת', 'c4', 65], ['טל אוחיון', 'סייעת', 'c4', 42]];
  d.staff = staff.map(([name, role, classId, rate], i) => ({
    id: 's' + (i + 1), name, role, classId, hourlyRate: rate, phone: `050-00000${pad(i + 1)}`, pin: '1111', startDate: '2025-09-01', active: true
  }));

  const first = ['נועם', 'מאיה', 'איתי', 'תמר', 'אורי', 'ליה', 'יונתן', 'שירה', 'דניאל', 'נגה', 'אריאל', 'רוני', 'עומר', 'הילה', 'יואב', 'אלה', 'איתן', 'מיכל', 'גיא', 'עדי', 'אביב', 'רומי', 'בן', 'שקד', 'אלון', 'יעלי', 'הראל', 'אגם', 'לביא', 'מעיין', 'עידו', 'אור', 'ליאם', 'נטע', 'אדם', 'הלל', 'יהלי', 'שחר'];
  const last = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אזולאי', 'גבאי', 'שפירא', 'חדד', 'אלון', 'ברק'];
  const parents = ['רחל', 'משה', 'דנה', 'אבי', 'סיגל', 'יוסי', 'מורן', 'אלי', 'קרן', 'רון'];
  const counts = { c1: 6, c2: 9, c3: 11, c4: 12 };
  const baseMonths = { c1: 5, c2: 17, c3: 23, c4: 29 };
  const t = todayStr();
  let k = 0;
  for (const c of d.classes) {
    for (let i = 0; i < counts[c.id]; i++, k++) {
      const ln = last[(k * 5) % last.length];
      const bd = parseDate(t); bd.setMonth(bd.getMonth() - (baseMonths[c.id] + (k % 5))); bd.setDate(1 + (k * 3) % 27);
      d.children.push({
        id: 'k' + (k + 1), firstName: first[k % first.length], lastName: ln, classId: c.id, birthDate: dateToStr(bd),
        parentName: `${parents[k % parents.length]} ${ln}`, parentPhone: `052-11${pad(k)}${pad(k * 7 % 100)}`.slice(0, 11),
        allergies: k % 9 === 0 ? 'אלרגיה לבוטנים' : (k % 13 === 0 ? 'רגישות ללקטוז' : ''), notes: '', startDate: '2025-09-01', active: true
      });
    }
  }

  // נוכחות ומשמרות ל-45 הימים האחרונים
  for (let i = 45; i >= 0; i--) {
    const day = addDays(t, -i), w = dow(day);
    if (w === 5 || w === 6) continue;
    d.childAttendance[day] = {};
    d.children.forEach((ch, j) => { d.childAttendance[day][ch.id] = ((j * 7 + i * 3) % 11 === 0) ? 0 : 1; });
    d.staff.forEach((s, j) => {
      if ((i + j * 5) % 23 === 0 && i > 0) return; // יום חופש מדי פעם
      const startM = 7 * 60 - 5 + ((i * 3 + j * 7) % 12);
      const endM = (s.role === 'גננת' ? 16 * 60 : 15 * 60 + 30) + ((i + j * 3) % 15) - 5;
      d.shifts.push({ id: uid(), staffId: s.id, date: day, start: `${pad(Math.floor(startM / 60))}:${pad(startM % 60)}`, end: i === 0 ? '' : `${pad(Math.floor(endM / 60))}:${pad(endM % 60)}`, note: '' });
    });
  }

  const summaries = [
    ['פעילות יצירה עם צבעי אצבעות ושיר על הסתיו. הילדים נהנו מאוד בחצר.', 'כולם אכלו יפה, פסטה ועוף בצהריים.'],
    ['סיפור "הגזר הענק" ומשחק תפקידים. עבדנו על מוטוריקה עדינה עם פלסטלינה.', 'ארוחת בוקר מלאה, חלק לא סיימו את הירקות.'],
    ['יום ספורט קטן – מסלול מכשולים וזחילה במנהרות. שירה במעגל.', 'אורז, שניצל וירקות מבושלים.'],
    ['פעילות חושית עם חול קינטי ומים. קבלת שבת עם חלה ונרות.', 'כולם אכלו, שתו הרבה מים.'],
    ['משחקי צבעים והתאמה, הכרת בעלי חיים ומשק. טיול קצר בשכונה.', 'קציצות עם פירה, פירות במנחה.']
  ];
  const workdays = Object.keys(d.childAttendance).sort().reverse().slice(0, 10);
  workdays.forEach((day, i) => {
    d.classes.forEach((c, j) => {
      if (day === t && j > 1) return; // היום: רק שתי כיתות הגישו
      const teacher = d.staff.find(s => s.classId === c.id && s.role === 'גננת');
      const cnt = d.children.filter(k2 => k2.classId === c.id && d.childAttendance[day][k2.id] === 1).length;
      const [summary, meals] = summaries[(i + j) % summaries.length];
      d.reports.push({ id: uid(), date: day, classId: c.id, staffId: teacher.id, childrenCount: cnt, summary, meals, highlights: (i + j) % 4 === 0 ? 'ילד אחד נפל בחצר, שריטה קלה בברך – טופל ועודכנו ההורים.' : '', createdAt: Date.now() - i * 86400000 });
    });
  });

  const kidOf = id => d.children.find(x => x.id === id);
  d.complaints = [
    { id: uid(), date: addDays(t, -1), classId: 'c3', childId: 'k18', parentName: kidOf('k18').parentName, parentPhone: kidOf('k18').parentPhone, subject: 'הילד חזר עם בגדים רטובים', description: 'ההורים מבקשים להחליף בגדים כשהם נרטבים בפעילות מים.', priority: 'רגילה', status: 'open', assignedTo: 's5', resolution: '', createdBy: 's5', createdAt: Date.now() - 86400000 },
    { id: uid(), date: addDays(t, -3), classId: 'c2', childId: 'k9', parentName: kidOf('k9').parentName, parentPhone: kidOf('k9').parentPhone, subject: 'לא קיבלנו עדכון על נפילה', description: 'האם ביקשה לקבל עדכון טלפוני מיידי בכל פציעה, גם קלה.', priority: 'גבוהה', status: 'progress', assignedTo: 's3', resolution: 'שוחחתי עם הגננת, נקבע נוהל עדכון טלפוני.', createdBy: 'manager', createdAt: Date.now() - 3 * 86400000 },
    { id: uid(), date: addDays(t, -10), classId: 'c1', childId: 'k2', parentName: kidOf('k2').parentName, parentPhone: kidOf('k2').parentPhone, subject: 'שעות שינה', description: 'בקשה לא להעיר את התינוקת משנת הצהריים.', priority: 'רגילה', status: 'closed', assignedTo: 's1', resolution: 'עודכן הצוות, התינוקת ישנה לפי הקצב שלה.', createdBy: 's1', createdAt: Date.now() - 10 * 86400000 }
  ];
  d.reminders = [
    { id: uid(), fromStaffId: 's1', text: 'נגמרים חיתולים מידה 3 – צריך להזמין', dueDate: addDays(t, 1), priority: 'גבוהה', status: 'open', managerNote: '', createdAt: Date.now() - 3600000 },
    { id: uid(), fromStaffId: 's7', text: 'אסיפת הורים לכיתת שנתיים וחצי – לקבוע תאריך', dueDate: addDays(t, 7), priority: 'רגילה', status: 'open', managerNote: '', createdAt: Date.now() - 2 * 86400000 },
    { id: uid(), fromStaffId: 's4', text: 'ביקשתי חופש ביום ראשון הבא', dueDate: addDays(t, -1), priority: 'רגילה', status: 'open', managerNote: '', createdAt: Date.now() - 5 * 86400000 },
    { id: uid(), fromStaffId: 's5', text: 'לתקן את הברז בחצר', dueDate: addDays(t, -6), priority: 'רגילה', status: 'done', managerNote: 'אינסטלטור הגיע ותיקן.', createdAt: Date.now() - 8 * 86400000 }
  ];
  const allIds = d.staff.map(s => s.id);
  d.messages = [
    { id: uid(), toLabel: 'כל הצוות', recipients: allIds, subject: 'ישיבת צוות', body: 'ביום חמישי בשעה 16:15 ישיבת צוות חודשית. נוכחות חובה.', createdAt: Date.now() - 2 * 86400000, readBy: ['s1', 's3', 's5'] },
    { id: uid(), toLabel: 'יעל פרץ', recipients: ['s5'], subject: 'כל הכבוד!', body: 'קיבלתי מכתב תודה מהורים בכיתה שלך. עבודה מצוינת 🙏', createdAt: Date.now() - 86400000, readBy: [] }
  ];
  d.log = [{ ts: Date.now(), userId: 'manager', text: 'נוצרו נתוני הדגמה' }];
  return d;
}

function migrate(d) {
  const base = emptyDb();
  for (const k in base) if (d[k] === undefined) d[k] = base[k];
  for (const k in base.settings) if (d.settings[k] === undefined) d.settings[k] = base.settings[k];
  return d;
}
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { console.error(e); }
  return seed();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { toast('שמירה נכשלה: ' + e.message, true); }
}

let db = load();
save();

/* ---------------------------- משתמש ומצב ---------------------------- */
let me = null;
try { const s = sessionStorage.getItem(SESSION_KEY); if (s) me = JSON.parse(s); } catch (e) { /* ignore */ }
function sessSave() { try { me ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(me)) : sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }

function currentUser() {
  if (!me) return null;
  if (me.id === 'manager') return { id: 'manager', name: db.settings.managerName, isManager: true };
  const s = db.staff.find(x => x.id === me.id && x.active !== false);
  return s ? { ...s, isManager: false } : null;
}
const isManager = () => !!(me && me.id === 'manager');

const state = { view: 'dashboard', p: {} };
const F = {}; // מסננים לפי מסך
const fget = (k, def) => (k in F ? F[k] : def);

function logAction(text) {
  if (!me) return;
  db.log.unshift({ ts: Date.now(), userId: me.id, text });
  if (db.log.length > 2000) db.log.length = 2000;
}

/* ---------------------------- שאילתות ---------------------------- */
const activeKids = () => db.children.filter(c => c.active !== false).sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName, 'he'));
const activeStaff = () => db.staff.filter(s => s.active !== false);
const classKids = cid => activeKids().filter(k => k.classId === cid);
const classStaff = cid => activeStaff().filter(s => s.classId === cid);
const className = id => (db.classes.find(c => c.id === id) || {}).name || '—';
const classColor = id => (db.classes.find(c => c.id === id) || {}).color || '#999';
const staffName = id => (id === 'manager' ? db.settings.managerName + ' (מנהלת)' : (db.staff.find(s => s.id === id) || {}).name || '—');
const childName = id => { const c = db.children.find(k => k.id === id); return c ? `${c.firstName} ${c.lastName}` : '—'; };
const openShift = sid => db.shifts.find(s => s.staffId === sid && !s.end);
const shiftMinutes = s => (s.end ? minutesBetween(s.start, s.end) : 0);
const myMessages = () => db.messages.filter(m => m.recipients.includes(me.id)).sort((a, b) => b.createdAt - a.createdAt);
const unreadCount = () => myMessages().filter(m => !m.readBy.includes(me.id)).length;

function staffMonth(sid, month) {
  const st = db.staff.find(s => s.id === sid) || {};
  const sh = db.shifts.filter(s => s.staffId === sid && s.date.startsWith(month));
  const done = sh.filter(s => s.end);
  const mins = done.reduce((a, s) => a + shiftMinutes(s), 0);
  const rate = Number(st.hourlyRate) || 0;
  return { mins, days: new Set(done.map(s => s.date)).size, rate, gross: Math.round(mins / 60 * rate * 100) / 100, open: sh.length - done.length };
}

/* ---------------------------- רכיבי UI ---------------------------- */
const opt = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
const classOpts = (sel, allLabel) => (allLabel ? opt('', allLabel, sel) : '') + db.classes.map(c => opt(c.id, c.name, sel)).join('');
const staffOpts = (sel, allLabel) => (allLabel ? opt('', allLabel, sel) : '') + activeStaff().map(s => opt(s.id, `${s.name} (${s.role})`, sel)).join('');
const fld = (label, html, cls = '') => `<label class="fld ${cls}"><span>${label}</span>${html}</label>`;
const inp = (name, val = '', type = 'text', attrs = '') => `<input name="${name}" type="${type}" value="${esc(val)}" ${attrs}>`;
const area = (name, val = '', attrs = '') => `<textarea name="${name}" ${attrs}>${esc(val)}</textarea>`;
const pageHead = (title, sub = '', actions = '') => `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
const stat = (lbl, val, sub = '', cls = '') => `<div class="stat ${cls}"><div class="lbl">${esc(lbl)}</div><div class="val">${esc(val)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
const empty = t => `<div class="empty">${esc(t)}</div>`;
const tabs = (key, list, cur) => `<div class="tabs">${list.map(([v, l]) => `<button class="tab ${cur === v ? 'active' : ''}" data-act="setF" data-k="${key}" data-val="${v}">${esc(l)}</button>`).join('')}</div>`;
const filterSel = (key, label, optionsHtml) => fld(label, `<select data-filter="${key}">${optionsHtml}</select>`);
const filterInput = (key, label, val, type) => fld(label, `<input type="${type}" data-filter="${key}" value="${esc(val)}">`);

const COMPLAINT_STATUS = { open: ['חדשה', 'bad'], progress: ['בטיפול', 'warn'], closed: ['טופלה', 'ok'] };
const statusPill = s => { const [l, c] = COMPLAINT_STATUS[s] || [s, '']; return `<span class="pill ${c}">${l}</span>`; };
const prioPill = p => `<span class="pill ${p === 'דחופה' ? 'bad' : p === 'גבוהה' ? 'warn' : ''}">${esc(p || 'רגילה')}</span>`;

function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------------------------- מודאל ---------------------------- */
let modalHandler = null;
function openModal(title, body, onSubmit, submitLabel = 'שמירה') {
  const root = document.getElementById('modal');
  root.innerHTML = `<div class="modal-bg" data-act="closeModal"></div>
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-act="closeModal" aria-label="סגירה">✕</button></div>
      <form id="modalForm" class="modal-body" novalidate>${body}
        <div class="modal-foot">${onSubmit ? `<button type="submit" class="btn primary">${esc(submitLabel)}</button>` : ''}<button type="button" class="btn" data-act="closeModal">${onSubmit ? 'ביטול' : 'סגירה'}</button></div>
      </form>
    </div>`;
  root.hidden = false;
  modalHandler = onSubmit;
  const f = root.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
  if (f) f.focus();
}
function closeModal() { const r = document.getElementById('modal'); r.hidden = true; r.innerHTML = ''; modalHandler = null; }

/* ============================ מסכים ============================ */

function viewLogin() {
  const opts = [opt('manager', `${db.settings.managerName} (מנהלת)`, '')]
    .concat(activeStaff().map(s => opt(s.id, `${s.name} – ${s.role}, ${className(s.classId)}`, '')));
  return `<div class="login-wrap"><form class="login-card" id="loginForm">
    <div class="logo">🌈</div><h1>${esc(db.settings.gardenName)}</h1><p class="muted">מערכת ניהול הגן</p>
    ${fld('משתמש', `<select name="user">${opts.join('')}</select>`)}
    ${fld('קוד אישי', `<input name="pin" type="password" inputmode="numeric" autocomplete="off" required>`)}
    <button class="btn primary block">כניסה</button>
    ${db.settings.demo ? '<div class="hint">נתוני הדגמה: קוד מנהלת <b>1234</b> · קוד צוות <b>1111</b>. אפשר למחוק את נתוני ההדגמה במסך ההגדרות.</div>' : ''}
  </form></div>`;
}

const NAV = [
  { v: 'dashboard', label: 'לוח בקרה', icon: '🏠', m: 1 },
  { v: 'myday', label: 'היום שלי', icon: '☀️', s: 1 },
  { v: 'classes', label: 'כיתות', icon: '🏫', m: 1 },
  { v: 'children', label: 'ילדים', icon: '👶', m: 1, s: 1 },
  { v: 'staff', label: 'צוות', icon: '👩‍🏫', m: 1 },
  { v: 'attendance', label: 'נוכחות', icon: '🕒', m: 1, s: 1 },
  { v: 'reports', label: 'דוחות יומיים', icon: '📝', m: 1, s: 1 },
  { v: 'complaints', label: 'תלונות הורים', icon: '⚠️', m: 1, s: 1 },
  { v: 'schedule', label: 'סדר יום', icon: '📅', m: 1, s: 1 },
  { v: 'messages', label: 'הודעות', icon: '✉️', m: 1, s: 1 },
  { v: 'reminders', label: 'תזכורות', icon: '🔔', m: 1, s: 1 },
  { v: 'payroll', label: 'דוח שכר', icon: '💰', m: 1 },
  { v: 'log', label: 'יומן פעולות', icon: '📜', m: 1 },
  { v: 'settings', label: 'הגדרות וגיבוי', icon: '⚙️', m: 1 }
];
function navBadge(v) {
  let n = 0;
  if (v === 'messages' && !isManager()) n = unreadCount();
  if (v === 'reminders' && isManager()) n = db.reminders.filter(r => r.status !== 'done').length;
  if (v === 'complaints' && isManager()) n = db.complaints.filter(c => c.status === 'open').length;
  return n ? `<span class="badge">${n}</span>` : '';
}

/* ---------- לוח בקרה (מנהלת) ---------- */
function viewDashboard() {
  const t = todayStr(), att = db.childAttendance[t] || {};
  const kids = activeKids();
  const present = kids.filter(k => att[k.id] === 1).length;
  const marked = kids.filter(k => att[k.id] !== undefined).length;
  const onShift = db.shifts.filter(s => !s.end && s.date === t);
  const openC = db.complaints.filter(c => c.status !== 'closed').sort((a, b) => b.createdAt - a.createdAt);
  const openR = db.reminders.filter(r => r.status !== 'done').sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  const repT = db.reports.filter(r => r.date === t);
  const payroll = activeStaff().reduce((a, s) => a + staffMonth(s.id, t.slice(0, 7)).gross, 0);
  return `${pageHead('לוח בקרה', `${dayName(t)}, ${fmtDate(t)}`)}
  <div class="stats">
    ${stat('ילדים רשומים', kids.length, `ב-${db.classes.length} כיתות`)}
    ${stat('נוכחים היום', present, marked < kids.length ? `סומנו ${marked} מתוך ${kids.length}` : 'כל הנוכחות סומנה')}
    ${stat('צוות במשמרת עכשיו', onShift.length, `מתוך ${activeStaff().length} עובדים`)}
    ${stat('דוחות יומיים היום', `${new Set(repT.map(r => r.classId)).size}/${db.classes.length}`, 'כיתות שהגישו')}
    ${stat('תלונות פתוחות', openC.length, '', openC.length ? 'warn' : '')}
    ${stat('תזכורות פתוחות', openR.length, '', openR.length ? 'warn' : '')}
    ${stat('שכר מצטבר החודש', fmtMoney(payroll), 'לפי שעות שנרשמו')}
  </div>
  <h2 class="sec">הכיתות היום</h2>
  <div class="grid cards4">${db.classes.map(c => {
    const ck = kids.filter(k => k.classId === c.id);
    const p = ck.filter(k => att[k.id] === 1).length;
    const rep = repT.find(r => r.classId === c.id);
    const st = classStaff(c.id);
    const on = st.filter(s => onShift.some(o => o.staffId === s.id));
    return `<div class="card class-card" style="--cc:${esc(c.color)}">
      <div class="cc-head"><h3>${esc(c.name)}</h3><span class="pill">${ck.length}/${c.capacity || '–'} ילדים</span></div>
      <div class="kv"><span>נוכחים היום</span><b>${p}</b></div>
      <div class="kv"><span>דוח יומי</span>${rep ? `<button class="link" data-act="go" data-v="reports" data-cls="${c.id}">✓ הוגש – לצפייה</button>` : '<b class="bad">טרם הוגש</b>'}</div>
      <div class="kv"><span>צוות במשמרת</span><b>${on.length}/${st.length}</b></div>
      <div class="muted small" style="margin-top:6px">${st.map(s => `${esc(s.name)} (${esc(s.role)})`).join(' · ') || 'אין צוות משויך'}</div>
    </div>`;
  }).join('')}</div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h3>🔔 תזכורות מהצוות</h3><button class="link" data-act="nav" data-v="reminders">לכל התזכורות</button></div>
      ${openR.slice(0, 6).map(r => reminderItem(r, true)).join('') || empty('אין תזכורות פתוחות')}</div>
    <div class="card"><div class="card-head"><h3>⚠️ תלונות הורים פתוחות</h3><button class="link" data-act="nav" data-v="complaints">לכל התלונות</button></div>
      ${openC.slice(0, 6).map(c => `<div class="row-item"><div><b>${esc(c.subject)}</b><div class="muted small">${fmtDate(c.date)} · ${esc(className(c.classId))} · ${esc(childName(c.childId))}</div></div>${statusPill(c.status)}</div>`).join('') || empty('אין תלונות פתוחות')}</div>
  </div>`;
}

/* ---------- היום שלי (צוות) ---------- */
function viewMyDay() {
  const u = currentUser(), t = todayStr();
  const open = openShift(u.id);
  const todayMins = db.shifts.filter(s => s.staffId === u.id && s.date === t).reduce((a, s) => a + (s.end ? shiftMinutes(s) : minutesBetween(s.start, nowTime())), 0);
  const kids = classKids(u.classId), att = db.childAttendance[t] || {};
  const present = kids.filter(k => att[k.id] === 1).length;
  const rep = db.reports.find(r => r.date === t && r.classId === u.classId);
  const unread = myMessages().filter(m => !m.readBy.includes(u.id));
  const month = staffMonth(u.id, t.slice(0, 7));
  return `${pageHead(`שלום ${u.name.split(' ')[0]} 👋`, `${dayName(t)}, ${fmtDate(t)} · ${esc(u.role)} ב${esc(className(u.classId))}`)}
  <div class="card clock-card">
    <div><div class="muted">${open ? `במשמרת מאז ${open.start}${open.date !== t ? ` (${fmtDate(open.date)})` : ''}` : 'לא במשמרת כרגע'}</div>
      <div class="big-time" id="liveClock">${nowTime()}</div>
      <div class="muted small">היום: ${fmtHM(todayMins)} שעות · החודש: ${fmtHours(month.mins)} שעות ב-${month.days} ימים</div></div>
    <button class="btn big ${open ? 'off' : 'on'}" data-act="clock">${open ? '⏹ יציאה ממשמרת' : '▶ כניסה למשמרת'}</button>
  </div>
  <div class="stats" style="margin-top:14px">
    ${stat('ילדים בכיתה', kids.length)}
    ${stat('נוכחים היום', present, Object.keys(att).some(id => kids.some(k => k.id === id)) ? '' : 'טרם סומנה נוכחות')}
    ${stat('דוח יומי', rep ? 'הוגש ✓' : 'טרם הוגש', '', rep ? '' : 'warn')}
    ${stat('הודעות שלא נקראו', unread.length, '', unread.length ? 'warn' : '')}
  </div>
  <div class="actions" style="margin:14px 0">
    <button class="btn" data-act="nav" data-v="attendance">✅ סימון נוכחות ילדים</button>
    <button class="btn primary" data-act="newReport">📝 ${rep ? 'עריכת הדוח היומי' : 'כתיבת דוח יומי'}</button>
    <button class="btn" data-act="newReminder">🔔 תזכורת למנהלת</button>
    <button class="btn" data-act="newComplaint">⚠️ רישום תלונת הורה</button>
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h3>✉️ הודעות חדשות</h3><button class="link" data-act="nav" data-v="messages">לכל ההודעות</button></div>
      ${unread.map(m => `<div class="row-item"><div><b>${esc(m.subject)}</b><div class="small">${esc(m.body)}</div><div class="muted small">${fmtDateTime(m.createdAt)}</div></div><button class="btn sm" data-act="readMsg" data-id="${m.id}">קראתי</button></div>`).join('') || empty('אין הודעות חדשות')}</div>
    <div class="card"><div class="card-head"><h3>📅 סדר היום – ${esc(className(u.classId))}</h3></div>${scheduleList(u.classId)}</div>
  </div>`;
}

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

/* ---------- צוות ---------- */
function viewStaff() {
  if (state.p.id) return viewStaffProfile(state.p.id);
  const m = todayStr().slice(0, 7);
  return `${pageHead('צוות הגן', `${activeStaff().length} עובדים פעילים`, `<button class="btn primary" data-act="editStaff">+ עובד/ת חדש/ה</button>`)}
  <div class="table-wrap"><table><thead><tr><th>שם</th><th>תפקיד</th><th>כיתה</th><th>טלפון</th><th class="num">שכר לשעה</th><th class="num">שעות ב${MONTHS[Number(m.slice(5)) - 1]}</th><th class="num">ברוטו מצטבר</th><th>סטטוס</th><th class="acts"></th></tr></thead><tbody>
  ${db.staff.map(s => { const sm = staffMonth(s.id, m); const on = openShift(s.id); return `<tr><td><button class="link" style="font-size:15px;font-weight:600" data-act="go" data-v="staff" data-id="${s.id}">${esc(s.name)}</button></td><td>${esc(s.role)}</td><td>${esc(className(s.classId))}</td><td dir="ltr" style="text-align:right">${esc(s.phone)}</td><td class="num">${fmtMoney(s.hourlyRate)}</td><td class="num">${fmtHours(sm.mins)}</td><td class="num">${fmtMoney(sm.gross)}</td>
    <td>${s.active === false ? '<span class="pill">לא פעיל/ה</span>' : on ? '<span class="pill ok">במשמרת</span>' : '<span class="pill">לא במשמרת</span>'}</td>
    <td class="acts"><button class="btn sm" data-act="go" data-v="staff" data-id="${s.id}">כרטיס עובד</button> <button class="btn sm" data-act="editStaff" data-id="${s.id}">עריכה</button></td></tr>`; }).join('')}
  </tbody></table>${db.staff.length ? '' : empty('אין עובדים עדיין')}</div>`;
}

function viewStaffProfile(id) {
  const s = db.staff.find(x => x.id === id);
  if (!s) return empty('העובד/ת לא נמצא/ה');
  const m = fget('profMonth', todayStr().slice(0, 7));
  const sm = staffMonth(id, m);
  const shifts = db.shifts.filter(x => x.staffId === id && x.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date));
  const reps = db.reports.filter(r => r.staffId === id && r.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date));
  const rems = db.reminders.filter(r => r.fromStaffId === id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const msgs = db.messages.filter(x => x.recipients.includes(id)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const comps = db.complaints.filter(c => c.createdBy === id || c.assignedTo === id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const log = db.log.filter(l => l.userId === id).slice(0, 30);
  return `${pageHead(s.name, `${esc(s.role)} · ${esc(className(s.classId))} · ${esc(s.phone)} · ${fmtMoney(s.hourlyRate)} לשעה`,
    `<button class="btn" data-act="nav" data-v="staff">→ חזרה לצוות</button><button class="btn" data-act="editStaff" data-id="${s.id}">עריכת פרטים</button><button class="btn primary" data-act="newMessage" data-to="${s.id}">✉️ הודעה אישית</button>`)}
  <div class="filters">${filterInput('profMonth', 'חודש', m, 'month')}</div>
  <div class="stats">${stat('ימי עבודה', sm.days)}${stat('שעות', fmtHours(sm.mins), fmtHM(sm.mins))}${stat('שכר ברוטו', fmtMoney(sm.gross), `${fmtHours(sm.mins)} × ${fmtMoney(sm.rate)}`)}${stat('דוחות יומיים שנכתבו', reps.length)}</div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h3>🕒 משמרות – ${monthLabel(m)}</h3></div>
      ${shifts.length ? `<table><thead><tr><th>תאריך</th><th>כניסה</th><th>יציאה</th><th class="num">שעות</th></tr></thead><tbody>${shifts.map(x => `<tr><td>${fmtDate(x.date)} <span class="muted small">${DAYS[dow(x.date)]}</span></td><td>${esc(x.start)}</td><td>${x.end ? esc(x.end) : '<span class="pill ok">פתוחה</span>'}</td><td class="num">${fmtHM(shiftMinutes(x))}</td></tr>`).join('')}</tbody></table>` : empty('אין משמרות בחודש זה')}</div>
    <div class="card"><div class="card-head"><h3>📝 דוחות יומיים – ${monthLabel(m)}</h3></div>
      ${reps.map(r => `<div class="row-item"><div><b>${fmtDate(r.date)}</b> · ${esc(className(r.classId))} · ${r.childrenCount} ילדים<div class="small muted">${esc(r.summary.slice(0, 120))}${r.summary.length > 120 ? '…' : ''}</div></div></div>`).join('') || empty('אין דוחות')}</div>
    <div class="card"><div class="card-head"><h3>🔔 תזכורות ששלחה</h3></div>${rems.map(r => reminderItem(r, false)).join('') || empty('אין תזכורות')}</div>
    <div class="card"><div class="card-head"><h3>✉️ הודעות שקיבלה</h3></div>
      ${msgs.map(x => `<div class="row-item"><div><b>${esc(x.subject)}</b><div class="muted small">${fmtDateTime(x.createdAt)} · ${esc(x.toLabel)}</div></div>${x.readBy.includes(id) ? '<span class="pill ok">נקראה</span>' : '<span class="pill warn">לא נקראה</span>'}</div>`).join('') || empty('אין הודעות')}</div>
    <div class="card"><div class="card-head"><h3>⚠️ תלונות הורים (רשמה / באחריותה)</h3></div>
      ${comps.map(c => `<div class="row-item"><div><b>${esc(c.subject)}</b><div class="muted small">${fmtDate(c.date)} · ${esc(childName(c.childId))}</div></div>${statusPill(c.status)}</div>`).join('') || empty('אין תלונות')}</div>
    <div class="card"><div class="card-head"><h3>📜 פעולות אחרונות במערכת</h3></div>
      ${log.map(l => `<div class="row-item"><div class="small">${esc(l.text)}</div><span class="muted small">${fmtDateTime(l.ts)}</span></div>`).join('') || empty('אין פעולות')}</div>
  </div>`;
}

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

/* ---------- הודעות ---------- */
function viewMessages() {
  const u = currentUser();
  if (u.isManager) {
    const list = db.messages.slice().sort((a, b) => b.createdAt - a.createdAt);
    return `${pageHead('הודעות לצוות', 'הודעות לכולם, לקבוצה או אישיות – כולל מעקב קריאה', `<button class="btn primary" data-act="newMessage">+ הודעה חדשה</button>`)}
    ${list.map(m => { const unreadNames = m.recipients.filter(id => !m.readBy.includes(id)).map(staffName); return `<div class="card msg">
      <div class="card-head"><div><b>${esc(m.subject)}</b> <span class="pill info">אל: ${esc(m.toLabel)}</span><div class="muted small">${fmtDateTime(m.createdAt)}</div></div>
        <div class="actions"><span class="pill ${unreadNames.length ? 'warn' : 'ok'}">נקראה ${m.readBy.filter(id => m.recipients.includes(id)).length}/${m.recipients.length}</span><button class="btn sm danger" data-act="delMessage" data-id="${m.id}">מחיקה</button></div></div>
      <p>${esc(m.body)}</p>
      ${unreadNames.length ? `<details><summary>טרם קראו (${unreadNames.length})</summary><div class="small">${unreadNames.map(esc).join(', ')}</div></details>` : ''}
    </div>`; }).join('') || empty('עדיין לא נשלחו הודעות')}`;
  }
  const list = myMessages();
  const unread = list.filter(m => !m.readBy.includes(u.id)).length;
  return `${pageHead('ההודעות שלי', `${unread} הודעות שלא נקראו`, unread ? '<button class="btn" data-act="readAll">סימון הכל כנקרא</button>' : '')}
  ${list.map(m => { const isRead = m.readBy.includes(u.id); return `<div class="card msg ${isRead ? '' : 'unread'}">
    <div class="card-head"><div><b>${esc(m.subject)}</b> <span class="pill ${m.recipients.length === 1 ? 'warn' : 'info'}">${m.recipients.length === 1 ? 'הודעה אישית' : esc(m.toLabel)}</span><div class="muted small">מאת ${esc(db.settings.managerName)} · ${fmtDateTime(m.createdAt)}</div></div>
    ${isRead ? '<span class="pill ok">נקראה</span>' : `<button class="btn sm primary" data-act="readMsg" data-id="${m.id}">קראתי ✓</button>`}</div>
    <p>${esc(m.body)}</p></div>`; }).join('') || empty('אין הודעות')}`;
}

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

/* ---------- דוח שכר ---------- */
function viewPayroll() {
  const m = fget('payMonth', todayStr().slice(0, 7));
  if (!validMonth(m)) return pageHead('דוח שכר') + `<div class="filters">${filterInput('payMonth', 'חודש', m, 'month')}</div>` + empty('יש לבחור חודש');
  const rows = db.staff.map(s => ({ s, ...staffMonth(s.id, m) })).filter(r => r.s.active !== false || r.mins > 0);
  const tot = rows.reduce((a, r) => ({ mins: a.mins + r.mins, gross: a.gross + r.gross, days: a.days + r.days }), { mins: 0, gross: 0, days: 0 });
  const openCount = rows.reduce((a, r) => a + r.open, 0);
  return `${pageHead('דוח שכר', `${monthLabel(m)} · שעות עבודה × שכר לשעה`, `<button class="btn" data-act="exportPayroll" data-m="${m}">ייצוא לאקסל</button><button class="btn" data-act="print">הדפסה</button>`)}
  <div class="filters">${filterInput('payMonth', 'חודש', m, 'month')}</div>
  ${openCount ? `<div class="notice">יש ${openCount} משמרות פתוחות (ללא שעת יציאה) שאינן נכללות בחישוב. ניתן לתקן אותן במסך נוכחות ← נוכחות צוות.</div>` : ''}
  <div class="stats" style="margin-bottom:14px">${stat('עובדים', rows.length)}${stat('סה״כ שעות', fmtHours(tot.mins))}${stat('סה״כ שכר ברוטו', fmtMoney(tot.gross))}</div>
  <div class="table-wrap"><table><thead><tr><th>עובד/ת</th><th>תפקיד</th><th>כיתה</th><th class="num">ימי עבודה</th><th class="num">שעות</th><th class="num">ש:ד</th><th class="num">שכר לשעה</th><th class="num">ברוטו לתשלום</th><th class="acts"></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td><b>${esc(r.s.name)}</b></td><td>${esc(r.s.role)}</td><td>${esc(className(r.s.classId))}</td><td class="num">${r.days}</td><td class="num">${fmtHours(r.mins)}</td><td class="num">${fmtHM(r.mins)}</td><td class="num">${fmtMoney(r.rate)}</td><td class="num"><b>${fmtMoney(r.gross)}</b></td>
    <td class="acts"><button class="btn sm" data-act="payDetail" data-sid="${r.s.id}" data-m="${m}">פירוט משמרות</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td>סה״כ</td><td></td><td></td><td class="num">${tot.days}</td><td class="num">${fmtHours(tot.mins)}</td><td class="num">${fmtHM(tot.mins)}</td><td></td><td class="num">${fmtMoney(tot.gross)}</td><td class="acts"></td></tr></tfoot></table></div>
  <p class="muted small">החישוב לפי השכר לשעה הנוכחי שמוגדר בכרטיס העובד. הסכומים הם ברוטו, לפני ניכויים, הפרשות ותוספות.</p>`;
}

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

/* ---------- הגדרות ---------- */
function viewSettings() {
  const s = db.settings;
  return `${pageHead('הגדרות וגיבוי')}
  <div class="grid two" style="margin-top:0">
    <div class="card"><div class="card-head"><h3>פרטי הגן</h3></div>
      <form id="settingsForm" class="form-grid">
        ${fld('שם הגן', inp('gardenName', s.gardenName, 'text', 'required'), 'full')}
        ${fld('שם המנהלת', inp('managerName', s.managerName, 'text', 'required'))}
        ${fld('קוד כניסה למנהלת', inp('managerPin', s.managerPin, 'password', 'required inputmode="numeric" autocomplete="new-password"'))}
        <div class="full"><button class="btn primary">שמירה</button></div>
      </form></div>
    <div class="card"><div class="card-head"><h3>גיבוי ושחזור</h3></div>
      <p class="small muted">הנתונים נשמרים בדפדפן הזה בלבד. מומלץ להוריד גיבוי באופן קבוע ולשמור אותו במקום בטוח (מחשב, דרייב, מייל).</p>
      <div class="actions"><button class="btn primary" data-act="backup">⬇ הורדת גיבוי</button>
        <label class="btn">⬆ שחזור מקובץ<input type="file" accept=".json,application/json" id="restoreFile" hidden></label>
        <button class="btn" data-act="restoreText">שחזור מטקסט</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      <p class="small muted">איפוס: התחלה מחדש עם 4 הכיתות בלבד (ללא ילדים וצוות), או טעינת נתוני ההדגמה.</p>
      <div class="actions"><button class="btn danger" data-act="wipe">מחיקת כל הנתונים</button><button class="btn" data-act="loadDemo">טעינת נתוני הדגמה</button></div>
    </div>
  </div>`;
}

const VIEWS = { dashboard: viewDashboard, myday: viewMyDay, classes: viewClasses, children: viewChildren, staff: viewStaff, attendance: viewAttendance, reports: viewReports, complaints: viewComplaints, schedule: viewSchedule, messages: viewMessages, reminders: viewReminders, payroll: viewPayroll, log: viewLog, settings: viewSettings };

/* ============================ רינדור ============================ */
const app = document.getElementById('app');
function render() {
  const ae = document.activeElement;
  const fid = ae && ae.id && ae.closest('#app') ? ae.id : null;
  let ss = null, se = null;
  try { ss = ae.selectionStart; se = ae.selectionEnd; } catch (e) { /* ignore */ }

  const u = currentUser();
  if (!u) { me = null; sessSave(); app.innerHTML = viewLogin(); return; }
  const allowed = NAV.filter(n => (u.isManager ? n.m : n.s));
  if (!allowed.some(n => n.v === state.view)) state.view = allowed[0].v;
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><span class="logo-sm">🌈</span><div><b>${esc(db.settings.gardenName)}</b><small>מערכת ניהול הגן</small></div></div>
      <nav>${allowed.map(n => `<button class="nav-item ${state.view === n.v ? 'active' : ''}" data-act="nav" data-v="${n.v}"><span class="ic">${n.icon}</span><span>${n.label}</span>${navBadge(n.v)}</button>`).join('')}</nav>
      <div class="userbox"><div><b>${esc(u.name)}</b><small>${u.isManager ? 'מנהלת' : esc(u.role + ' · ' + className(u.classId))}</small></div><button class="btn sm" data-act="logout">יציאה</button></div>
    </aside>
    <main class="main" id="main">${VIEWS[state.view]()}</main>
  </div>`;
  if (fid) {
    const el = document.getElementById(fid);
    if (el) { el.focus(); try { if (ss != null) el.setSelectionRange(ss, se); } catch (e) { /* ignore */ } }
  }
}
function commit(msg) { save(); render(); if (msg) toast(msg); }

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

function openReportModal(r) {
  const u = currentUser();
  const isNew = !r;
  const date = r ? r.date : todayStr();
  const cls = r ? r.classId : (u.isManager ? fget('repClass', '') || db.classes[0]?.id : u.classId);
  const existing = isNew ? db.reports.find(x => x.date === date && x.classId === cls) : null;
  if (existing) r = existing;
  const att = db.childAttendance[date] || {};
  const autoCount = classKids(cls).filter(k => att[k.id] === 1).length;
  openModal(r ? 'עריכת דוח יומי' : 'דוח יומי חדש', `<div class="form-grid">
    ${fld('תאריך', inp('date', r ? r.date : date, 'date', 'required'))}
    ${u.isManager ? fld('כיתה', `<select name="classId">${classOpts(cls)}</select>`) : `<input type="hidden" name="classId" value="${esc(cls)}">` + fld('כיתה', `<input value="${esc(className(cls))}" disabled>`)}
    ${fld(`כמות ילדים שהגיעו היום ${autoCount ? `<span class="muted">(לפי הנוכחות: ${autoCount})</span>` : ''}`, inp('childrenCount', r ? r.childrenCount : autoCount, 'number', 'min="0" required'))}
    <div></div>
    ${fld('סיכום הפעילות היום *', area('summary', r?.summary, 'required rows="4" placeholder="מה עשינו היום: פעילויות, נושא שבועי, חוגים, משחקים…"'), 'full')}
    ${fld('ארוחות', area('meals', r?.meals, 'rows="2" placeholder="מה אכלו, מי לא אכל…"'), 'full')}
    ${fld('אירועים מיוחדים / פציעות / הערות', area('highlights', r?.highlights, 'rows="2"'), 'full')}</div>`,
  data => {
    if (!requireFields(data, ['date', 'classId', 'summary'])) return false;
    const dup = db.reports.find(x => x.date === data.date && x.classId === data.classId && (!r || x.id !== r.id));
    if (dup) { toast('כבר קיים דוח לכיתה זו בתאריך זה. אפשר לערוך אותו מרשימת הדוחות.', true); return false; }
    const rec = { date: data.date, classId: data.classId, childrenCount: Number(data.childrenCount) || 0, summary: data.summary.trim(), meals: data.meals.trim(), highlights: data.highlights.trim() };
    if (r) Object.assign(r, rec, { updatedAt: Date.now() });
    else db.reports.push({ id: uid(), staffId: u.id, createdAt: Date.now(), ...rec });
    logAction(`${r ? 'עדכון' : 'הגשת'} דוח יומי – ${className(data.classId)} ${fmtDate(data.date)} (${rec.childrenCount} ילדים)`);
    toast('הדוח נשמר');
  });
}

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

/* ---------------------------- אישור וקבצים ---------------------------- */
function askConfirm(msg, onYes) {
  openModal('אישור פעולה', `<p style="margin:0">${esc(msg)}</p>`, () => { onYes(); }, 'אישור');
}
// כשהמערכת רצה בתוך מסגרת (למשל קישור מ-claude.ai) הורדת קבצים חסומה, ולכן מציגים את התוכן להעתקה
const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
if (EMBEDDED) document.documentElement.classList.add('embedded');
function showCopyBox(title, text, hint) {
  openModal(title, `<p class="small muted" style="margin:0">${esc(hint)}</p>
    ${fld('', `<textarea id="copyBox" rows="10" readonly dir="ltr" style="font-family:monospace;font-size:12px">${esc(text)}</textarea>`)}
    <button type="button" class="btn primary" data-act="copyBox" style="align-self:flex-start">העתקה</button>`, null);
}
ACTIONS.copyBox = () => {
  const t = document.getElementById('copyBox');
  const fallback = () => { t.focus(); t.select(); toast('הטקסט מסומן. אפשר להעתיק אותו ידנית.'); };
  try { navigator.clipboard.writeText(t.value).then(() => toast('הועתק'), fallback); } catch (e) { fallback(); }
};
function downloadFile(name, content, type) {
  if (EMBEDDED) {
    const isJson = type.includes('json');
    return showCopyBox(isJson ? 'גיבוי הנתונים' : 'ייצוא לאקסל', content,
      isJson ? 'מעתיקים את הטקסט ושומרים אותו בפתקים או במייל. לשחזור: מסך הגדרות ← שחזור מטקסט.' : 'מעתיקים ומדביקים בגיליון אקסל או Google Sheets.');
  }
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function downloadCsv(name, rows) {
  if (EMBEDDED) return downloadFile(name, rows.map(r => r.map(v => String(v ?? '').replace(/[\t\n\r]+/g, ' ')).join('\t')).join('\n'), 'text/tab-separated-values');
  const csv = '﻿' + rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  downloadFile(name, csv, 'text/csv;charset=utf-8');
}

/* ---------------------------- אירועים ---------------------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.filter) { F[el.dataset.filter] = el.value; render(); return; }
  if (el.dataset.change === 'complaintChild') {
    const k = db.children.find(x => x.id === el.value);
    const form = el.form;
    if (k && form) { if (!form.parentName.value) form.parentName.value = k.parentName || ''; if (!form.parentPhone.value) form.parentPhone.value = k.parentPhone || ''; }
    return;
  }
  if (el.id === 'restoreFile' && el.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.classes) || !Array.isArray(data.staff)) throw new Error('קובץ לא תקין');
        askConfirm('לשחזר מהגיבוי? כל הנתונים הנוכחיים יוחלפו.', () => { db = migrate(data); logAction('שחזור מגיבוי'); commit('השחזור הושלם'); });
      } catch (err) { toast('שחזור נכשל: ' + err.message, true); }
    };
    reader.readAsText(el.files[0]);
    el.value = '';
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input) { F[el.dataset.input] = el.value; render(); }
});
document.addEventListener('submit', e => {
  const form = e.target;
  if (form.id === 'loginForm') {
    e.preventDefault();
    const user = form.user.value, pin = form.pin.value.trim();
    const ok = user === 'manager' ? pin === String(db.settings.managerPin) : (db.staff.find(s => s.id === user) || {}).pin === pin;
    if (!ok) { toast('קוד שגוי', true); form.pin.value = ''; form.pin.focus(); return; }
    me = { id: user }; sessSave();
    state.view = user === 'manager' ? 'dashboard' : 'myday'; state.p = {};
    logAction('כניסה למערכת'); save(); render();
    return;
  }
  if (form.id === 'settingsForm') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    if (!requireFields(d, ['gardenName', 'managerName', 'managerPin'])) return;
    Object.assign(db.settings, { gardenName: d.gardenName.trim(), managerName: d.managerName.trim(), managerPin: d.managerPin.trim() });
    logAction('עדכון הגדרות הגן'); commit('ההגדרות נשמרו');
    return;
  }
  if (form.id === 'modalForm') {
    e.preventDefault();
    if (!modalHandler) return closeModal();
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v : ''; });
    form.querySelectorAll('textarea, input[type=text], input[type=tel]').forEach(f => { if (f.name && !(f.name in data)) data[f.name] = ''; });
    if (modalHandler(data, form) === false) return;
    closeModal(); save(); render();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal(); });

// עדכון שעון ומסך "היום שלי" כל דקה
setInterval(() => {
  const c = document.getElementById('liveClock');
  if (c) c.textContent = nowTime();
}, 15000);

render();
