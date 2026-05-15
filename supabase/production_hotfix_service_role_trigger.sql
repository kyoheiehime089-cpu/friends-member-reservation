-- Hotfix for production_minimum_launch.sql applied before 2026-05-15 evening.
-- Purpose: allow the server-side reservation API to use SUPABASE_SERVICE_ROLE_KEY safely.
-- Safe rules: no drop table, no truncate, no delete from, no existing reservation/member deletion.

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
  -- Browser/user inserts have auth.uid(). Server API inserts with service_role may not.
  -- In service_role context, trust the member_id / created_by that the API has already set
  -- after verifying the user's access token.
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
