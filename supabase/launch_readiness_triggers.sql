-- Extra safe triggers and policies for production launch. No drop table, no truncate, no data deletion.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.admin_users where id=auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.ensure_reservation_capacity()
returns trigger language plpgsql security definer set search_path=public as $$
declare current_count integer; slot_capacity integer; slot_starts_at timestamptz; slot_is_open boolean;
begin
  if new.status <> 'booked' then return new; end if;
  select capacity, starts_at, is_open into slot_capacity, slot_starts_at, slot_is_open
  from public.reservation_slots where id = new.reservation_slot_id for update;
  if slot_capacity is null then raise exception '予約枠が見つかりません'; end if;
  if slot_is_open is not true then raise exception 'この予約枠は受付停止中です'; end if;
  if slot_starts_at <= now() then raise exception '開始済み、または過去の予約枠は予約できません'; end if;
  select count(*) into current_count from public.reservations
  where reservation_slot_id = new.reservation_slot_id and status = 'booked' and id <> coalesce(new.id, gen_random_uuid());
  if current_count >= slot_capacity then raise exception '予約枠の定員を超えています'; end if;
  return new;
end; $$;

drop trigger if exists reservations_capacity_guard on public.reservations;
create trigger reservations_capacity_guard before insert or update of status, reservation_slot_id, member_id on public.reservations
for each row execute function public.ensure_reservation_capacity();

create or replace function public.set_reservation_cancel_metadata()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='cancelled' and coalesce(old.status,'') <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists reservations_cancel_metadata_before_update on public.reservations;
create trigger reservations_cancel_metadata_before_update before update of status on public.reservations
for each row execute function public.set_reservation_cancel_metadata();

alter table public.reservations enable row level security;
alter table public.members enable row level security;
alter table public.reservation_slots enable row level security;
alter table public.mail_logs enable row level security;

drop policy if exists "public read reservation slots" on public.reservation_slots;
create policy "public read reservation slots" on public.reservation_slots for select using (true);

drop policy if exists "members read own reservations" on public.reservations;
create policy "members read own reservations" on public.reservations for select using (member_id=auth.uid() or public.is_admin());

drop policy if exists "members create own reservations" on public.reservations;
create policy "members create own reservations" on public.reservations for insert with check (member_id=auth.uid() or public.is_admin());

drop policy if exists "members cancel own reservations" on public.reservations;
create policy "members cancel own reservations" on public.reservations for update using (member_id=auth.uid() or public.is_admin()) with check (member_id=auth.uid() or public.is_admin());

drop policy if exists "members read own profile" on public.members;
create policy "members read own profile" on public.members for select using (id=auth.uid() or public.is_admin());
