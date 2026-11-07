'use strict';
// Modal dialog, in-page confirmation, copy box, file downloads and the embedded-mode flag.
// (loaded as a classic script; see index.html for the load order)

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
