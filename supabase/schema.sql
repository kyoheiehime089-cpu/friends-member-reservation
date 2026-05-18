-- friends / blossom yoga member reservation system schema
-- Run this file in the Supabase SQL editor. It contains no secrets.

create extension if not exists "pgcrypto";

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  default_capacity integer not null check (default_capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  weekly_limit integer,
  unlimited boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  full_name text not null,
  email text not null unique,
  status text not null default '有効' check (status in ('有効','休会中','退会予定','退会済み','停止中','未払い')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  max_active_reservations integer not null default 2,
  allow_multiple_same_day boolean not null default false,
  bookable_days_ahead integer not null default 14,
  cancel_deadline_time time not null default '22:00',
  cancel_deadline_days_before integer not null default 1,
  booking_start_date date not null default current_date,
  week_starts_on text not null default 'monday',
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_slots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_id, starts_at)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_slot_id uuid not null references public.reservation_slots(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'booked' check (status in ('booked','cancelled','attended','no_show')),
  created_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reservation_slot_id, member_id)
);

create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  mail_from_friends text,
  mail_from_yoga text,
  admin_notification_email text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.mail_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  to_email text not null,
  subject text not null,
  status text not null default 'queued',
  provider_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings_change_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  setting_name text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.admin_users where id = auth.uid());
$$;

create or replace function public.ensure_reservation_capacity()
returns trigger language plpgsql as $$
declare
  current_count integer;
  slot_capacity integer;
begin
  if new.status <> 'booked' then
    return new;
  end if;

  select capacity into slot_capacity from public.reservation_slots where id = new.reservation_slot_id;
  select count(*) into current_count from public.reservations where reservation_slot_id = new.reservation_slot_id and status = 'booked' and id <> coalesce(new.id, gen_random_uuid());

  if current_count >= slot_capacity then
    raise exception '予約枠の定員を超えています';
  end if;

  return new;
end;
$$;


create or replace function public.get_slot_booking_counts(slot_ids uuid[])
returns table (reservation_slot_id uuid, booked_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.reservation_slot_id, count(*)::bigint as booked_count
  from public.reservations r
  where r.reservation_slot_id = any(slot_ids)
    and r.status = 'booked'
  group by r.reservation_slot_id;
$$;

drop trigger if exists reservations_capacity_guard on public.reservations;
create trigger reservations_capacity_guard
before insert or update on public.reservations
for each row execute function public.ensure_reservation_capacity();

alter table public.stores enable row level security;
alter table public.menus enable row level security;
alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.admin_users enable row level security;
alter table public.reservation_rules enable row level security;
alter table public.reservation_slots enable row level security;
alter table public.reservations enable row level security;
alter table public.notification_settings enable row level security;
alter table public.mail_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings_change_logs enable row level security;

-- Re-runnable policy setup.
drop policy if exists "public read active menus" on public.menus;
create policy "public read active menus" on public.menus for select using (is_active = true);
drop policy if exists "public read active plans" on public.plans;
create policy "public read active plans" on public.plans for select using (is_active = true);
drop policy if exists "public read open slots" on public.reservation_slots;
drop policy if exists "public read reservation slots" on public.reservation_slots;
create policy "public read reservation slots" on public.reservation_slots for select using (true);

drop policy if exists "members read own profile" on public.members;
create policy "members read own profile" on public.members for select using (id = auth.uid() or public.is_admin());
drop policy if exists "members update own profile" on public.members;
create policy "members update own profile" on public.members for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members read own reservations" on public.reservations;
create policy "members read own reservations" on public.reservations for select using (member_id = auth.uid() or public.is_admin());
drop policy if exists "members create own reservations" on public.reservations;
create policy "members create own reservations" on public.reservations for insert with check (member_id = auth.uid() or public.is_admin());
drop policy if exists "members cancel own reservations" on public.reservations;
create policy "members cancel own reservations" on public.reservations for update using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());

-- Admin policies for management tables.
do $$
declare table_name text;
begin
  foreach table_name in array array['stores','menus','plans','members','admin_users','reservation_rules','reservation_slots','reservations','notification_settings','mail_logs','audit_logs','settings_change_logs'] loop
    execute format('drop policy if exists "admin manage %1$s" on public.%1$I', table_name);
    execute format('create policy "admin manage %1$s" on public.%1$I for all using (public.is_admin()) with check (public.is_admin())', table_name);
  end loop;
end $$;

insert into public.stores (name) values ('friends 行徳') on conflict (name) do nothing;

with store as (select id from public.stores where name = 'friends 行徳')
insert into public.menus (store_id, name, description, default_capacity)
select store.id, menu.name, menu.description, menu.capacity
from store, (values
  ('セミパーソナル','少人数トレーニング',5),
  ('ヨガ','blossom yoga レッスン',7),
  ('イベント','イベント・ワークショップ',8)
) as menu(name, description, capacity)
where not exists (select 1 from public.menus m where m.store_id = store.id and m.name = menu.name);

insert into public.plans (name, weekly_limit, unlimited) values
  ('セミパーソナル週1',1,false),
  ('セミパーソナル週2',2,false),
  ('ヨガ週1',1,false),
  ('ヨガ週2',2,false),
  ('ヨガ通い放題',null,true),
  ('その他',null,false)
on conflict (name) do nothing;

with store as (select id from public.stores where name = 'friends 行徳')
insert into public.reservation_rules (store_id)
select id from store
where not exists (select 1 from public.reservation_rules r where r.store_id = store.id);

-- Initial owner: create Auth user in Supabase, then run with its UUID.
-- insert into public.admin_users (id, email, role) values ('AUTH_USER_UUID', 'kyohei.ehime089@gmail.com', 'owner');
