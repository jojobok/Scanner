'use strict';
// Regression suite for the existing gan-crm app (all 14 screens).
// Purpose: lock in today's behavior before any refactor or Supabase work.
// Uses only fictional demo data that the app generates by itself.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

before(H.setup);
after(H.teardown);

const MANAGER_VIEWS = ['dashboard', 'classes', 'children', 'staff', 'attendance', 'reports', 'complaints', 'schedule', 'messages', 'reminders', 'payroll', 'log', 'settings'];
const STAFF_VIEWS = ['myday', 'children', 'attendance', 'reports', 'complaints', 'schedule', 'messages', 'reminders'];
const TODAY = '2026-11-05';

async function asManager(opts) {
  const s = await H.openApp(opts);
  await H.login(s.app, 'manager', '1234');
  return s;
}
async function asStaff(id, opts) {
  const s = await H.openApp(opts);
  await H.login(s.app, id, '1111');
  return s;
}
const done = async (s) => { assert.deepEqual(s.errors, [], 'no console errors / native dialogs'); await s.context.close(); };

// ------------------------------------------------------------------ login
describe('login', () => {
  it('rejects a wrong code and accepts the right one', async () => {
    const s = await H.openApp();
    await H.login(s.app, 'manager', '0000');
    assert.ok((await H.toastTexts(s.app)).includes('קוד שגוי'));
    assert.equal(await s.app.locator('#loginForm').count(), 1);
    await H.login(s.app, 'manager', '1234');
    await s.app.locator('.page-head h1', { hasText: 'לוח בקרה' }).waitFor();
    await done(s);
  });

  it('first load creates the demo data: 4 classes, 8 staff, 38 children', async () => {
    const s = await H.openApp();
    const db = await H.readDb(s.page);
    assert.deepEqual(db.classes.map(c => c.name), ['תינוקייה', 'גיל שנה וחצי', 'גיל שנתיים', 'גיל שנתיים וחצי']);
    assert.equal(db.staff.length, 8);
    assert.equal(db.children.length, 38);
    await done(s);
  });
});

