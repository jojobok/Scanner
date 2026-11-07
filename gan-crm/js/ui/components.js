'use strict';
// Small HTML building blocks (fields, options, pills, stats) and toast messages.
// (loaded as a classic script; see index.html for the load order)

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
