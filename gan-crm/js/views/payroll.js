'use strict';
// Screen: payroll report.
// (loaded as a classic script; see index.html for the load order)

/* ---------- דוח שכר ---------- */
function viewPayroll() {
  const m = fget('payMonth', todayStr().slice(0, 7));
  if (!validMonth(m)) return pageHead('דוח שכר') + `<div class="filters">${filterInput('payMonth', 'חודש', m, 'month')}</div>` + empty('יש לבחור חודש');
  const rows = db.staff.map(s => ({ s, ...staffMonth(s.id, m) })).filter(r => r.s.active !== false || r.mins > 0);
  const tot = rows.reduce((a, r) => ({ mins: a.mins + r.mins, gross: a.gross + r.gross, days: a.days + r.days }), { mins: 0, gross: 0, days: 0 });
  const openCount = rows.reduce((a, r) => a + r.open, 0);
  return `${pageHead('דוח שכר', `${monthLabel(m)} · שעות עבודה × שכר לשעה`, `<button class="btn" data-act="exportPayroll" data-m="${m}">ייצוא לאקסל</button><button class="btn" data-act="print">הדפסה</button>`)}
  <div class="filters">${filterInput('payMonth', 'חודש', m, 'month')}</div>
  ${openCount ? `<div class="notice">יש ${openCount} משמרות פתוחות (ללא שעת יציאה) שאינן נכללות בחישוב. ניתן לתקן אותן במסך נוכחות ← נוכחות צוות.</div>` : ''}
  <div class="stats" style="margin-bottom:14px">${stat('עובדים', rows.length)}${stat('סה״כ שעות', fmtHours(tot.mins))}${stat('סה״כ שכר ברוטו', fmtMoney(tot.gross))}</div>
  <div class="table-wrap"><table><thead><tr><th>עובד/ת</th><th>תפקיד</th><th>כיתה</th><th class="num">ימי עבודה</th><th class="num">שעות</th><th class="num">ש:ד</th><th class="num">שכר לשעה</th><th class="num">ברוטו לתשלום</th><th class="acts"></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td><b>${esc(r.s.name)}</b></td><td>${esc(r.s.role)}</td><td>${esc(className(r.s.classId))}</td><td class="num">${r.days}</td><td class="num">${fmtHours(r.mins)}</td><td class="num">${fmtHM(r.mins)}</td><td class="num">${fmtMoney(r.rate)}</td><td class="num"><b>${fmtMoney(r.gross)}</b></td>
    <td class="acts"><button class="btn sm" data-act="payDetail" data-sid="${r.s.id}" data-m="${m}">פירוט משמרות</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td>סה״כ</td><td></td><td></td><td class="num">${tot.days}</td><td class="num">${fmtHours(tot.mins)}</td><td class="num">${fmtHM(tot.mins)}</td><td></td><td class="num">${fmtMoney(tot.gross)}</td><td class="acts"></td></tr></tfoot></table></div>
  <p class="muted small">החישוב לפי השכר לשעה הנוכחי שמוגדר בכרטיס העובד. הסכומים הם ברוטו, לפני ניכויים, הפרשות ותוספות.</p>`;
}