// ------------------------------------------------------------------ manager screens
describe('manager', () => {
  it('opens every manager screen without errors', async () => {
    const s = await asManager();
    const items = await s.app.locator('.side [data-act=nav]').evaluateAll(els => els.map(e => e.dataset.v));
    assert.deepEqual(items, MANAGER_VIEWS);
    for (const v of MANAGER_VIEWS) {
      await H.nav(s.app, v);
      await s.app.locator(`.side [data-act=nav][data-v=${v}].active`).waitFor();
      assert.ok((await s.app.locator('#main .page-head h1').count()) === 1, v + ' has a title');
    }
    await done(s);
  });

  it('dashboard numbers match the stored data', async () => {
    const s = await asManager();
    const db = await H.readDb(s.page);
    const att = db.childAttendance[TODAY] || {};
    const present = db.children.filter(k => att[k.id] === 1).length;
    const onShift = db.shifts.filter(x => x.date === TODAY && !x.end).length;
    assert.equal(await H.statValue(s.app, 'ילדים רשומים'), '38');
    assert.equal(await H.statValue(s.app, 'נוכחים היום'), String(present));
    assert.equal(await H.statValue(s.app, 'צוות במשמרת עכשיו'), String(onShift));
    assert.equal(await H.statValue(s.app, 'דוחות יומיים היום'), '2/4');
    assert.equal(await H.statValue(s.app, 'תלונות פתוחות'), String(db.complaints.filter(c => c.status !== 'closed').length));
    assert.equal(await H.statValue(s.app, 'תזכורות פתוחות'), String(db.reminders.filter(r => r.status !== 'done').length));
    assert.equal(await s.app.locator('.class-card').count(), 4);
    await done(s);
  });

  it('classes: totals table and editing a class', async () => {
    const s = await asManager();
    await H.nav(s.app, 'classes');
    assert.equal((await s.app.locator('tfoot td').nth(2).textContent()).trim(), '38');
    await s.app.locator('[data-act=editClass][data-id=c3]').click();
    await s.app.locator('#modalForm input[name=capacity]').fill('20');
    await H.submitModal(s.app);
    assert.equal((await H.readDb(s.page)).classes.find(c => c.id === 'c3').capacity, 20);
    await done(s);
  });

  it('children: filter, search, add, edit, delete with in-page confirmation, export', async () => {
    const s = await asManager();
    await H.nav(s.app, 'children');
    assert.equal(await s.app.locator('#main tbody tr').count(), 38);
    await s.app.locator('select[data-filter=kidsClass]').selectOption('c1');
    assert.equal(await s.app.locator('#main tbody tr').count(), 6);
    await s.app.locator('select[data-filter=kidsClass]').selectOption('');
    await s.app.locator('#kidsSearch').pressSequentially('נועם');
    assert.equal(await s.app.locator('#main tbody tr').count(), 1);
    assert.equal(await s.page.evaluate(() => document.activeElement.id), 'kidsSearch', 'search keeps focus while typing');
    await s.app.locator('#kidsSearch').fill('');
    await s.app.locator('#kidsSearch').dispatchEvent('input');

    // add
    await s.app.locator('[data-act=editChild]:not([data-id])').click();
    await s.app.locator('#modalForm input[name=firstName]').fill('בדיקה');
    await s.app.locator('#modalForm input[name=lastName]').fill('רגרסיה');
    await s.app.locator('#modalForm select[name=classId]').selectOption('c2');
    await H.submitModal(s.app);
    let db = await H.readDb(s.page);
    const added = db.children.find(k => k.firstName === 'בדיקה');
    assert.equal(added.classId, 'c2');
    // missing required field keeps the form open
    await s.app.locator(`[data-act=editChild][data-id="${added.id}"]`).click();
    await s.app.locator('#modalForm input[name=lastName]').fill('');
    await H.submitModal(s.app);
    assert.ok(await H.modal(s.app).isVisible());
    await s.app.locator('#modalForm input[name=lastName]').fill('מעודכן');
    await H.submitModal(s.app);
    db = await H.readDb(s.page);
    assert.equal(db.children.find(k => k.id === added.id).lastName, 'מעודכן');
    // delete: in-page confirmation, cancel keeps the child
    await s.app.locator(`[data-act=delChild][data-id="${added.id}"]`).click();
    await s.app.locator('#modalForm [data-act=closeModal]').click();
    assert.equal((await H.readDb(s.page)).children.length, 39);
    await s.app.locator(`[data-act=delChild][data-id="${added.id}"]`).click();
    await H.submitModal(s.app);
    assert.equal((await H.readDb(s.page)).children.length, 38);
    // export
    const [dl] = await Promise.all([s.page.waitForEvent('download'), s.app.locator('[data-act=exportKids]').click()]);
    const csv = require('node:fs').readFileSync(await dl.path(), 'utf8');
    assert.ok(csv.startsWith('﻿שם פרטי,שם משפחה,כיתה'));
    assert.equal(csv.trim().split('\r\n').length, 39);
    await done(s);
  });

  it('staff: list, add employee, employee card', async () => {
    const s = await asManager();
    await H.nav(s.app, 'staff');
    assert.equal(await s.app.locator('#main tbody tr').count(), 8);
    await s.app.locator('[data-act=editStaff]:not([data-id])').click();
    await s.app.locator('#modalForm input[name=name]').fill('עובדת בדיקה');
    await s.app.locator('#modalForm input[name=hourlyRate]').fill('45');
    await s.app.locator('#modalForm input[name=pin]').fill('9999');
    await H.submitModal(s.app);
    assert.equal(await s.app.locator('#main tbody tr').count(), 9);
    await s.app.locator('#main button.link', { hasText: 'רונית כהן' }).click();
    await s.app.locator('.page-head h1', { hasText: 'רונית כהן' }).waitFor();
    assert.ok(await s.app.locator('.card-head h3', { hasText: 'משמרות' }).count() >= 1);
    await done(s);
  });

  it('attendance: mark, toggle off, mark all, clear, monthly matrix', async () => {
    const s = await asManager();
    await H.nav(s.app, 'attendance');
    await s.app.locator('select[data-filter=attClass]').selectOption('c2');
    await s.app.locator('[data-act=markAll][data-val=""]').click();
    let att = (await H.readDb(s.page)).childAttendance[TODAY];
    const c2 = (await H.readDb(s.page)).children.filter(k => k.classId === 'c2').map(k => k.id);
    assert.ok(c2.every(id => att[id] === undefined), 'cleared');
    await s.app.locator('[data-act=att][data-val="0"]').first().click();
    att = (await H.readDb(s.page)).childAttendance[TODAY];
    assert.equal(c2.filter(id => att[id] === 0).length, 1, 'one child marked absent');
    await s.app.locator('[data-act=markAll][data-val="1"]').click();
    att = (await H.readDb(s.page)).childAttendance[TODAY];
    assert.ok(c2.every(id => att[id] === 1), 'all present');
    // clicking an active state again removes the mark
    await s.app.locator('.att-row').first().locator('[data-act=att][data-val="1"]').click();
    att = (await H.readDb(s.page)).childAttendance[TODAY];
    assert.equal(c2.filter(id => att[id] === undefined).length, 1);
    // monthly matrix
    await s.app.locator('[data-k=attTab][data-val=kidsMonth]').click();
    assert.equal(await s.app.locator('.matrix tbody tr').count(), c2.length);
    await done(s);
  });

  it('staff hours: add, edit and delete a manual shift', async () => {
    const s = await asManager();
    await H.nav(s.app, 'attendance');
    await s.app.locator('[data-k=attTab][data-val=staff]').click();
    const before = (await H.readDb(s.page)).shifts.length;
    await s.app.locator('[data-act=editShift]:not([data-id])').click();
    await s.app.locator('#modalForm select[name=staffId]').selectOption('s2');
    await s.app.locator('#modalForm input[name=date]').fill('2026-11-01');
    await s.app.locator('#modalForm input[name=start]').fill('08:00');
    await s.app.locator('#modalForm input[name=end]').fill('12:30');
    await s.app.locator('#modalForm input[name=note]').fill('משמרת בדיקה');
    await H.submitModal(s.app);
    let db = await H.readDb(s.page);
    assert.equal(db.shifts.length, before + 1);
    const sh = db.shifts.find(x => x.note === 'משמרת בדיקה');
    await s.app.locator(`[data-act=editShift][data-id="${sh.id}"]`).click();
    await s.app.locator('#modalForm input[name=end]').fill('13:00');
    await H.submitModal(s.app);
    assert.equal((await H.readDb(s.page)).shifts.find(x => x.id === sh.id).end, '13:00');
    await s.app.locator(`[data-act=delShift][data-id="${sh.id}"]`).click();
    await H.submitModal(s.app);
    assert.equal((await H.readDb(s.page)).shifts.length, before);
    await done(s);
  });

  it('daily reports: missing notice, new report, duplicate blocked, delete', async () => {
    const s = await asManager();
    await H.nav(s.app, 'reports');
    const notice = await s.app.locator('.notice').textContent();
    assert.ok(notice.includes('גיל שנתיים') && notice.includes('גיל שנתיים וחצי'));
    const before = (await H.readDb(s.page)).reports.length;
    // no class filter: "+ daily report" starts a new report for the first class without one today (c3)
    await s.app.locator('[data-act=newReport]').click();
    assert.equal(await s.app.locator('#modal h3').textContent(), 'דוח יומי חדש');
    assert.equal(await s.app.locator('#modalForm select[name=classId]').inputValue(), 'c3');
    await s.app.locator('#modalForm select[name=classId]').selectOption('c2'); // c2 has one today -> blocked
    await s.app.locator('#modalForm textarea[name=summary]').fill('דוח בדיקה');
    await H.submitModal(s.app);
    assert.ok(await H.modal(s.app).isVisible(), 'duplicate keeps the form open');
    assert.equal((await H.readDb(s.page)).reports.length, before);
    await s.app.locator('#modalForm select[name=classId]').selectOption('c3');
    await H.submitModal(s.app);
    const db = await H.readDb(s.page);
    assert.equal(db.reports.length, before + 1);
    assert.equal(db.reports.filter(r => r.date === TODAY && r.classId === 'c3').length, 1);
    const r = db.reports.find(x => x.summary === 'דוח בדיקה');
    await s.app.locator(`[data-act=delReport][data-id="${r.id}"]`).click();
    await H.submitModal(s.app);
    assert.equal((await H.readDb(s.page)).reports.length, before);
    await done(s);
  });

  it('complaints: new complaint fills parent details, handling changes status', async () => {
    const s = await asManager();
    await H.nav(s.app, 'complaints');
    await s.app.locator('[data-act=newComplaint]').click();
    await s.app.locator('#modalForm select[name=childId]').selectOption('k3');
    assert.ok((await s.app.locator('#modalForm input[name=parentName]').inputValue()).length > 0, 'parent auto-filled');
    await s.app.locator('#modalForm input[name=subject]').fill('נושא בדיקה');
    await H.submitModal(s.app);
    let c = (await H.readDb(s.page)).complaints.find(x => x.subject === 'נושא בדיקה');
    assert.equal(c.status, 'open');
    assert.equal(c.classId, 'c1');
    await s.app.locator(`[data-act=handleComplaint][data-id="${c.id}"]`).click();
    await s.app.locator('#modalForm select[name=status]').selectOption('closed');
    await s.app.locator('#modalForm textarea[name=resolution]').fill('טופל');
    await H.submitModal(s.app);
    c = (await H.readDb(s.page)).complaints.find(x => x.id === c.id);
    assert.equal(c.status, 'closed');
    assert.equal(await s.app.locator(`[data-act=handleComplaint][data-id="${c.id}"]`).count(), 0, 'closed hidden from "open" tab');
    await s.app.locator('[data-k=compStatus][data-val=closed]').click();
    assert.equal(await s.app.locator(`[data-act=handleComplaint][data-id="${c.id}"]`).count(), 1);
    await done(s);
  });

  it('schedule: invalid line rejected, valid schedule saved sorted', async () => {
    const s = await asManager();
    await H.nav(s.app, 'schedule');
    await s.app.locator('[data-act=editSchedule]').click();
    await s.app.locator('#modalForm textarea[name=lines]').fill('09:00 מפגש\nשורה בלי שעה');
    await H.submitModal(s.app);
    assert.ok(await H.modal(s.app).isVisible());
    await s.app.locator('#modalForm textarea[name=lines]').fill('09:00 מפגש\n7:30 קבלה');
    await H.submitModal(s.app);
    const sched = (await H.readDb(s.page)).schedules.c1;
    assert.deepEqual(sched, [{ time: '07:30', activity: 'קבלה' }, { time: '09:00', activity: 'מפגש' }]);
    await done(s);
  });

  it('messages: send to a class and to one person, read tracking', async () => {
    const s = await asManager();
    await H.nav(s.app, 'messages');
    await s.app.locator('[data-act=newMessage]').click();
    await s.app.locator('#modalForm select[name=to]').selectOption('class:c1');
    await s.app.locator('#modalForm input[name=subject]').fill('לכיתה');
    await s.app.locator('#modalForm textarea[name=body]').fill('תוכן');
    await H.submitModal(s.app);
    let m = (await H.readDb(s.page)).messages.find(x => x.subject === 'לכיתה');
    assert.deepEqual(m.recipients.sort(), ['s1', 's2']);
    await s.app.locator('[data-act=newMessage]').click();
    await s.app.locator('#modalForm select[name=to]').selectOption('s4');
    await s.app.locator('#modalForm input[name=subject]').fill('אישי');
    await s.app.locator('#modalForm textarea[name=body]').fill('תוכן');
    await H.submitModal(s.app);
    m = (await H.readDb(s.page)).messages.find(x => x.subject === 'אישי');
    assert.deepEqual(m.recipients, ['s4']);
    assert.ok((await s.app.locator('.msg', { hasText: 'אישי' }).textContent()).includes('נקראה 0/1'));
    assert.ok((await s.app.locator('.msg', { hasText: 'לכיתה' }).textContent()).includes('נקראה 0/2'));
    await done(s);
  });

  it('reminders: mark done, reopen, answer', async () => {
    const s = await asManager();
    await H.nav(s.app, 'reminders');
    const id = await s.app.locator('[data-act=doneReminder]').first().getAttribute('data-id');
    await s.app.locator(`[data-act=doneReminder][data-id="${id}"]`).click();
    assert.equal((await H.readDb(s.page)).reminders.find(r => r.id === id).status, 'done');
    await s.app.locator('[data-k=remStatus][data-val=done]').click();
    await s.app.locator(`[data-act=reopenReminder][data-id="${id}"]`).click();
    assert.equal((await H.readDb(s.page)).reminders.find(r => r.id === id).status, 'open');
    await s.app.locator('[data-k=remStatus][data-val=open]').click();
    await s.app.locator(`[data-act=noteReminder][data-id="${id}"]`).click();
    await s.app.locator('#modalForm textarea[name=note]').fill('בטיפול');
    await H.submitModal(s.app);
    assert.equal((await H.readDb(s.page)).reminders.find(r => r.id === id).managerNote, 'בטיפול');
    await done(s);
  });

  it('payroll: hours x rate per employee, total = sum, matches an independent calculation', async () => {
    const s = await asManager();
    await H.nav(s.app, 'payroll');
    const db = await H.readDb(s.page);
    const mins = (a, b) => { const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); let d = h2 * 60 + m2 - (h1 * 60 + m1); if (d < 0) d += 1440; return d; };
    let expectedTotal = 0;
    for (const st of db.staff) {
      const m = db.shifts.filter(x => x.staffId === st.id && x.date.startsWith('2026-11') && x.end).reduce((a, x) => a + mins(x.start, x.end), 0);
      expectedTotal += Math.round(m / 60 * st.hourlyRate * 100) / 100;
    }
    const totalText = (await s.app.locator('tfoot td').nth(7).textContent()).replace(/[^\d.]/g, '');
    assert.equal(Number(totalText).toFixed(2), expectedTotal.toFixed(2));
    assert.equal(await s.app.locator('#main tbody tr').count(), 8);
    assert.ok(await s.app.locator('.notice').count() === 1, 'open shifts warning shown');
    // detail link opens the staff hours of that employee
    await s.app.locator('[data-act=payDetail][data-sid=s1]').click();
    assert.equal(await s.app.locator('select[data-filter=shiftStaff]').inputValue(), 's1');
    await done(s);
  });

  it('activity log records actions and filters by user', async () => {
    const s = await asManager();
    await H.nav(s.app, 'log');
    assert.ok((await s.app.locator('#main tbody').textContent()).includes('כניסה למערכת'));
    await s.app.locator('select[data-filter=logUser]').selectOption('s3');
    assert.equal(await s.app.locator('#main tbody tr').count(), 0);
    await done(s);
  });

  it('settings: name and code change, backup, wipe, restore from text, demo reload', async () => {
    const s = await asManager();
    await H.nav(s.app, 'settings');
    await s.app.locator('#settingsForm input[name=gardenName]').fill('גן בדיקה');
    await s.app.locator('#settingsForm input[name=managerPin]').fill('2468');
    await s.app.locator('#settingsForm button').click();
    assert.ok((await s.app.locator('.brand b').textContent()).includes('גן בדיקה'));
    // backup
    const [dl] = await Promise.all([s.page.waitForEvent('download'), s.app.locator('[data-act=backup]').click()]);
    const backup = require('node:fs').readFileSync(await dl.path(), 'utf8');
    assert.equal(JSON.parse(backup).children.length, 38);
    // wipe keeps the 4 classes
    await s.app.locator('[data-act=wipe]').click();
    await H.submitModal(s.app);
    let db = await H.readDb(s.page);
    assert.equal(db.classes.length, 4);
    assert.equal(db.children.length, 0);
    assert.equal(db.staff.length, 0);
    // restore from pasted text
    await s.app.locator('[data-act=restoreText]').click();
    await s.app.locator('#modalForm textarea[name=json]').fill('not json');
    await H.submitModal(s.app);
    assert.ok(await H.modal(s.app).isVisible(), 'bad backup rejected');
    // set the value directly (= the result of a paste); typing ~5,000 lines is very slow in headless Chromium
    await s.app.locator('#modalForm textarea[name=json]').evaluate((el, v) => { el.value = v; }, backup);
    await H.submitModal(s.app);
    db = await H.readDb(s.page);
    assert.equal(db.children.length, 38);
    // new manager code works, old one does not
    await H.logout(s.app);
    await H.login(s.app, 'manager', '1234');
    assert.equal(await s.app.locator('#loginForm').count(), 1);
    await H.login(s.app, 'manager', '2468');
    await s.app.locator('.page-head h1', { hasText: 'לוח בקרה' }).waitFor();
    // reload demo data (replaces everything)
    await H.nav(s.app, 'settings');
    await s.app.locator('[data-act=loadDemo]').click();
    await H.submitModal(s.app);
    db = await H.readDb(s.page);
    assert.equal(db.children.length, 38);
    assert.equal(db.settings.gardenName, 'גן השמש');
    await done(s);
  });
});

