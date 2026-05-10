--
-- Schema definition for the friends member reservation system
-- This file can be executed in the Supabase SQL editor to set up
-- tables, constraints, and row level security policies.

-- Enable the pgcrypto extension for UUID generation
create extension if not exists "pgcrypto";

-- Table: gyms
create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table: menus (classes such as semi-personal, yoga, events)
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid references public.gyms(id) on delete cascade,
  name text not null,
  description text,
  capacity integer not null default 0,
  active boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table: plans (membership plans)
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  week_limit integer,
  concurrency_limit integer,
  allow_same_day boolean default false,
  reservation_period integer,
  cancel_deadline_hours integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table: auth.users is managed by Supabase. We link to it via profiles table.

-- Table: profiles (members) referencing auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  gym_id uuid references public.gyms(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'active', -- active, paused, cancelled, pending, suspended, arrears
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table: admin_profiles referencing auth.users
create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text unique,
  phone text,
  role text not null default 'admin', -- 'owner' or 'admin'
  permissions jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table: schedules (reservation slots)
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  capacity integer not null, -- actual capacity, defaults to menu.capacity
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_id, date, start_time)
);

-- Table: reservations
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active', -- active, cancelled
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (schedule_id, profile_id) -- prevent double booking same slot
);

-- Table: settings (key/value configuration)
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table: operation_logs (admin actions)
create table if not exists public.operation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admin_profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.reservations enable row level security;

-- RLS policy: Members can view and update their own profile
create policy if not exists "Profile: members view own" on public.profiles
  for select using (auth.uid() = id or exists (
    select 1 from public.admin_profiles ap where ap.id = auth.uid()
  ));
create policy if not exists "Profile: members update own" on public.profiles
  for update using (auth.uid() = id);

-- RLS policy: Admins can read all profiles
create policy if not exists "Profile: admin read" on public.profiles
  for select using (
    exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
  );

-- RLS policy: Admins manage profiles
create policy if not exists "Profile: admin insert" on public.profiles
  for insert with check (
    exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
  );
create policy if not exists "Profile: admin update" on public.profiles
  for update using (
    exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
  );

-- RLS policy: Only admins can modify schedules
create policy if not exists "Schedules: admin manage" on public.schedules
  for all using (
    exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
  ) with check (
    exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
  );

-- RLS policy: Members can view schedules
create policy if not exists "Schedules: public read" on public.schedules
  for select using (true);

-- RLS policy: Reservations
-- Members can create reservations for themselves
create policy if not exists "Reservations: member insert" on public.reservations
  for insert with check (auth.uid() = profile_id);
-- Members can read their own reservations
create policy if not exists "Reservations: member read own" on public.reservations
  for select using (auth.uid() = profile_id or exists (
    select 1 from public.admin_profiles ap where ap.id = auth.uid()
  ));
-- Members can update (cancel) their own reservations
create policy if not exists "Reservations: member update own" on public.reservations
  for update using (auth.uid() = profile_id);
-- Admins can manage reservations
create policy if not exists "Reservations: admin manage" on public.reservations
  for all using (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())) with check (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()));

-- RLS policy: Admins can manage menus, plans, settings, gyms without restrictions
alter table public.menus enable row level security;
create policy if not exists "Menus: admin manage" on public.menus
  for all using (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())) with check (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()));

alter table public.plans enable row level security;
create policy if not exists "Plans: admin manage" on public.plans
  for all using (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())) with check (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()));

alter table public.settings enable row level security;
create policy if not exists "Settings: admin manage" on public.settings
  for all using (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())) with check (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()));

alter table public.operation_logs enable row level security;
create policy if not exists "Operation logs: admin read" on public.operation_logs
  for select using (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()));
create policy if not exists "Operation logs: admin insert" on public.operation_logs
  for insert with check (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()));

-- ===================================================================
-- Helper functions
--
-- A convenience function to retrieve upcoming schedules along with the
-- number of active reservations for each slot. This is used by the
-- reservation UI to display available capacity without exposing
-- reservation details.
--
create or replace function public.get_upcoming_schedules(
  from_date date,
  to_date date
)
returns table (
  id uuid,
  gym_id uuid,
  menu_id uuid,
  date date,
  start_time time,
  end_time time,
  capacity integer,
  reservations_count integer,
  menu json
)
language sql
security definer
as $$
  select
    s.id,
    s.gym_id,
    s.menu_id,
    s.date,
    s.start_time,
    s.end_time,
    s.capacity,
    coalesce(count(r.id), 0) as reservations_count,
    json_build_object('id', m.id, 'name', m.name, 'description', m.description) as menu
  from public.schedules s
    join public.menus m on m.id = s.menu_id
    left join public.reservations r on r.schedule_id = s.id and r.status = 'active'
  where s.date >= from_date and s.date <= to_date and m.active = true
  group by s.id, s.gym_id, s.menu_id, s.date, s.start_time, s.end_time, s.capacity, m.id, m.name, m.description
  order by s.date asc, s.start_time asc;
$$;

-- NOTE: This schema intentionally leaves many business rules to the application layer
-- to allow flexibility. For example, weekly reservation limits, concurrency limits,
-- and plan-based restrictions should be enforced in application code or via
-- functions/triggers. See README for more details.