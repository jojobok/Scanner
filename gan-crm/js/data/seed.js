'use strict';
// Fictional demo data generated on first load.
// (loaded as a classic script; see index.html for the load order)

function seed() {
  const d = emptyDb();
  d.settings.gardenName = 'גן השמש';
  d.settings.demo = true;
  d.classes = baseClasses();
  d.classes.forEach(c => { d.schedules[c.id] = (c.id === 'c1' ? BABY_SCHED : DEFAULT_SCHED).map(([time, activity]) => ({ time, activity })); });

  const staff = [['רונית כהן', 'גננת', 'c1', 62], ['מירב לוי', 'סייעת', 'c1', 42], ['שירה אברהם', 'גננת', 'c2', 60], ['אורית מזרחי', 'סייעת', 'c2', 40],
    ['יעל פרץ', 'גננת', 'c3', 64], ['נועה ביטון', 'סייעת', 'c3', 41], ['הדס דהן', 'גננת', 'c4', 65], ['טל אוחיון', 'סייעת', 'c4', 42]];
  d.staff = staff.map(([name, role, classId, rate], i) => ({
    id: 's' + (i + 1), name, role, classId, hourlyRate: rate, phone: `050-00000${pad(i + 1)}`, pin: '1111', startDate: '2025-09-01', active: true
  }));

  const first = ['נועם', 'מאיה', 'איתי', 'תמר', 'אורי', 'ליה', 'יונתן', 'שירה', 'דניאל', 'נגה', 'אריאל', 'רוני', 'עומר', 'הילה', 'יואב', 'אלה', 'איתן', 'מיכל', 'גיא', 'עדי', 'אביב', 'רומי', 'בן', 'שקד', 'אלון', 'יעלי', 'הראל', 'אגם', 'לביא', 'מעיין', 'עידו', 'אור', 'ליאם', 'נטע', 'אדם', 'הלל', 'יהלי', 'שחר'];
  const last = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אזולאי', 'גבאי', 'שפירא', 'חדד', 'אלון', 'ברק'];
  const parents = ['רחל', 'משה', 'דנה', 'אבי', 'סיגל', 'יוסי', 'מורן', 'אלי', 'קרן', 'רון'];
  const counts = { c1: 6, c2: 9, c3: 11, c4: 12 };
  const baseMonths = { c1: 5, c2: 17, c3: 23, c4: 29 };
  const t = todayStr();
  let k = 0;
  for (const c of d.classes) {
    for (let i = 0; i < counts[c.id]; i++, k++) {
      const ln = last[(k * 5) % last.length];
      const bd = parseDate(t); bd.setMonth(bd.getMonth() - (baseMonths[c.id] + (k % 5))); bd.setDate(1 + (k * 3) % 27);
      d.children.push({
        id: 'k' + (k + 1), firstName: first[k % first.length], lastName: ln, classId: c.id, birthDate: dateToStr(bd),
        parentName: `${parents[k % parents.length]} ${ln}`, parentPhone: `052-11${pad(k)}${pad(k * 7 % 100)}`.slice(0, 11),
        allergies: k % 9 === 0 ? 'אלרגיה לבוטנים' : (k % 13 === 0 ? 'רגישות ללקטוז' : ''), notes: '', startDate: '2025-09-01', active: true
      });
    }
  }

  // נוכחות ומשמרות ל-45 הימים האחרונים
  for (let i = 45; i >= 0; i--) {
    const day = addDays(t, -i), w = dow(day);
    if (w === 5 || w === 6) continue;
    d.childAttendance[day] = {};
    d.children.forEach((ch, j) => { d.childAttendance[day][ch.id] = ((j * 7 + i * 3) % 11 === 0) ? 0 : 1; });
    d.staff.forEach((s, j) => {
      if ((i + j * 5) % 23 === 0 && i > 0) return; // יום חופש מדי פעם
      const startM = 7 * 60 - 5 + ((i * 3 + j * 7) % 12);
      const endM = (s.role === 'גננת' ? 16 * 60 : 15 * 60 + 30) + ((i + j * 3) % 15) - 5;
      d.shifts.push({ id: uid(), staffId: s.id, date: day, start: `${pad(Math.floor(startM / 60))}:${pad(startM % 60)}`, end: i === 0 ? '' : `${pad(Math.floor(endM / 60))}:${pad(endM % 60)}`, note: '' });
    });
  }

  const summaries = [
    ['פעילות יצירה עם צבעי אצבעות ושיר על הסתיו. הילדים נהנו מאוד בחצר.', 'כולם אכלו יפה, פסטה ועוף בצהריים.'],
    ['סיפור "הגזר הענק" ומשחק תפקידים. עבדנו על מוטוריקה עדינה עם פלסטלינה.', 'ארוחת בוקר מלאה, חלק לא סיימו את הירקות.'],
    ['יום ספורט קטן – מסלול מכשולים וזחילה במנהרות. שירה במעגל.', 'אורז, שניצל וירקות מבושלים.'],
    ['פעילות חושית עם חול קינטי ומים. קבלת שבת עם חלה ונרות.', 'כולם אכלו, שתו הרבה מים.'],
    ['משחקי צבעים והתאמה, הכרת בעלי חיים ומשק. טיול קצר בשכונה.', 'קציצות עם פירה, פירות במנחה.']
  ];
  const workdays = Object.keys(d.childAttendance).sort().reverse().slice(0, 10);
  workdays.forEach((day, i) => {
    d.classes.forEach((c, j) => {
      if (day === t && j > 1) return; // היום: רק שתי כיתות הגישו
      const teacher = d.staff.find(s => s.classId === c.id && s.role === 'גננת');
      const cnt = d.children.filter(k2 => k2.classId === c.id && d.childAttendance[day][k2.id] === 1).length;
      const [summary, meals] = summaries[(i + j) % summaries.length];
      d.reports.push({ id: uid(), date: day, classId: c.id, staffId: teacher.id, childrenCount: cnt, summary, meals, highlights: (i + j) % 4 === 0 ? 'ילד אחד נפל בחצר, שריטה קלה בברך – טופל ועודכנו ההורים.' : '', createdAt: Date.now() - i * 86400000 });
    });
  });

  const kidOf = id => d.children.find(x => x.id === id);
  d.complaints = [
    { id: uid(), date: addDays(t, -1), classId: 'c3', childId: 'k18', parentName: kidOf('k18').parentName, parentPhone: kidOf('k18').parentPhone, subject: 'הילד חזר עם בגדים רטובים', description: 'ההורים מבקשים להחליף בגדים כשהם נרטבים בפעילות מים.', priority: 'רגילה', status: 'open', assignedTo: 's5', resolution: '', createdBy: 's5', createdAt: Date.now() - 86400000 },
    { id: uid(), date: addDays(t, -3), classId: 'c2', childId: 'k9', parentName: kidOf('k9').parentName, parentPhone: kidOf('k9').parentPhone, subject: 'לא קיבלנו עדכון על נפילה', description: 'האם ביקשה לקבל עדכון טלפוני מיידי בכל פציעה, גם קלה.', priority: 'גבוהה', status: 'progress', assignedTo: 's3', resolution: 'שוחחתי עם הגננת, נקבע נוהל עדכון טלפוני.', createdBy: 'manager', createdAt: Date.now() - 3 * 86400000 },
    { id: uid(), date: addDays(t, -10), classId: 'c1', childId: 'k2', parentName: kidOf('k2').parentName, parentPhone: kidOf('k2').parentPhone, subject: 'שעות שינה', description: 'בקשה לא להעיר את התינוקת משנת הצהריים.', priority: 'רגילה', status: 'closed', assignedTo: 's1', resolution: 'עודכן הצוות, התינוקת ישנה לפי הקצב שלה.', createdBy: 's1', createdAt: Date.now() - 10 * 86400000 }
  ];
  d.reminders = [
    { id: uid(), fromStaffId: 's1', text: 'נגמרים חיתולים מידה 3 – צריך להזמין', dueDate: addDays(t, 1), priority: 'גבוהה', status: 'open', managerNote: '', createdAt: Date.now() - 3600000 },
    { id: uid(), fromStaffId: 's7', text: 'אסיפת הורים לכיתת שנתיים וחצי – לקבוע תאריך', dueDate: addDays(t, 7), priority: 'רגילה', status: 'open', managerNote: '', createdAt: Date.now() - 2 * 86400000 },
    { id: uid(), fromStaffId: 's4', text: 'ביקשתי חופש ביום ראשון הבא', dueDate: addDays(t, -1), priority: 'רגילה', status: 'open', managerNote: '', createdAt: Date.now() - 5 * 86400000 },
    { id: uid(), fromStaffId: 's5', text: 'לתקן את הברז בחצר', dueDate: addDays(t, -6), priority: 'רגילה', status: 'done', managerNote: 'אינסטלטור הגיע ותיקן.', createdAt: Date.now() - 8 * 86400000 }
  ];
  const allIds = d.staff.map(s => s.id);
  d.messages = [
    { id: uid(), toLabel: 'כל הצוות', recipients: allIds, subject: 'ישיבת צוות', body: 'ביום חמישי בשעה 16:15 ישיבת צוות חודשית. נוכחות חובה.', createdAt: Date.now() - 2 * 86400000, readBy: ['s1', 's3', 's5'] },
    { id: uid(), toLabel: 'יעל פרץ', recipients: ['s5'], subject: 'כל הכבוד!', body: 'קיבלתי מכתב תודה מהורים בכיתה שלך. עבודה מצוינת 🙏', createdAt: Date.now() - 86400000, readBy: [] }
  ];
  d.log = [{ ts: Date.now(), userId: 'manager', text: 'נוצרו נתוני הדגמה' }];
  return d;
}