// ------------------------------------------------------------------ daily report fix (approved)
// Former bug: changing the class in an opened report moved the report to another class.
describe('daily report: class and date locked when editing, no overwrites', () => {
  const reportOf = (db, cls, date = TODAY) => db.reports.find(r => r.classId === cls && r.date === date);

  it('manager: editing locks class and date in the form', async () => {
    const s = await asManager();
    await H.nav(s.app, 'reports');
    const r = reportOf(await H.readDb(s.page), 'c1');
    await s.app.locator(`[data-act=editReport][data-id="${r.id}"]`).click();
    assert.equal(await s.app.locator('#modal h3').textContent(), 'עריכת דוח יומי');
    assert.equal(await s.app.locator('#modalForm [name=classId], #modalForm [name=date]').count(), 0, 'no editable class/date fields');
    assert.equal(await s.app.locator('#modalForm [data-locked=class]').isDisabled(), true);
    assert.equal(await s.app.locator('#modalForm [data-locked=date]').isDisabled(), true);
    assert.equal(await s.app.locator('#modalForm [data-locked=class]').inputValue(), 'תינוקייה');
    await done(s);
  });

  it('manager: even a tampered form cannot move an existing report', async () => {
    const s = await asManager();
    await H.nav(s.app, 'reports');
    const before = await H.readDb(s.page);
    const r = reportOf(before, 'c1');
    await s.app.locator(`[data-act=editReport][data-id="${r.id}"]`).click();
    // inject fields the way a modified page could
    await s.app.locator('#modalForm').evaluate(f => {
      f.insertAdjacentHTML('beforeend', '<input type="hidden" name="classId" value="c3"><input type="hidden" name="date" value="2026-11-01">');
    });
    await s.app.locator('#modalForm textarea[name=summary]').fill('עדכון לגיטימי');
    await H.submitModal(s.app);
    const after = await H.readDb(s.page);
    const same = after.reports.find(x => x.id === r.id);
    assert.equal(same.classId, 'c1');
    assert.equal(same.date, TODAY);
    assert.equal(same.summary, 'עדכון לגיטימי');
    assert.equal(same.staffId, r.staffId, 'author kept');
    assert.equal(after.reports.length, before.reports.length);
    assert.equal(reportOf(after, 'c3'), undefined, 'class 3 did not get class 1 report');
    await done(s);
  });

  it('manager: a report for another class is a new report; existing reports untouched', async () => {
    const s = await asManager();
    await H.nav(s.app, 'reports');
    const before = await H.readDb(s.page);
    await s.app.locator('[data-act=newReport]').click();
    await s.app.locator('#modalForm select[name=classId]').selectOption('c4');
    await s.app.locator('#modalForm textarea[name=summary]').fill('דוח חדש לכיתה 4');
    await H.submitModal(s.app);
    const after = await H.readDb(s.page);
    assert.equal(after.reports.length, before.reports.length + 1);
    assert.equal(reportOf(after, 'c4').summary, 'דוח חדש לכיתה 4');
    for (const c of ['c1', 'c2']) assert.deepEqual(reportOf(after, c), reportOf(before, c), c + ' unchanged');
    await done(s);
  });

  it('manager: a new report on a class+date that already has one is blocked and changes nothing', async () => {
    const s = await asManager();
    await H.nav(s.app, 'reports');
    const before = await H.readDb(s.page);
    await s.app.locator('[data-act=newReport]').click();
    await s.app.locator('#modalForm select[name=classId]').selectOption('c1');
    await s.app.locator('#modalForm textarea[name=summary]').fill('ניסיון דריסה');
    await H.submitModal(s.app);
    assert.ok(await H.modal(s.app).isVisible(), 'form stays open with the typed text');
    assert.equal(await s.app.locator('#modalForm textarea[name=summary]').inputValue(), 'ניסיון דריסה');
    assert.ok((await H.toastTexts(s.app)).some(t => t.includes('כבר יש דוח')));
    assert.deepEqual((await H.readDb(s.page)).reports, before.reports);
    // another date for the same class is a new report
    await s.app.locator('#modalForm input[name=date]').fill('2026-09-01');
    await H.submitModal(s.app);
    const after = await H.readDb(s.page);
    assert.equal(after.reports.length, before.reports.length + 1);
    assert.equal(reportOf(after, 'c1', '2026-09-01').summary, 'ניסיון דריסה');
    assert.deepEqual(reportOf(after, 'c1'), reportOf(before, 'c1'), "today's class 1 report unchanged");
    await done(s);
  });

  it('manager: with a class filter that already reported today, "+ daily report" opens it locked', async () => {
    const s = await asManager();
    await H.nav(s.app, 'reports');
    await s.app.locator('select[data-filter=repClass]').selectOption('c2');
    await s.app.locator('[data-act=newReport]').click();
    assert.equal(await s.app.locator('#modal h3').textContent(), 'עריכת דוח יומי');
    assert.equal(await s.app.locator('#modalForm [data-locked=class]').inputValue(), 'גיל שנה וחצי');
    await done(s);
  });

  it('teacher: her existing report opens locked; a new report on an existing date is blocked', async () => {
    const t = await asStaff('s1'); // class c1 already reported today
    await t.app.locator('[data-act=newReport]').first().click();
    assert.equal(await t.app.locator('#modal h3').textContent(), 'עריכת דוח יומי');
    assert.equal(await t.app.locator('#modalForm [name=classId], #modalForm [name=date]').count(), 0);
    await done(t);

    const s = await asStaff('s5'); // class c3: no report today, has one yesterday
    const before = await H.readDb(s.page);
    await s.app.locator('[data-act=newReport]').first().click();
    assert.equal(await s.app.locator('#modal h3').textContent(), 'דוח יומי חדש');
    await s.app.locator('#modalForm input[name=date]').fill('2026-11-04');
    await s.app.locator('#modalForm textarea[name=summary]').fill('דריסה של אתמול');
    await H.submitModal(s.app);
    assert.ok(await H.modal(s.app).isVisible());
    assert.deepEqual((await H.readDb(s.page)).reports, before.reports, 'nothing changed');
    // a teacher cannot create a report for another class, even with a tampered form
    await s.app.locator('#modalForm input[name=date]').fill(TODAY);
    await s.app.locator('#modalForm input[name=classId]').evaluate(el => { el.value = 'c4'; });
    await H.submitModal(s.app);
    const after = await H.readDb(s.page);
    assert.equal(reportOf(after, 'c3').summary, 'דריסה של אתמול');
    assert.equal(reportOf(after, 'c4'), undefined);
    await done(s);
  });
});

