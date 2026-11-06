-- =====================================================================
-- Kindergarten CRM - realtime + starting rows
-- Migration 4/4.
-- Live updates: Supabase Realtime sends row changes to signed-in phones.
-- Realtime respects RLS, so each person only receives rows she may read.
-- Pay rates and the audit log are deliberately NOT published.
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.classes, public.children, public.child_attendance, public.shifts,
      public.daily_reports, public.complaints, public.schedule_items,
      public.message_recipients, public.messages, public.reminders;
  end if;
end $$;

-- The single settings row and the four classes of the kindergarten.
-- (Structure only. No children, staff or personal data.)
insert into public.garden_settings (id) values (true) on conflict do nothing;

insert into public.classes (name, age_label, capacity, color, sort_order) values
  ('תינוקייה',          'עד שנה',       8,  '#f4a3c8', 1),
  ('גיל שנה וחצי',     'שנה וחצי',     12, '#f5c74f', 2),
  ('גיל שנתיים',       'שנתיים',       14, '#7fd19a', 3),
  ('גיל שנתיים וחצי', 'שנתיים וחצי', 16, '#86b6f2', 4);
