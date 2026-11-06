-- =====================================================================
-- LOCAL TESTING ONLY. Permission tests, including unauthorized attempts.
-- Each block signs in as one fictional user and records pass/fail rows
-- in tests.results. run_local_tests.sh prints the summary.
-- =====================================================================

-- ---------- not signed in (anon) ----------
reset role; select tests.as_anon();
select tests.denied('anon: read children',            'select * from public.children');
select tests.denied('anon: read staff',               'select * from public.staff');
select tests.denied('anon: read pay rates',           'select * from public.staff_pay_rates');
select tests.denied('anon: payroll report',           'select * from public.payroll_report(''2026-09-01'')');
select tests.denied('anon: insert reminder',          'insert into public.reminders (body) values (''x'')');
select tests.denied('anon: clock in',                 'select public.clock_in()');

-- ---------- signed up but not on the staff list ----------
reset role; select tests.login('u_stranger');
select tests.rows_eq('stranger: sees 0 children',       'select * from public.children', 0);
select tests.rows_eq('stranger: sees 0 classes',        'select * from public.classes', 0);
select tests.rows_eq('stranger: sees 0 staff',          'select * from public.staff', 0);
select tests.denied('stranger: link account',           'select public.link_my_account()');
select tests.denied('stranger: staff directory',        'select * from public.staff_directory()');
select tests.denied('stranger: clock in',               'select public.clock_in()');
select tests.denied('stranger: insert reminder',        'insert into public.reminders (body) values (''x'')');
select tests.denied('stranger: add himself as manager', 'insert into public.staff (full_name, role, user_id) values (''x'', ''manager'', auth.uid())');

-- ---------- former employee (deactivated) ----------
reset role; select tests.login('u_former');
select tests.rows_eq('former: sees 0 children',  'select * from public.children', 0);
select tests.denied('former: clock in',          'select public.clock_in()');

-- ---------- invited new employee signs in for the first time ----------
reset role; select tests.login('u_newhire');
select tests.rows_eq('newhire: 0 children before linking', 'select * from public.children', 0);
select tests.allowed('newhire: link_my_account',           'select public.link_my_account()');
select tests.rows_eq('newhire: 3 class children after linking', 'select * from public.children', 3);

-- ---------- manager ----------
reset role; select tests.login('u_manager');
select tests.rows_eq('manager: sees all 6 children',      'select * from public.children', 6);
select tests.rows_eq('manager: sees all child details',   'select * from public.child_private', 6);
select tests.rows_eq('manager: sees all 7 staff rows',    'select * from public.staff', 7);
select tests.rows_eq('manager: sees pay rates',           'select * from public.staff_pay_rates', 8);
select tests.value_eq('manager: payroll Sept assistant1 = 8h*40 + 8h*50',
  'select gross::text from public.payroll_report(''2026-09-01'') where staff_id = tests.id(''s_assistant1'')', '720.00');
select tests.value_eq('manager: payroll Sept assistant1 minutes',
  'select minutes::text from public.payroll_report(''2026-09-01'') where staff_id = tests.id(''s_assistant1'')', '960');
select tests.allowed('manager: change hourly rate',
  'update public.staff_pay_rates set hourly_rate = 61 where staff_id = tests.id(''s_teacher1'')');
select tests.allowed('manager: add child',
  'insert into public.children (first_name, last_name, class_id) values (''ילד7'', ''בדיקה'', tests.cls(3))');
select tests.allowed('manager: correct attendance 30 days ago',
  'insert into public.child_attendance (child_id, att_date, status) values (tests.id(''kid4''), app_private.today_il() - 30, ''present'')');
select tests.allowed('manager: send message to all',
  'select public.send_message(''הודעה בדיונית'', ''לכולם'', ''all'', ''כל הצוות'')');
select tests.allowed('manager: personal message to teacher1',
  'select public.send_message(''אישי'', ''רק לגננת א'', ''staff:'' || tests.id(''s_teacher1''), ''גננת א'')');
select tests.allowed('manager: reads audit log',          'select * from public.audit_log');
select tests.denied('manager: cannot edit audit log',     'update public.audit_log set action = ''x''');
select tests.denied('manager: cannot delete audit log',   'delete from public.audit_log');

-- ---------- teacher of class 1 ----------
reset role; select tests.login('u_teacher1');
select tests.rows_eq('teacher1: sees 3 children of her class',  'select * from public.children', 3);
select tests.rows_eq('teacher1: sees parent details of her class', 'select * from public.child_private', 3);
select tests.rows_eq('teacher1: no parent details of class 2',
  'select * from public.child_private where child_id = tests.id(''kid4'')', 0);