// ------------------------------------------------------------------ staff screens
describe('staff', () => {
  it('teacher sees only staff screens, every screen opens', async () => {
    const s = await asStaff('s5');
    const items = await s.app.locator('.side [data-act=nav]').evaluateAll(els => els.map(e => e.dataset.v));
    assert.deepEqual(items, STAFF_VIEWS);
    for (const v of STAFF_VIEWS) {
      await H.nav(s.app, v);
      await s.app.locator(`.side [data-act=nav][data-v=${v}].active`).waitFor();
    }
    await done(s);
  });

  it('my day: clock out of the open shift and back in', async () => {
    const s = await asStaff('s1');
    const open = () => H.readDb(s.page).then(db => db.shifts.filter(x => x.staffId === 's1' && !x.end));
    assert.equal((await open()).length, 1);
    await s.app.locator('.clock-card [data-act=clock]').click();
    assert.equal((await open()).length, 0);
    const closed = (await H.readDb(s.page)).shifts.find(x => x.staffId === 's1' && x.date === TODAY);
    assert.equal(closed.end, '09:30');
    await s.app.locator('.clock-card [data-act=clock]').click();
    assert.equal((await open()).length, 1);
    await done(s);
  });

  it('messages: unread badge and "read" button', async () => {
    const s = await asStaff('s5');
    assert.equal((await s.app.locator('[data-v=messages] .badge').textContent()).trim(), '1');
    await s.app.locator('[data-act=readMsg]').first().click();
    assert.equal(await s.app.locator('[data-v=messages] .badge').count(), 0);
    await done(s);
  });

  it('children and attendance are limited to her class, no edit buttons', async () => {
    const s = await asStaff('s6'); // assistant, class c3
    await H.nav(s.app, 'children');
    const db = await H.readDb(s.page);
    assert.equal(await s.app.locator('#main tbody tr').count(), db.children.filter(k => k.classId === 'c3').length);
    assert.equal(await s.app.locator('[data-act=editChild], [data-act=delChild]').count(), 0);
    await H.nav(s.app, 'attendance');
    assert.equal(await s.app.locator('select[data-filter=attClass]').count(), 0);
    await s.app.locator('[data-k=attTab][data-val=staff]').click();
    assert.equal(await s.app.locator('[data-act=editShift], [data-act=delShift]').count(), 0);
    await done(s);
  });

  it('teacher writes today\'s report for her class; assistant cannot edit the schedule', async () => {
    const t = await asStaff('s5');
    await t.app.locator('[data-act=newReport]').first().click();
    await t.app.locator('#modalForm textarea[name=summary]').fill('יום נעים');
    await H.submitModal(t.app);
    const r = (await H.readDb(t.page)).reports.find(x => x.summary === 'יום נעים');
    assert.equal(r.classId, 'c3');
    assert.equal(r.staffId, 's5');
    await H.nav(t.app, 'schedule');
    assert.equal(await t.app.locator('[data-act=editSchedule]').count(), 1, 'teacher can edit her class schedule');
    await done(t);
    const a = await asStaff('s6');
    await H.nav(a.app, 'schedule');
    assert.equal(await a.app.locator('[data-act=editSchedule]').count(), 0, 'assistant cannot');
    await done(a);
  });

  it('reminders: send to the manager and delete her own', async () => {
    const s = await asStaff('s2');
    await H.nav(s.app, 'reminders');
    await s.app.locator('[data-act=newReminder]').click();
    await s.app.locator('#modalForm textarea[name=text]').fill('צריך מגבונים');
    await H.submitModal(s.app);
    const r = (await H.readDb(s.page)).reminders.find(x => x.text === 'צריך מגבונים');
    assert.equal(r.fromStaffId, 's2');
    await s.app.locator(`[data-act=delReminder][data-id="${r.id}"]`).click();
    await H.submitModal(s.app);
    assert.equal((await H.readDb(s.page)).reminders.filter(x => x.text === 'צריך מגבונים').length, 0);
    await done(s);
  });

  it('complaints: sees only the ones she created or was assigned', async () => {
    const s = await asStaff('s5');
    await H.nav(s.app, 'complaints');
    await s.app.locator('[data-k=compStatus][data-val=all]').click();
    const db = await H.readDb(s.page);
    const mine = db.complaints.filter(c => c.createdBy === 's5' || c.assignedTo === 's5').length;
    assert.equal(await s.app.locator('#main tbody tr').count(), mine);
    await done(s);
  });
});

