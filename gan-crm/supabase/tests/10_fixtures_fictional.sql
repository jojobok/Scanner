-- =====================================================================
-- LOCAL TESTING ONLY. Fictional people - not real children or staff.
-- =====================================================================
create schema tests;
grant usage on schema tests to anon, authenticated;

create table tests.results (id serial primary key, label text, ok boolean, detail text);
grant select, insert on tests.results to anon, authenticated;
grant usage on sequence tests.results_id_seq to anon, authenticated;

-- fixed ids for fictional users
create table tests.ids (key text primary key, id uuid);
grant select on tests.ids to anon, authenticated;
create function tests.id(k text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from tests.ids where key = k
$$;
create function tests.cls(n int) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.classes where sort_order = n
$$;
grant execute on function tests.id(text), tests.cls(int) to anon, authenticated;

-- fixtures are inserted directly, without the app's server-side triggers
set session_replication_role = replica;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'manager@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'teacher1@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'assistant1@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'teacher2@example.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'assistant2@example.test'),
  ('00000000-0000-0000-0000-0000000000a6', 'former@example.test'),
  ('00000000-0000-0000-0000-0000000000a7', 'stranger@example.test'),
  ('00000000-0000-0000-0000-0000000000a8', 'newhire@example.test');

insert into tests.ids (key, id) select 'u_' || split_part(email, '@', 1), id from auth.users;

insert into public.staff (user_id, email, full_name, role, class_id) values
  (tests.id('u_manager'),    'manager@example.test',    'מנהלת לדוגמה',   'manager',   null),
  (tests.id('u_teacher1'),   'teacher1@example.test',   'גננת א לדוגמה',  'teacher',   tests.cls(1)),
  (tests.id('u_assistant1'), 'assistant1@example.test', 'סייעת א לדוגמה', 'assistant', tests.cls(1)),
  (tests.id('u_teacher2'),   'teacher2@example.test',   'גננת ב לדוגמה',  'teacher',   tests.cls(2)),
  (tests.id('u_assistant2'), 'assistant2@example.test', 'סייעת ב לדוגמה', 'assistant', tests.cls(2)),
  (tests.id('u_former'),     'former@example.test',     'עובדת לשעבר',    'assistant', tests.cls(1));
update public.staff set active = false where email = 'former@example.test';
-- invited but has not signed in yet (user_id empty)
insert into public.staff (email, full_name, role, class_id) values ('newhire@example.test', 'עובדת חדשה', 'assistant', tests.cls(1));

insert into tests.ids (key, id) select 's_' || split_part(email, '@', 1), id from public.staff;

insert into public.staff_pay_rates (staff_id, hourly_rate, valid_from)
select id, case role when 'teacher' then 60 when 'assistant' then 40 else 80 end, '2025-01-01' from public.staff;
-- assistant1 got a raise from 15/09/2026
insert into public.staff_pay_rates (staff_id, hourly_rate, valid_from) values (tests.id('s_assistant1'), 50, '2026-09-15');

-- 3 fictional children in class 1, 3 in class 2
insert into public.children (first_name, last_name, class_id, allergies)
select 'ילד' || g, 'בדיקה', case when g <= 3 then tests.cls(1) else tests.cls(2) end, case when g = 1 then 'בוטנים (בדיוני)' else '' end
from generate_series(1, 6) g;
insert into public.child_private (child_id, birth_date, parent1_name, parent1_phone)
select id, '2025-03-01', 'הורה בדיוני', '000-0000000' from public.children;
insert into tests.ids (key, id) select 'kid' || substr(first_name, 4), id from public.children;

-- payroll fixture: assistant1, September 2026, Israel time
insert into public.shifts (staff_id, started_at, ended_at, source) values
  (tests.id('s_assistant1'), '2026-09-10 07:00 Asia/Jerusalem', '2026-09-10 15:00 Asia/Jerusalem', 'manual'),
  (tests.id('s_assistant1'), '2026-09-20 07:00 Asia/Jerusalem', '2026-09-20 15:00 Asia/Jerusalem', 'manual');

-- reports, complaints, reminders
insert into public.daily_reports (class_id, report_date, children_count, summary)
values (tests.cls(1), '2026-11-01', 3, 'דוח בדיוני כיתה א'), (tests.cls(2), '2026-11-01', 3, 'דוח בדיוני כיתה ב');
insert into public.complaints (complaint_date, child_id, subject, assigned_to, created_by)
values ('2026-11-01', tests.id('kid1'), 'תלונה בדיונית א', tests.id('s_assistant1'), tests.id('s_manager')),
       ('2026-11-01', tests.id('kid4'), 'תלונה בדיונית ב', null, tests.id('s_teacher2'));
update public.complaints c set class_id = k.class_id from public.children k where k.id = c.child_id;
insert into public.reminders (body) values ('תזכורת בדיונית של גננת ב');
update public.reminders set from_staff_id = tests.id('s_teacher2');

set session_replication_role = origin;

-- ---------- test helpers (run as the API role being tested) ----------
create function tests.login(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(k), 'email', (select email from auth.users where id = tests.id(k)), 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'anon', false);
end $$;

create function tests.record(p_label text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into tests.results (label, ok, detail) values (p_label, p_ok, p_detail) $$;

-- expect a query to return exactly N rows (an error counts as failure, unless expect_error)
create function tests.rows_eq(p_label text, p_sql text, p_expected bigint) returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  perform tests.record(p_label, n = p_expected, format('got %s, expected %s', n, p_expected));
exception when others then
  perform tests.record(p_label, false, 'error: ' || sqlerrm);
end $$;

-- expect the statement to be blocked: an error, or zero rows affected
create function tests.denied(p_label text, p_sql text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform tests.record(p_label, n = 0, format('statement affected %s rows', n));
exception when others then
  perform tests.record(p_label, true, 'blocked: ' || sqlerrm);
end $$;

-- expect the statement to succeed and affect at least one row
create function tests.allowed(p_label text, p_sql text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform tests.record(p_label, n > 0, format('affected %s rows', n));
exception when others then
  perform tests.record(p_label, false, 'error: ' || sqlerrm);
end $$;

-- expect a scalar query to equal a value
create function tests.value_eq(p_label text, p_sql text, p_expected text) returns void language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  perform tests.record(p_label, v is not distinct from p_expected, format('got %s, expected %s', v, p_expected));
exception when others then
  perform tests.record(p_label, false, 'error: ' || sqlerrm);
end $$;

grant execute on all functions in schema tests to anon, authenticated;
