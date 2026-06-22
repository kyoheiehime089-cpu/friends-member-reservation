-- friends-member-reservation minimum production launch SQL
-- Safe rules: do not drop tables, do not truncate, do not delete existing reservations or members.

create extension if not exists "pgcrypto";

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
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

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  default_capacity integer not null default 5 check (default_capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  full_name text not null,
  email text not null unique,
  status text not null default '有効',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.line_users (
  line_user_id text primary key,
  display_name text,
  member_status text not null default 'guest' check (member_status in ('guest','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_slots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_slot_id uuid,
  member_id uuid,
  status text not null default 'booked',
  created_by uuid,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mail_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid,
  to_email text not null default '',
  subject text not null default '',
  status text not null default 'skipped',
  provider_response jsonb,
  created_at timestamptz not null default now()
);

alter table public.reservations add column if not exists reservation_slot_id uuid;
alter table public.reservations add column if not exists member_id uuid;
alter table public.reservations add column if not exists status text;
alter table public.reservations add column if not exists created_by uuid;
alter table public.reservations add column if not exists cancelled_by uuid;
alter table public.reservations add column if not exists cancelled_at timestamptz;
alter table public.reservations add column if not exists created_at timestamptz default now();
alter table public.reservations alter column status set default 'booked';
update public.reservations set status = 'booked' where status = 'confirmed';

alter table public.mail_logs add column if not exists reservation_id uuid;
alter table public.mail_logs add column if not exists to_email text;
alter table public.mail_logs add column if not exists subject text;
alter table public.mail_logs add column if not exists status text default 'skipped';
alter table public.mail_logs add column if not exists provider_response jsonb;
alter table public.mail_logs add column if not exists created_at timestamptz default now();

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check check (status in ('booked','cancelled','attended','no_show')) not valid;

alter table public.reservations drop constraint if exists reservations_reservation_slot_id_member_id_key;
create unique index if not exists reservations_unique_booked_slot_member on public.reservations (reservation_slot_id, member_id) where status = 'booked' and reservation_slot_id is not null and member_id is not null;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.get_slot_booking_counts(slot_ids uuid[])
returns table (reservation_slot_id uuid, booked_count bigint)
language sql stable security definer set search_path = public as $$
  select r.reservation_slot_id, count(*)::bigint as booked_count
  from public.reservations r
  where r.reservation_slot_id = any(slot_ids)
    and r.status = 'booked'
  group by r.reservation_slot_id;
$$;

grant execute on function public.get_slot_booking_counts(uuid[]) to anon, authenticated;

create or replace function public.ensure_reservation_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_email text;
  v_name text;
  v_store_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'ログイン情報が確認できません';
  end if;

  if not public.is_admin() then
    new.member_id := v_uid;
  end if;

  new.created_by := coalesce(new.created_by, v_uid);
  new.status := coalesce(nullif(new.status, ''), 'booked');

  select store_id into v_store_id
  from public.reservation_slots
  where id = new.reservation_slot_id;

  v_email := coalesce(nullif(auth.jwt() ->> 'email', ''), v_uid::text || '@no-email.local');
  v_name := coalesce(nullif(auth.jwt() ->> 'name', ''), nullif(auth.jwt() ->> 'full_name', ''), v_email);

  insert into public.members (id, store_id, full_name, email, status)
  values (new.member_id, v_store_id, v_name, v_email, '有効')
  on conflict (id) do update set
    store_id = coalesce(public.members.store_id, excluded.store_id),
    full_name = coalesce(nullif(public.members.full_name, ''), excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists reservations_ensure_member_before_insert on public.reservations;
create trigger reservations_ensure_member_before_insert
before insert on public.reservations
for each row execute function public.ensure_reservation_member();

create or replace function public.ensure_reservation_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  current_count integer;
  slot_capacity integer;
  slot_starts_at timestamptz;
  slot_is_open boolean;
begin
  if new.status <> 'booked' then
    return new;
  end if;

  select capacity, starts_at, is_open
  into slot_capacity, slot_starts_at, slot_is_open
  from public.reservation_slots
  where id = new.reservation_slot_id
  for update;

  if slot_capacity is null then
    raise exception '予約枠が見つかりません';
  end if;

  if slot_is_open is not true then
    raise exception 'この予約枠は受付停止中です';
  end if;

  if slot_starts_at <= now() then
    raise exception '開始済み、または過去の予約枠は予約できません';
  end if;

  select count(*) into current_count
  from public.reservations
  where reservation_slot_id = new.reservation_slot_id
    and status = 'booked'
    and id <> coalesce(new.id, gen_random_uuid());

  if current_count >= slot_capacity then
    raise exception '予約枠の定員を超えています';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_capacity_guard on public.reservations;
create trigger reservations_capacity_guard
before insert or update of status, reservation_slot_id, member_id on public.reservations
for each row execute function public.ensure_reservation_capacity();

create or replace function public.set_reservation_cancel_metadata()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and coalesce(old.status, '') <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_cancel_metadata_before_update on public.reservations;
create trigger reservations_cancel_metadata_before_update
before update of status on public.reservations
for each row execute function public.set_reservation_cancel_metadata();

alter table public.stores enable row level security;
alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.line_users enable row level security;
alter table public.admin_users enable row level security;
alter table public.menus enable row level security;
alter table public.reservation_slots enable row level security;
alter table public.reservations enable row level security;
alter table public.mail_logs enable row level security;

drop policy if exists "public read stores" on public.stores;
create policy "public read stores" on public.stores for select using (true);

drop policy if exists "public read active plans" on public.plans;
create policy "public read active plans" on public.plans for select using (is_active = true or public.is_admin());

drop policy if exists "public read active menus" on public.menus;
create policy "public read active menus" on public.menus for select using (is_active = true or public.is_admin());

drop policy if exists "public read reservation slots" on public.reservation_slots;
create policy "public read reservation slots" on public.reservation_slots for select using (true);

drop policy if exists "admins manage line users" on public.line_users;
create policy "admins manage line users" on public.line_users for all using (public.is_admin()) with check (public.is_admin());

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

drop policy if exists "members insert own mail logs" on public.mail_logs;
create policy "members insert own mail logs" on public.mail_logs for insert with check (
  exists (select 1 from public.reservations r where r.id = mail_logs.reservation_id and (r.member_id = auth.uid() or public.is_admin()))
);

drop policy if exists "admin read mail logs" on public.mail_logs;
create policy "admin read mail logs" on public.mail_logs for select using (public.is_admin());

insert into public.stores (name) values ('friends 行徳') on conflict (name) do nothing;

with store as (select id from public.stores where name = 'friends 行徳')
insert into public.menus (store_id, name, description, default_capacity)
select store.id, menu.name, menu.description, menu.capacity
from store, (values
  ('セミパーソナル','少人数トレーニング',5),
  ('イベント','イベント・ワークショップ',8)
) as menu(name, description, capacity)
where not exists (select 1 from public.menus m where m.store_id = store.id and m.name = menu.name);

insert into public.plans (name, weekly_limit, unlimited) values
  ('セミパーソナル週1',1,false),
  ('セミパーソナル週2',2,false),
  ('通い放題',null,true),
  ('その他',null,false)
on conflict (name) do nothing;