// ------------------------------------------------------------------ iPhone layout, dark mode, embedded mode
describe('layout and modes', () => {
  it('iPhone width: no screen scrolls sideways (manager and staff)', async () => {
    for (const who of [['manager', '1234', MANAGER_VIEWS], ['s5', '1111', STAFF_VIEWS]]) {
      const s = await H.openApp({ viewport: { width: 390, height: 844 }, isMobile: true });
      await H.login(s.app, who[0], who[1]);
      for (const v of who[2]) {
        await H.nav(s.app, v);
        const w = await s.page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(w <= 390, `${who[0]} ${v}: page width ${w}`);
      }
      await done(s);
    }
  });

  it('dark mode uses the dark palette', async () => {
    const s = await asManager({ colorScheme: 'dark' });
    const bg = await s.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(21, 25, 28)');
    await done(s);
  });

  it('inside a frame: print buttons hidden, export shows text to copy', async () => {
    const s = await asManager({ embedded: true });
    await H.nav(s.app, 'payroll');
    assert.equal(await s.app.locator('[data-act=print]').isVisible(), false);
    await s.app.locator('[data-act=exportPayroll]').click();
    const text = await s.app.locator('#copyBox').inputValue();
    assert.ok(text.startsWith('עובד/ת\tתפקיד'));
    await done(s);
  });
});

