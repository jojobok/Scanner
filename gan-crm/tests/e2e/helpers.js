'use strict';
// Shared helpers for the regression suite.
// The app is served from a small local HTTP server (like real hosting),
// with the clock pinned so the demo data is identical on every run.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const APP_DIR = path.resolve(__dirname, '../..');
const FIXED_NOW = new Date('2026-11-05T09:30:00+02:00'); // Thursday, Israel time
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function startServer() {
  const server = http.createServer((req, res) => {
    const [rawPath, query = ''] = req.url.split('?');
    const url = decodeURIComponent(rawPath);
    if (url === '/__frame.html') {
      // Imitates the app running inside a sandboxed frame (downloads/print blocked)
      const src = new URLSearchParams(query).get('src') || '/index.html';
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      return res.end(`<!doctype html><meta charset="utf-8"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%}</style><iframe src="${src.replace(/[^\w/.-]/g, '')}"></iframe>`);
    }
    const file = path.join(APP_DIR, url === '/' ? 'index.html' : url);
    if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

let browser, srv;
async function setup() {
  browser = await chromium.launch();
  srv = await startServer();
}
async function teardown() {
  await browser?.close();
  await new Promise(r => srv?.server.close(r));
}

/** Fresh browser context = fresh localStorage = fresh demo data. */
async function openApp({ viewport = { width: 1280, height: 900 }, colorScheme = 'light', embedded = false, isMobile = false, appPath = '/index.html', fileUrl = null, initScript = null } = {}) {
  const context = await browser.newContext({ viewport, colorScheme, isMobile, hasTouch: isMobile, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { errors.push('native dialog shown: ' + d.message()); d.dismiss(); });
  await page.clock.setFixedTime(FIXED_NOW);
  if (initScript) await context.addInitScript(initScript);
  if (fileUrl) await page.goto(fileUrl);
  else await page.goto(srv.base + (embedded ? '/__frame.html?src=' + encodeURIComponent(appPath) : appPath));
  const app = embedded ? page.frameLocator('iframe') : page;
  return { context, page, app, errors };
}

async function login(app, user, pin) {
  await app.locator('select[name=user]').selectOption(user);
  await app.locator('input[name=pin]').fill(pin);
  await app.locator('#loginForm button').click();
}
const nav = (app, v) => app.locator(`.side [data-act=nav][data-v=${v}]`).click();
const logout = app => app.locator('[data-act=logout]').click();

/** Read the app's stored data (the same thing the app reads). */
const readDb = page => page.evaluate(() => JSON.parse(localStorage.getItem('gan_crm_v1')));

async function statValue(app, label) {
  const stat = app.locator('.stat').filter({ has: app.locator('.lbl', { hasText: new RegExp('^' + label + '$') }) });
  return (await stat.locator('.val').textContent()).trim();
}
const modal = app => app.locator('#modal .modal-box');
const submitModal = app => app.locator('#modalForm button[type=submit]').click();
const toastTexts = app => app.locator('#toasts .toast').allTextContents();

module.exports = { APP_DIR, setup, teardown, openApp, login, nav, logout, readDb, statValue, modal, submitModal, toastTexts, FIXED_NOW };
