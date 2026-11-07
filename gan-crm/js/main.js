'use strict';
// Screen map, rendering, event listeners and start-up. Loaded last.
// (loaded as a classic script; see index.html for the load order)

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
