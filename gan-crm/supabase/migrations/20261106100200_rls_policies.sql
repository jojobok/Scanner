-- =====================================================================
-- Kindergarten CRM - Row Level Security and privileges
-- Migration 3/4.
-- Rule of thumb: nothing is readable or writable unless a policy below
-- allows it. The anonymous (not signed in) role gets no access at all.
-- =====================================================================

-- ---------- privileges ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema app_private to authenticated;
revoke all on all functions in schema app_private from public, anon;
grant execute on all functions in schema app_private to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.link_my_account(), public.staff_directory(), public.clock_in(),
  public.clock_out(), public.payroll_report(date), public.send_message(text, text, text, text),
  public.mark_message_read(uuid), public.replace_class_schedule(uuid, jsonb), public.log_event(text)
  to authenticated;

-- The audit log is append-only and written only by triggers.
revoke insert, update, delete, truncate on public.audit_log from authenticated;
-- Read receipts change only through mark_message_read().
revoke update on public.message_recipients from authenticated;

-- ---------- enable RLS everywhere ----------
alter table public.garden_settings    enable row level security;
alter table public.classes            enable row level security;
alter table public.staff              enable row level security;
alter table public.staff_pay_rates    enable row level security;
alter table public.children           enable row level security;
alter table public.child_private      enable row level security;
alter table public.child_attendance   enable row level security;
alter table public.shifts             enable row level security;
alter table public.daily_reports      enable row level security;
alter table public.complaints         enable row level security;
alter table public.schedule_items     enable row level security;
alter table public.messages           enable row level security;
alter table public.message_recipients enable row level security;
alter table public.reminders          enable row level security;
alter table public.audit_log          enable row level security;

-- ---------- garden settings ----------
create policy settings_read on public.garden_settings for select to authenticated
  using ((select app_private.is_active_staff()));
create policy settings_manage on public.garden_settings for update to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

-- ---------- classes ----------
create policy classes_read on public.classes for select to authenticated
  using ((select app_private.is_active_staff()));
create policy classes_manage on public.classes for all to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

-- ---------- staff ----------
-- Manager sees everyone; each staff member sees only her own row.
-- Names of colleagues come from staff_directory() (no phone/email).
create policy staff_read on public.staff for select to authenticated
  using ((select app_private.is_manager()) or user_id = (select auth.uid()));
create policy staff_manage on public.staff for all to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

-- ---------- pay rates: manager only ----------
create policy pay_rates_manager on public.staff_pay_rates for all to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

-- ---------- children ----------
create policy children_read on public.children for select to authenticated
  using ((select app_private.is_manager()) or app_private.is_class_member(class_id));
create policy children_manage on public.children for all to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

-- parents, birth date, notes: manager + the class teacher (not assistants)
create policy child_private_read on public.child_private for select to authenticated
  using ((select app_private.is_manager()) or app_private.is_class_teacher(app_private.child_class(child_id)));
create policy child_private_manage on public.child_private for all to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

-- ---------- children attendance ----------
-- Class staff mark attendance for their own class, for today and the two
-- previous days only. The manager can mark/correct any day.
create policy attendance_read on public.child_attendance for select to authenticated
  using ((select app_private.is_manager()) or app_private.is_class_member(class_id));
create policy attendance_insert on public.child_attendance for insert to authenticated
  with check ((select app_private.is_manager())
    or (app_private.is_class_member(class_id)
        and att_date between (select app_private.today_il()) - 2 and (select app_private.today_il())));
create policy attendance_update on public.child_attendance for update to authenticated
  using ((select app_private.is_manager())
    or (app_private.is_class_member(class_id)
        and att_date between (select app_private.today_il()) - 2 and (select app_private.today_il())))
  with check ((select app_private.is_manager())
    or (app_private.is_class_member(class_id)
        and att_date between (select app_private.today_il()) - 2 and (select app_private.today_il())));
create policy attendance_delete on public.child_attendance for delete to authenticated
  using ((select app_private.is_manager())
    or (app_private.is_class_member(class_id)
        and att_date between (select app_private.today_il()) - 2 and (select app_private.today_il())));

-- ---------- shifts ----------
-- Staff read their own shifts; they create/close shifts only through
-- clock_in()/clock_out(). Manual entries and corrections: manager only.
create policy shifts_read on public.shifts for select to authenticated
  using ((select app_private.is_manager()) or staff_id = (select app_private.my_staff_id()));
create policy shifts_manage on public.shifts for all to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

-- ---------- daily reports ----------
-- Read: whole class staff. Write: the class teacher (and the manager).
create policy reports_read on public.daily_reports for select to authenticated
  using ((select app_private.is_manager()) or app_private.is_class_member(class_id));
create policy reports_insert on public.daily_reports for insert to authenticated
  with check ((select app_private.is_manager()) or app_private.is_class_teacher(class_id));
create policy reports_update on public.daily_reports for update to authenticated
  using ((select app_private.is_manager()) or app_private.is_class_teacher(class_id))
  with check ((select app_private.is_manager()) or app_private.is_class_teacher(class_id));
create policy reports_delete on public.daily_reports for delete to authenticated
  using ((select app_private.is_manager()));

-- ---------- complaints ----------
create policy complaints_read on public.complaints for select to authenticated
  using ((select app_private.is_manager())
      or created_by = (select app_private.my_staff_id())
      or assigned_to = (select app_private.my_staff_id())
      or app_private.is_class_teacher(class_id));
create policy complaints_insert on public.complaints for insert to authenticated
  with check ((select app_private.is_active_staff()));
create policy complaints_update on public.complaints for update to authenticated
  using ((select app_private.is_manager()) or assigned_to = (select app_private.my_staff_id()))
  with check ((select app_private.is_manager()) or assigned_to = (select app_private.my_staff_id()));
create policy complaints_delete on public.complaints for delete to authenticated
  using ((select app_private.is_manager()));

-- ---------- daily schedule ----------
create policy schedule_read on public.schedule_items for select to authenticated
  using ((select app_private.is_active_staff()));
create policy schedule_write on public.schedule_items for all to authenticated
  using ((select app_private.is_manager()) or app_private.is_class_teacher(class_id))
  with check ((select app_private.is_manager()) or app_private.is_class_teacher(class_id));

-- ---------- messages ----------
create policy messages_read on public.messages for select to authenticated
  using ((select app_private.is_manager())
      or exists (select 1 from public.message_recipients r
                  where r.message_id = id and r.staff_id = (select app_private.my_staff_id())));
create policy messages_manage on public.messages for all to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

create policy recipients_read on public.message_recipients for select to authenticated
  using ((select app_private.is_manager()) or staff_id = (select app_private.my_staff_id()));
create policy recipients_insert on public.message_recipients for insert to authenticated
  with check ((select app_private.is_manager()));
create policy recipients_delete on public.message_recipients for delete to authenticated
  using ((select app_private.is_manager()));

-- ---------- reminders ----------
create policy reminders_read on public.reminders for select to authenticated
  using ((select app_private.is_manager()) or from_staff_id = (select app_private.my_staff_id()));
create policy reminders_insert on public.reminders for insert to authenticated
  with check ((select app_private.is_active_staff()));
create policy reminders_update on public.reminders for update to authenticated
  using ((select app_private.is_manager())) with check ((select app_private.is_manager()));
create policy reminders_delete on public.reminders for delete to authenticated
  using ((select app_private.is_manager())
      or (from_staff_id = (select app_private.my_staff_id()) and status = 'open'));

-- ---------- audit log: manager reads, nobody edits ----------
create policy audit_read on public.audit_log for select to authenticated
  using ((select app_private.is_manager()));