// ------------------------------------------------------------------ packaging (stage 0.3: app split into files)
describe('packaging after the split into files', () => {
  it('opens directly from a file on the computer (no server)', async () => {
    const s = await H.openApp({ fileUrl: 'file://' + require('node:path').join(H.APP_DIR, 'index.html') });
    await H.login(s.app, 'manager', '1234');
    for (const v of MANAGER_VIEWS) await H.nav(s.app, v);
    await done(s);
  });

  it('the single-file build works inside a frame (the iPhone link version)', async () => {
    const path = require('node:path');
    const out = path.join(H.APP_DIR, 'dist', 'regression-single.html');
    require('node:child_process').execFileSync(process.execPath, [path.join(H.APP_DIR, 'tools', 'build-single-file.js'), out]);
    const html = require('node:fs').readFileSync(out, 'utf8');
    assert.ok(!/<script src=/.test(html) && !/<link rel="stylesheet"/.test(html), 'everything inlined');
    const s = await H.openApp({ embedded: true, appPath: '/dist/regression-single.html' });
    await H.login(s.app, 'manager', '1234');
    for (const v of MANAGER_VIEWS) await H.nav(s.app, v);
    await H.nav(s.app, 'payroll');
    assert.equal(await s.app.locator('[data-act=print]').isVisible(), false);
    await done(s);
  });

  it('if saving to the device fails at start-up, the app still opens and shows an error message', async () => {
    const s = await H.openApp({ initScript: () => { Storage.prototype.setItem = () => { throw new Error('quota'); }; } });
    assert.ok((await H.toastTexts(s.app)).some(t => t.includes('שמירה נכשלה')));
    await H.login(s.app, 'manager', '1234');
    await s.app.locator('.page-head h1', { hasText: 'לוח בקרה' }).waitFor();
    await done(s);
  });
});
