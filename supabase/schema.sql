-- ============================================================
-- Anjam — Supabase schema  (paste into SQL Editor → Run)
-- Idempotent: safe to run more than once.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- lists (projects) ----------
create table if not exists public.lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#6366f1',
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

-- ---------- labels ----------
create table if not exists public.labels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#3b82f6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

-- ---------- tasks ----------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id     uuid references public.lists (id) on delete set null,
  parent_id   uuid references public.tasks (id) on delete cascade,
  title       text not null default '',
  notes       text not null default '',
  status      text not null default 'todo' check (status in ('todo', 'done')),
  priority    smallint not null default 0 check (priority between 0 and 4),
  due_at      timestamptz,
  all_day     boolean not null default true,
  recurrence  text not null default 'none',
  completed_at timestamptz,
  labels      text[] not null default '{}',
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- ---------- habits (routine) ----------
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#10b981',
  logs       text[] not null default '{}',
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

-- ---------- important_dates (key dates with lead-time reminders) ----------
create table if not exists public.important_dates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null,
  system       text not null default 'jalali' check (system in ('jalali', 'gregorian', 'hijri')),
  month        int  not null check (month between 1 and 12),
  day          int  not null check (day between 1 and 31),
  remind_days  int  not null default 10 check (remind_days between 0 and 365),
  remind_time  text not null default '09:00',
  enabled      boolean not null default true,
  source       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

-- ---------- indexes ----------
create index if not exists lists_user_updated on public.lists (user_id, updated_at);
create index if not exists habits_user_updated on public.habits (user_id, updated_at);
create index if not exists important_dates_user_updated on public.important_dates (user_id, updated_at);
create index if not exists labels_user_updated on public.labels (user_id, updated_at);
create index if not exists tasks_user_updated on public.tasks (user_id, updated_at);
create index if not exists tasks_list_id       on public.tasks (list_id);
create index if not exists tasks_parent_id     on public.tasks (parent_id);
create index if not exists tasks_due_at        on public.tasks (user_id, due_at);

-- ---------- row level security ----------
alter table public.lists  enable row level security;
alter table public.habits enable row level security;
alter table public.important_dates enable row level security;
alter table public.labels enable row level security;
alter table public.tasks  enable row level security;

drop policy if exists lists_owner_all  on public.lists;
drop policy if exists labels_owner_all on public.labels;
drop policy if exists tasks_owner_all  on public.tasks;

create policy lists_owner_all  on public.lists  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists habits_owner_all on public.habits;
create policy habits_owner_all on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists important_dates_owner_all on public.important_dates;
create policy important_dates_owner_all on public.important_dates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy labels_owner_all on public.labels for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_owner_all  on public.tasks  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- realtime (postgres_changes) ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.lists;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.labels;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.habits;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.important_dates;
  exception when others then null; end;
end $$;


-- ---------- v1.3: optional study & workout sections ----------

create table if not exists public.study_subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#3b82f6',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists public.study_slots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid references public.study_subjects (id) on delete set null,
  weekday     int  not null check (weekday between 0 and 6),
  start       text not null,
  end         text not null,
  room        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists public.study_homework (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid references public.study_subjects (id) on delete set null,
  title       text not null,
  due         date,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists public.study_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid references public.study_subjects (id) on delete set null,
  date        date not null,
  minutes     int  not null check (minutes between 1 and 1440),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists public.workout_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weekday     int  not null check (weekday between 0 and 6),
  time        text,
  exercises   jsonb not null default '[]'::jsonb,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists public.workout_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  plan_id     uuid references public.workout_plans (id) on delete set null,
  done        jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create index if not exists study_subjects_user_order on public.study_subjects (user_id, sort_order);
create index if not exists study_slots_user_week on public.study_slots (user_id, weekday);
create index if not exists study_homework_user_due on public.study_homework (user_id, due);
create index if not exists study_logs_user_date on public.study_logs (user_id, date);
create index if not exists workout_plans_user_week on public.workout_plans (user_id, weekday);
create index if not exists workout_logs_user_date on public.workout_logs (user_id, date);

alter table public.study_subjects enable row level security;
alter table public.study_slots enable row level security;
alter table public.study_homework enable row level security;
alter table public.study_logs enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_logs enable row level security;

drop policy if exists study_subjects_owner_all on public.study_subjects;
create policy study_subjects_owner_all on public.study_subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists study_slots_owner_all on public.study_slots;
create policy study_slots_owner_all on public.study_slots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists study_homework_owner_all on public.study_homework;
create policy study_homework_owner_all on public.study_homework for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists study_logs_owner_all on public.study_logs;
create policy study_logs_owner_all on public.study_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists workout_plans_owner_all on public.workout_plans;
create policy workout_plans_owner_all on public.workout_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists workout_logs_owner_all on public.workout_logs;
create policy workout_logs_owner_all on public.workout_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  begin
    alter publication supabase_realtime add table public.study_subjects;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.study_slots;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.study_homework;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.study_logs;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.workout_plans;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.workout_logs;
  exception when others then null; end;
end $$;
