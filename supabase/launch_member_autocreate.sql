-- Auto-create a members row before reservation insert when the logged-in user does not exist in members.
-- Safe rules: no drop table, no truncate, no existing member/reservation deletion.

create or replace function public.ensure_reservation_member()
returns trigger language plpgsql security definer set search_path=public as $$
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
