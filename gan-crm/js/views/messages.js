'use strict';
// Screen: messages.
// (loaded as a classic script; see index.html for the load order)

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