select tests.rows_eq('teacher1: no pay rates',                  'select * from public.staff_pay_rates', 0);
select tests.denied('teacher1: payroll report',                 'select * from public.payroll_report(''2026-09-01'')');
select tests.rows_eq('teacher1: sees only her own staff row',   'select * from public.staff', 1);
select tests.rows_eq('teacher1: staff directory has names',     'select * from public.staff_directory()', 7);
select tests.denied('teacher1: promote herself to manager',
  'update public.staff set role = ''manager'' where user_id = auth.uid()');
select tests.denied('teacher1: move herself to class 2',
  'update public.staff set class_id = tests.cls(2) where user_id = auth.uid()');
select tests.denied('teacher1: edit a child',                   'update public.children set last_name = ''x''');
select tests.denied('teacher1: delete a child',                 'delete from public.children');
select tests.allowed('teacher1: mark attendance in her class today',
  'insert into public.child_attendance (child_id, att_date, status, marked_by) values (tests.id(''kid1''), app_private.today_il(), ''present'', tests.id(''s_manager''))');
select tests.value_eq('teacher1: marked_by is forced to herself',
  'select marked_by::text from public.child_attendance where child_id = tests.id(''kid1'') and att_date = app_private.today_il()',
  (select id::text from tests.ids where key = 's_teacher1'));
select tests.denied('teacher1: mark attendance in class 2',
  'insert into public.child_attendance (child_id, att_date, status) values (tests.id(''kid4''), app_private.today_il(), ''present'')');
select tests.denied('teacher1: mark attendance 10 days ago',
  'insert into public.child_attendance (child_id, att_date, status) values (tests.id(''kid2''), app_private.today_il() - 10, ''present'')');
select tests.allowed('teacher1: write daily report for her class',
  'insert into public.daily_reports (class_id, report_date, children_count, summary) values (tests.cls(1), app_private.today_il(), 3, ''יום טוב'')');
select tests.denied('teacher1: write daily report for class 2',
  'insert into public.daily_reports (class_id, report_date, children_count, summary) values (tests.cls(2), app_private.today_il(), 3, ''x'')');
select tests.denied('teacher1: edit-conflict (stale version) changes nothing',
  'update public.daily_reports set summary = ''ישן'' where class_id = tests.cls(1) and report_date = app_private.today_il() and version = 99');
select tests.allowed('teacher1: edit with current version',
  'update public.daily_reports set summary = ''עודכן'' where class_id = tests.cls(1) and report_date = app_private.today_il() and version = 1');
select tests.allowed('teacher1: replace schedule of her class',
  'select public.replace_class_schedule(tests.cls(1), ''[{"time":"08:00","activity":"ארוחת בוקר"}]'')');
select tests.denied('teacher1: replace schedule of class 2',
  'select public.replace_class_schedule(tests.cls(2), ''[{"time":"08:00","activity":"x"}]'')');
select tests.denied('teacher1: insert shift directly (fake hours)',
  'insert into public.shifts (staff_id, started_at, ended_at) values (app_private.my_staff_id(), now() - interval ''9 hours'', now())');
select tests.allowed('teacher1: clock in',               'select public.clock_in()');
select tests.denied('teacher1: clock in twice',          'select public.clock_in()');
select tests.denied('teacher1: edit her own shift times','update public.shifts set started_at = started_at - interval ''3 hours''');
select tests.allowed('teacher1: clock out',              'select public.clock_out()');
select tests.rows_eq('teacher1: cannot read audit log',  'select * from public.audit_log', 0);
select tests.rows_eq('teacher1: sees 2 messages (all + personal)', 'select * from public.messages', 2);
select tests.rows_eq('teacher1: cannot see others'' receipts',
  'select * from public.message_recipients where staff_id <> app_private.my_staff_id()', 0);
select tests.rows_eq('teacher1: sees the class-1 complaint only', 'select * from public.complaints', 1);
select tests.denied('teacher1: send message',
  'select public.send_message(''x'', ''y'', ''all'', ''כולם'')');

