-- Game-lab only hotfix: count only reservations whose 40-minute use time has not ended.
-- The service specification remains unchanged:
--   * Use time: 40 minutes
--   * Cleaning time: 10 minutes
--   * Occupancy block: 50 minutes
-- This script changes only the simultaneous reservation limit check.

create or replace function public.ensure_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  slot_capacity integer;
  slot_starts_at timestamptz;
  slot_is_open boolean;
  slot_jst timestamp;
  booking_deadline timestamptz;
  same_day_count integer;
  weekly_count integer;
  active_future_count integer;
  max_active_reservations integer := 2;
  plan_weekly_limit integer;
  plan_unlimited boolean;
  plan_is_active boolean;
  week_start_jst timestamp;
  week_end_jst timestamp;
begin
  if new.status <> 'booked' then
    return new;
  end if;

  if new.member_id is null then
    raise exception 'ログイン情報が確認できません';
  end if;

  select capacity, starts_at, is_open
  into slot_capacity, slot_starts_at, slot_is_open
  from public.reservation_slots
  where id::text = new.reservation_slot_id::text
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

  slot_jst := slot_starts_at at time zone 'Asia/Tokyo';
  booking_deadline := ((slot_jst::date - interval '1 day') + time '22:00') at time zone 'Asia/Tokyo';

  if now() >= booking_deadline then
    raise exception 'この枠の予約受付は終了しました。予約は前日22:00までです。';
  end if;

  select count(*) into current_count
  from public.reservations r
  where r.reservation_slot_id::text = new.reservation_slot_id::text
    and r.status = 'booked'
    and r.id <> coalesce(new.id, gen_random_uuid());

  if current_count >= slot_capacity then
    raise exception '予約枠の定員を超えています';
  end if;

  select count(*) into same_day_count
  from public.reservations r
  join public.reservation_slots s on s.id::text = r.reservation_slot_id::text
  where r.member_id = new.member_id
    and r.status = 'booked'
    and r.id <> coalesce(new.id, gen_random_uuid())
    and (s.starts_at at time zone 'Asia/Tokyo')::date = slot_jst::date;

  if same_day_count > 0 then
    raise exception '同じ日に予約できるのは1枠までです。予約一覧をご確認ください。';
  end if;

  select count(*) into active_future_count
  from public.reservations r
  join public.reservation_slots s on s.id::text = r.reservation_slot_id::text
  where r.member_id = new.member_id
    and r.status = 'booked'
    and r.id <> coalesce(new.id, gen_random_uuid())
    and s.starts_at + interval '40 minutes' > now();

  if active_future_count >= max_active_reservations then
    raise exception '同時に保持できる予約は最大%枠までです。予約一覧からキャンセル後に予約してください。', max_active_reservations;
  end if;

  select p.weekly_limit, coalesce(p.unlimited, false), coalesce(p.is_active, true)
  into plan_weekly_limit, plan_unlimited, plan_is_active
  from public.members m
  left join public.plans p on p.id = m.plan_id
  where m.id = new.member_id;

  if plan_is_active is false then
    raise exception '現在のプランは無効です。予約をご希望の場合はスタッフにご連絡ください。';
  end if;

  if plan_unlimited is not true and plan_weekly_limit is not null then
    week_start_jst := date_trunc('week', slot_jst);
    week_end_jst := week_start_jst + interval '7 days';

    select count(*) into weekly_count
    from public.reservations r
    join public.reservation_slots s on s.id::text = r.reservation_slot_id::text
    where r.member_id = new.member_id
      and r.status = 'booked'
      and r.id <> coalesce(new.id, gen_random_uuid())
      and (s.starts_at at time zone 'Asia/Tokyo') >= week_start_jst
      and (s.starts_at at time zone 'Asia/Tokyo') < week_end_jst;

    if weekly_count >= plan_weekly_limit then
      raise exception '現在のプランでは、この週の予約上限に達しています。';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_capacity_guard on public.reservations;

create trigger reservations_capacity_guard
before insert or update of status, reservation_slot_id, member_id on public.reservations
for each row execute function public.ensure_reservation_capacity();
