'use strict';
// Data model, schedules, local storage load/save and the db object.
// (loaded as a classic script; see index.html for the load order)

const STORE_KEY = 'gan_crm_v1';
const SESSION_KEY = 'gan_crm_session';

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
