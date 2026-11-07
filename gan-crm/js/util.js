'use strict';
// Generic helpers: escaping, dates, money and time formatting.
// (loaded as a classic script; see index.html for the load order)

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
