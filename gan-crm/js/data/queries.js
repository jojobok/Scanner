'use strict';
// Read helpers over db (children, staff, names, shifts, monthly hours).
// (loaded as a classic script; see index.html for the load order)

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
