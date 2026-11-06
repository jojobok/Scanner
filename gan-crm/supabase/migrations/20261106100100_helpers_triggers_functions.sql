-- =====================================================================
-- Kindergarten CRM - helpers, triggers and server functions
-- Migration 2/4.
-- Helper functions live in schema app_private, which is NOT exposed
-- through the Supabase API. Policies call them.
-- All SECURITY DEFINER functions pin search_path = '' and use
-- fully qualified names.
-- =====================================================================

create schema if not exists app_private;

-- ---------- identity helpers ----------
create or replace function app_private.my_staff_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.staff s
  where s.user_id = (select auth.uid()) and s.active
$$;

create or replace function app_private.my_role()
returns public.staff_role language sql stable security definer set search_path = '' as $$
  select s.role from public.staff s
  where s.user_id = (select auth.uid()) and s.active
$$;

create or replace function app_private.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select app_private.my_role()) = 'manager', false)
$$;

create or replace function app_private.is_active_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select app_private.my_staff_id()) is not null
$$;

-- member of the class (teacher or assistant)
create or replace function app_private.is_class_member(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.active and s.class_id = p_class
  )
$$;

create or replace function app_private.is_class_teacher(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.active
      and s.class_id = p_class and s.role = 'teacher'
  )
$$;

create or replace function app_private.child_class(p_child uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.class_id from public.children c where c.id = p_child
$$;

-- "today" in Israel (the database clock runs in UTC)
create or replace function app_private.today_il()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Jerusalem')::date
$$;

-- ---------- generic triggers ----------
-- updated_at + version (version is used for edit-conflict detection:
-- the app updates "where id = X and version = V"; 0 rows = conflict)
create or replace function app_private.touch_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create or replace function app_private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_user_id, actor_staff_id, action, table_name, record_id, old_data, new_data)
  values (
    (select auth.uid()),
    app_private.my_staff_id(),
    lower(tg_op),
    tg_table_name,
    coalesce(j ->> 'id', j ->> 'child_id' || coalesce(':' || (j ->> 'att_date'), ''), j ->> 'message_id'),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- attach touch_row to every table that has a version column
do $$
declare t text;
begin
  foreach t in array array['garden_settings','classes','staff','children','child_private','shifts',
                           'daily_reports','complaints','reminders'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.touch_row()', t || '_touch', t);
  end loop;
  foreach t in array array['garden_settings','classes','staff','staff_pay_rates','children','child_private',
                           'child_attendance','shifts','daily_reports','complaints','schedule_items',
                           'messages','reminders'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------- table-specific guards ----------
-- attendance: class and marker are set by the server, not by the client
create or replace function app_private.attendance_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.class_id := (select c.class_id from public.children c where c.id = new.child_id);
  new.marked_by := app_private.my_staff_id();
  new.marked_at := now();
  return new;
end $$;
create trigger child_attendance_fill before insert or update on public.child_attendance
  for each row execute function app_private.attendance_fill();

-- daily reports: author / editor set by the server
create or replace function app_private.report_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := app_private.my_staff_id();
  else
    new.author_id := old.author_id;
    new.class_id := old.class_id;          -- a report cannot move to another class
    new.report_date := old.report_date;
  end if;
  new.updated_by := app_private.my_staff_id();
  return new;
end $$;
create trigger daily_reports_fill before insert or update on public.daily_reports
  for each row execute function app_private.report_fill();

-- complaints: creator and class set by the server; non-managers may only
-- create "open" complaints and, when assigned, change status/resolution.
create or replace function app_private.complaint_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := app_private.my_staff_id();
    new.class_id := (select c.class_id from public.children c where c.id = new.child_id);
    if not app_private.is_manager() then
      new.status := 'open';
      new.assigned_to := null;
      new.resolution := '';
    end if;
  elsif not app_private.is_manager() then
    if (new.complaint_date, new.child_id, new.class_id, new.parent_name, new.parent_phone, new.subject,
        new.description, new.priority, new.assigned_to, new.created_by)
       is distinct from
       (old.complaint_date, old.child_id, old.class_id, old.parent_name, old.parent_phone, old.subject,
        old.description, old.priority, old.assigned_to, old.created_by) then
      raise exception 'only_status_and_resolution_may_change' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger complaints_guard before insert or update on public.complaints
  for each row execute function app_private.complaint_guard();

-- reminders: sender set by the server; new reminders always start open
create or replace function app_private.reminder_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.from_staff_id := app_private.my_staff_id();
    new.status := 'open';
    new.manager_note := '';
    new.done_at := null;
  elsif new.status = 'done' and old.status <> 'done' then
    new.done_at := now();
  elsif new.status = 'open' then
    new.done_at := null;
  end if;
  return new;
end $$;
create trigger reminders_fill before insert or update on public.reminders
  for each row execute function app_private.reminder_fill();

-- messages: sender set by the server
create or replace function app_private.message_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.sender_id := app_private.my_staff_id();
  return new;
end $$;
create trigger messages_fill before insert on public.messages
  for each row execute function app_private.message_fill();

-- =====================================================================
-- API functions (callable by signed-in users through supabase.rpc)
-- =====================================================================

-- Link the signed-in account to the staff row that has the same email.
-- Only works for emails the manager added to the staff list.
create or replace function public.link_my_account()
returns public.staff language plpgsql security definer set search_path = '' as $$
declare r public.staff;
begin
  select * into r from public.staff where user_id = (select auth.uid());
  if found then return r; end if;
  update public.staff s set user_id = (select auth.uid())
   where s.email = lower((select auth.email())) and s.user_id is null and s.active
   returning * into r;
  if not found then
    raise exception 'no_staff_record_for_this_email' using errcode = '42501';
  end if;
  return r;
end $$;

-- Staff names/roles/classes for everyone signed in (no phone, no email).
create or replace function public.staff_directory()
returns table (id uuid, full_name text, role public.staff_role, class_id uuid, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_active_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query select s.id, s.full_name, s.role, s.class_id, s.active from public.staff s order by s.full_name;
end $$;

-- Clock in / out use the SERVER clock, so times cannot be faked from a phone.
create or replace function public.clock_in()
returns public.shifts language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := app_private.my_staff_id();
  r public.shifts;
begin
  if v_staff is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  -- an old shift that was never closed: close with zero hours and flag for the manager
  update public.shifts set ended_at = started_at, needs_review = true,
         note = trim(note || ' לא נרשמה יציאה – לבדיקת המנהלת')
   where staff_id = v_staff and ended_at is null and started_at < now() - interval '16 hours';
  if exists (select 1 from public.shifts where staff_id = v_staff and ended_at is null) then
    raise exception 'already_clocked_in' using errcode = 'P0001';
  end if;
  insert into public.shifts (staff_id, started_at, source) values (v_staff, now(), 'clock') returning * into r;
  return r;
end $$;

create or replace function public.clock_out()
returns public.shifts language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := app_private.my_staff_id();
  r public.shifts;
begin
  if v_staff is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.shifts
     set ended_at = case when now() - started_at > interval '16 hours' then started_at else now() end,
         needs_review = (now() - started_at > interval '16 hours')
   where staff_id = v_staff and ended_at is null
   returning * into r;
  if not found then raise exception 'not_clocked_in' using errcode = 'P0001'; end if;
  return r;
end $$;

-- Payroll for one month: hours x the hourly rate valid on each shift's date.
-- Manager only (enforced here, and pay rates are manager-only by RLS).
create or replace function public.payroll_report(p_month date)
returns table (staff_id uuid, full_name text, role public.staff_role, class_id uuid,
               work_days integer, minutes integer, gross numeric, open_shifts integer,
               review_shifts integer, current_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not app_private.is_manager() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  with sh as (
    select x.staff_id, (x.started_at at time zone 'Asia/Jerusalem')::date as work_date,
           x.ended_at, x.needs_review,
           case when x.ended_at is null then 0
                else floor(extract(epoch from (x.ended_at - x.started_at)) / 60)::integer end as mins
      from public.shifts x
     where x.started_at >= (v_from::timestamp at time zone 'Asia/Jerusalem')
       and x.started_at <  (v_to::timestamp at time zone 'Asia/Jerusalem')
  ), priced as (
    select sh.*, (select r.hourly_rate from public.staff_pay_rates r
                   where r.staff_id = sh.staff_id and r.valid_from <= sh.work_date
                   order by r.valid_from desc limit 1) as rate
      from sh
  )
  select s.id, s.full_name, s.role, s.class_id,
         count(distinct p.work_date) filter (where p.ended_at is not null)::integer,
         coalesce(sum(p.mins), 0)::integer,
         round(coalesce(sum(p.mins * coalesce(p.rate, 0) / 60.0), 0), 2),
         count(*) filter (where p.staff_id is not null and p.ended_at is null)::integer,
         count(*) filter (where p.needs_review)::integer,
         (select r.hourly_rate from public.staff_pay_rates r
           where r.staff_id = s.id and r.valid_from <= app_private.today_il()
           order by r.valid_from desc limit 1)
    from public.staff s
    left join priced p on p.staff_id = s.id
   where s.active or p.staff_id is not null
   group by s.id
   order by s.full_name;
end $$;

-- Send a message to: 'all' | 'role:teacher' | 'role:assistant' | 'class:<uuid>' | 'staff:<uuid>'.
-- SECURITY INVOKER: row level security decides (only the manager may insert).
create or replace function public.send_message(p_subject text, p_body text, p_audience text, p_label text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.messages (audience_label, subject, body)
  values (p_label, p_subject, p_body) returning id into v_id;
  insert into public.message_recipients (message_id, staff_id)
  select v_id, s.id from public.staff s
   where s.active and s.role <> 'manager'
     and (p_audience = 'all'
       or (p_audience like 'role:%'  and s.role::text = substr(p_audience, 6))
       or (p_audience like 'class:%' and s.class_id::text = substr(p_audience, 7))
       or (p_audience like 'staff:%' and s.id::text = substr(p_audience, 7)));
  if not found then raise exception 'no_recipients' using errcode = 'P0001'; end if;
  return v_id;
end $$;

create or replace function public.mark_message_read(p_message uuid)
returns void language sql security definer set search_path = '' as $$
  update public.message_recipients set read_at = now()
   where message_id = p_message and staff_id = app_private.my_staff_id() and read_at is null
$$;

-- Replace the whole daily schedule of a class in one transaction.
-- SECURITY INVOKER: RLS allows only the manager or that class's teacher.
create or replace function public.replace_class_schedule(p_class uuid, p_items jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  delete from public.schedule_items where class_id = p_class;
  insert into public.schedule_items (class_id, start_time, activity)
  select p_class, (i ->> 'time')::time, i ->> 'activity'
    from jsonb_array_elements(p_items) i;
  get diagnostics n = row_count;
  return n;
end $$;

-- App events that are not table changes (sign in, export, etc.)
create or replace function public.log_event(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_active_staff() then return; end if;
  insert into public.audit_log (actor_user_id, actor_staff_id, action)
  values ((select auth.uid()), app_private.my_staff_id(), left(p_action, 200));
end $$;