-- ---------- assistant of class 1 ----------
reset role; select tests.login('u_assistant1');
select tests.rows_eq('assistant1: sees 3 children of her class', 'select * from public.children', 3);
select tests.rows_eq('assistant1: no parent details',           'select * from public.child_private', 0);
select tests.rows_eq('assistant1: allergies visible',
  'select * from public.children where allergies <> ''''', 1);
select tests.allowed('assistant1: mark attendance in her class',
  'insert into public.child_attendance (child_id, att_date, status) values (tests.id(''kid2''), app_private.today_il(), ''absent'')');
select tests.rows_eq('assistant1: reads class 1 reports',       'select * from public.daily_reports', 2);
select tests.denied('assistant1: write a daily report',
  'insert into public.daily_reports (class_id, report_date, children_count, summary) values (tests.cls(1), app_private.today_il() - 1, 3, ''x'')');
select tests.denied('assistant1: edit the schedule',
  'select public.replace_class_schedule(tests.cls(1), ''[{"time":"09:00","activity":"שינוי לא מורשה"}]'')');
select tests.rows_eq('assistant1: schedule unchanged after the attempt',
  'select * from public.schedule_items where class_id = tests.cls(1) and activity = ''ארוחת בוקר''', 1);
select tests.denied('assistant1: delete schedule rows directly',
  'delete from public.schedule_items');
select tests.rows_eq('assistant1: no pay rates',                'select * from public.staff_pay_rates', 0);
select tests.denied('assistant1: payroll report',               'select * from public.payroll_report(''2026-09-01'')');
select tests.rows_eq('assistant1: sees only the complaint assigned to her', 'select * from public.complaints', 1);
select tests.allowed('assistant1: update status of assigned complaint',
  'update public.complaints set status = ''in_progress'', resolution = ''דיברתי עם ההורה'' where assigned_to = app_private.my_staff_id()');
select tests.denied('assistant1: change subject of assigned complaint',
  'update public.complaints set subject = ''אחר'' where assigned_to = app_private.my_staff_id()');
select tests.rows_eq('assistant1: sees 1 message (to all)',     'select * from public.messages', 1);
select tests.denied('assistant1: set read receipt directly',
  'update public.message_recipients set read_at = now()');
select tests.allowed('assistant1: insert reminder',
  'insert into public.reminders (body, from_staff_id) values (''צריך מגבונים'', tests.id(''s_teacher2''))');
select tests.value_eq('assistant1: reminder sender forced to herself',
  'select from_staff_id::text from public.reminders where body = ''צריך מגבונים''',
  (select id::text from tests.ids where key = 's_assistant1'));
select tests.rows_eq('assistant1: cannot see other reminders',  'select * from public.reminders', 1);
select tests.denied('assistant1: mark her reminder as done',
  'update public.reminders set status = ''done''');
select tests.denied('assistant1: read class 2 attendance',
  'select * from public.child_attendance where class_id = tests.cls(2)');
reset role;
select tests.rows_eq('setup check: class 2 has attendance rows', 'select * from public.child_attendance where class_id = tests.cls(2)', 1);
select tests.login('u_assistant1');
select tests.rows_eq('assistant1: class 2 attendance invisible',
  'select * from public.child_attendance where class_id = tests.cls(2)', 0);

-- read receipt via the function works and only for herself
select tests.value_eq('assistant1: mark_message_read',
  'select (public.mark_message_read((select id from public.messages limit 1)) is null)::text', 'true');

-- ---------- teacher of class 2 ----------
reset role; select tests.login('u_teacher2');
select tests.rows_eq('teacher2: sees her class complaint',     'select * from public.complaints', 1);
select tests.allowed('teacher2: create complaint',
  'insert into public.complaints (complaint_date, child_id, subject, status, assigned_to) values (app_private.today_il(), tests.id(''kid5''), ''פנייה'', ''closed'', tests.id(''s_teacher1''))');
select tests.value_eq('teacher2: new complaint forced to open + unassigned',
  'select status::text || ''/'' || coalesce(assigned_to::text, ''none'') from public.complaints where subject = ''פנייה''', 'open/none');
select tests.rows_eq('teacher2: no parent details of class 1',
  'select * from public.child_private where child_id = tests.id(''kid1'')', 0);

-- ---------- audit trail written by the server ----------
reset role;
select tests.rows_eq('audit: teacher1 report is logged with her id',
  'select * from public.audit_log where table_name = ''daily_reports'' and actor_staff_id = tests.id(''s_teacher1'')', 2);
select tests.rows_eq('audit: assistant1 complaint update logged',
  'select * from public.audit_log where table_name = ''complaints'' and action = ''update'' and actor_staff_id = tests.id(''s_assistant1'')', 1);
