-- Production hotfix: align reservations.reservation_slot_id with reservation_slots.id uuid type.
-- Safe rules: no drop table, no truncate, no delete from.
-- This raises an error and stops if any existing non-null reservation_slot_id cannot be cast to uuid.

create extension if not exists "pgcrypto";

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reservations'
      and column_name = 'reservation_slot_id'
      and data_type <> 'uuid'
  ) then
    if exists (
      select 1
      from public.reservations
      where reservation_slot_id is not null
        and reservation_slot_id::text <> ''
        and reservation_slot_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
      raise exception 'Cannot convert reservations.reservation_slot_id to uuid because invalid values exist.';
    end if;

    alter table public.reservations
      alter column reservation_slot_id type uuid
      using nullif(reservation_slot_id::text, '')::uuid;
  end if;
end $$;

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
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_name text;
  v_store_id uuid;
begin
  v_uid := coalesce(auth.uid(), new.member_id, new.created_by);

  if v_uid is null then
    raise exception 'ログイン情報が確認できません';
  end if;

  if auth.uid() is not null and not public.is_admin() then
    new.member_id := auth.uid();
  else
    new.member_id := coalesce(new.member_id, v_uid);
  end if;

  new.created_by := coalesce(new.created_by, v_uid);
  new.status := coalesce(nullif(new.status, ''), 'booked');

  select store_id into v_store_id
  from public.reservation_slots
  where id = new.reservation_slot_id;

  v_email := coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select nullif(email, '') from public.members where id = new.member_id limit 1),
    new.member_id::text || '@no-email.local'
  );

  v_name := coalesce(
    nullif(auth.jwt() ->> 'name', ''),
    nullif(auth.jwt() ->> 'full_name', ''),
    (select nullif(full_name, '') from public.members where id = new.member_id limit 1),
    v_email
  );

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
