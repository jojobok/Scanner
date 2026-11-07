'use strict';
// Signed-in user, screen state, filters and the activity log helper.
// (loaded as a classic script; see index.html for the load order)

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
