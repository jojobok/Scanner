-- =====================================================================
-- Kindergarten CRM - core schema
-- Migration 1/4: types and tables only (no permissions yet).
-- Target: Supabase (PostgreSQL 15+). Uses auth.users from Supabase Auth.
-- No real data is created by this file.
-- =====================================================================

-- ---------- enum types ----------
create type public.staff_role as enum ('manager', 'teacher', 'assistant');
create type public.attendance_status as enum ('present', 'absent');
create type public.priority_level as enum ('normal', 'high', 'urgent');
create type public.complaint_status as enum ('open', 'in_progress', 'closed');
create type public.reminder_status as enum ('open', 'done');
create type public.shift_source as enum ('clock', 'manual');

-- ---------- garden settings (single row) ----------
create table public.garden_settings (
  id          boolean primary key default true check (id),
  garden_name text not null default 'הגן שלנו' check (char_length(garden_name) between 1 and 100),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

-- ---------- classes ----------
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  age_label   text not null default '' check (char_length(age_label) <= 60),
  capacity    integer not null default 0 check (capacity between 0 and 100),
  color       text not null default '#86b6f2' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

-- ---------- staff (manager, teachers, assistants) ----------
-- user_id links a staff row to a Supabase Auth account. It is filled the
-- first time an invited person signs in (see public.link_my_account()).
create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,
  email       text unique check (email is null or (email = lower(email) and email like '%@%')),
  full_name   text not null check (char_length(full_name) between 1 and 100),
  role        public.staff_role not null,
  class_id    uuid references public.classes (id) on delete set null,
  phone       text not null default '' check (char_length(phone) <= 30),
  start_date  date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);
create index staff_class_idx on public.staff (class_id);

-- Hourly pay is kept apart from the staff row so that only the manager
-- can ever read it. A history of rates keeps past payroll correct.
create table public.staff_pay_rates (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff (id) on delete cascade,
  hourly_rate numeric(8, 2) not null check (hourly_rate between 0 and 1000),
  valid_from  date not null,
  created_at  timestamptz not null default now(),
  unique (staff_id, valid_from)
);

-- ---------- children ----------
-- Basic details every staff member of the class may see (incl. allergies,
-- which are safety information).
create table public.children (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null check (char_length(first_name) between 1 and 60),
  last_name   text not null check (char_length(last_name) between 1 and 60),
  class_id    uuid not null references public.classes (id) on delete restrict,
  allergies   text not null default '' check (char_length(allergies) <= 300),
  start_date  date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);
create index children_class_idx on public.children (class_id) where active;

-- More sensitive details: birth date, parents and notes.
-- Visible to the manager and the class teacher only.
create table public.child_private (
  child_id      uuid primary key references public.children (id) on delete cascade,
  birth_date    date,
  parent1_name  text not null default '' check (char_length(parent1_name) <= 100),
  parent1_phone text not null default '' check (char_length(parent1_phone) <= 30),
  parent2_name  text not null default '' check (char_length(parent2_name) <= 100),
  parent2_phone text not null default '' check (char_length(parent2_phone) <= 30),
  notes         text not null default '' check (char_length(notes) <= 2000),
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);

-- ---------- children attendance ----------
-- class_id is copied from the child when marked (kept for history if the
-- child later moves class). One row per child per day.
create table public.child_attendance (
  child_id   uuid not null references public.children (id) on delete cascade,
  att_date   date not null,
  class_id   uuid not null references public.classes (id),
  status     public.attendance_status not null,
  marked_by  uuid references public.staff (id) on delete set null,
  marked_at  timestamptz not null default now(),
  primary key (child_id, att_date)
);
create index child_attendance_class_date_idx on public.child_attendance (class_id, att_date);

-- ---------- staff shifts (clock in / out) ----------
create table public.shifts (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.staff (id) on delete restrict,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  source       public.shift_source not null default 'clock',
  needs_review boolean not null default false,
  note         text not null default '' check (char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or ended_at - started_at <= interval '16 hours')
);
create unique index shifts_one_open_per_staff on public.shifts (staff_id) where ended_at is null;
create index shifts_staff_start_idx on public.shifts (staff_id, started_at);

-- ---------- daily reports ----------
create table public.daily_reports (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete restrict,
  report_date    date not null,
  author_id      uuid references public.staff (id) on delete set null,
  updated_by     uuid references public.staff (id) on delete set null,
  children_count integer not null check (children_count between 0 and 200),
  summary        text not null check (char_length(summary) between 1 and 5000),
  meals          text not null default '' check (char_length(meals) <= 2000),
  highlights     text not null default '' check (char_length(highlights) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  unique (class_id, report_date)
);

-- ---------- parent complaints ----------
create table public.complaints (
  id             uuid primary key default gen_random_uuid(),
  complaint_date date not null,
  child_id       uuid references public.children (id) on delete set null,
  class_id       uuid references public.classes (id) on delete set null,
  parent_name    text not null default '' check (char_length(parent_name) <= 100),
  parent_phone   text not null default '' check (char_length(parent_phone) <= 30),
  subject        text not null check (char_length(subject) between 1 and 200),
  description    text not null default '' check (char_length(description) <= 4000),
  priority       public.priority_level not null default 'normal',
  status         public.complaint_status not null default 'open',
  assigned_to    uuid references public.staff (id) on delete set null,
  resolution     text not null default '' check (char_length(resolution) <= 4000),
  created_by     uuid references public.staff (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1
);
create index complaints_status_idx on public.complaints (status, created_at desc);

-- ---------- daily schedule per class ----------
create table public.schedule_items (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  start_time  time not null,
  activity    text not null check (char_length(activity) between 1 and 200),
  created_at  timestamptz not null default now()
);
create index schedule_items_class_idx on public.schedule_items (class_id, start_time);

-- ---------- messages from the manager ----------
create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  sender_id      uuid references public.staff (id) on delete set null,
  audience_label text not null check (char_length(audience_label) <= 100),
  subject        text not null check (char_length(subject) between 1 and 200),
  body           text not null check (char_length(body) between 1 and 5000),
  created_at     timestamptz not null default now()
);

create table public.message_recipients (
  message_id uuid not null references public.messages (id) on delete cascade,
  staff_id   uuid not null references public.staff (id) on delete cascade,
  read_at    timestamptz,
  primary key (message_id, staff_id)
);
create index message_recipients_staff_idx on public.message_recipients (staff_id, read_at);

-- ---------- reminders from staff to the manager ----------
create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  from_staff_id uuid references public.staff (id) on delete set null,
  body          text not null check (char_length(body) between 1 and 1000),
  due_date      date,
  priority      public.priority_level not null default 'normal',
  status        public.reminder_status not null default 'open',
  manager_note  text not null default '' check (char_length(manager_note) <= 1000),
  done_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);
create index reminders_status_idx on public.reminders (status, due_date);

-- ---------- audit log (append only, written by triggers) ----------
create table public.audit_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor_user_id  uuid,
  actor_staff_id uuid,
  action         text not null,
  table_name     text,
  record_id      text,
  old_data       jsonb,
  new_data       jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_actor_idx on public.audit_log (actor_staff_id, at desc);
