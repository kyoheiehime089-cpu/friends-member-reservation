-- 本番 Supabase 用：将来の木曜セミパーソナル枠を削除・受付停止するSQL
--
-- 注意：ファイル全体を最初からまとめて実行しないでください。
-- 1) まず「事前確認 SELECT」だけを実行します。
-- 2) 対象が将来の木曜セミパーソナル枠だけであることを確認します。
-- 3) 問題なければ DELETE / UPDATE を実行します。
-- 4) 最後に「事後確認 SELECT」で対象が残っていないことを確認します。
--
-- 予約が入っていない枠：削除
-- 予約が入っている枠：履歴を壊さないため is_open = false にして受付停止

-- 1) 事前確認 SELECT：最初はここだけ実行してください。
with target_slots as (
  select
    rs.id,
    rs.menu_id,
    m.name as menu_name,
    rs.starts_at,
    rs.ends_at,
    rs.is_open,
    count(r.id) filter (where r.status = 'booked') as booked_count
  from public.reservation_slots rs
  join public.menus m on m.id = rs.menu_id
  left join public.reservations r on r.reservation_slot_id = rs.id
  where m.name ilike '%セミパーソナル%'
    and rs.starts_at >= now()
    and extract(dow from rs.starts_at at time zone 'Asia/Tokyo') = 4
  group by rs.id, rs.menu_id, m.name, rs.starts_at, rs.ends_at, rs.is_open
)
select *
from target_slots
order by starts_at;

-- 2) 予約なしの将来木曜セミパーソナル枠を削除します。
with target_slots as (
  select
    rs.id,
    count(r.id) filter (where r.status = 'booked') as booked_count
  from public.reservation_slots rs
  join public.menus m on m.id = rs.menu_id
  left join public.reservations r on r.reservation_slot_id = rs.id
  where m.name ilike '%セミパーソナル%'
    and rs.starts_at >= now()
    and extract(dow from rs.starts_at at time zone 'Asia/Tokyo') = 4
  group by rs.id
), empty_slots as (
  select id
  from target_slots
  where booked_count = 0
)
delete from public.reservation_slots rs
using empty_slots es
where rs.id = es.id;

-- 3) 予約済みの将来木曜セミパーソナル枠は履歴保持のため受付停止にします。
with target_slots as (
  select
    rs.id,
    count(r.id) filter (where r.status = 'booked') as booked_count
  from public.reservation_slots rs
  join public.menus m on m.id = rs.menu_id
  left join public.reservations r on r.reservation_slot_id = rs.id
  where m.name ilike '%セミパーソナル%'
    and rs.starts_at >= now()
    and extract(dow from rs.starts_at at time zone 'Asia/Tokyo') = 4
  group by rs.id
), booked_slots as (
  select id
  from target_slots
  where booked_count > 0
)
update public.reservation_slots rs
set is_open = false,
    updated_at = now()
from booked_slots bs
where rs.id = bs.id;

-- 4) 事後確認 SELECT：将来の木曜セミパーソナル枠が残っていないか確認します。
with remaining_slots as (
  select
    rs.id,
    rs.menu_id,
    m.name as menu_name,
    rs.starts_at,
    rs.ends_at,
    rs.is_open,
    count(r.id) filter (where r.status = 'booked') as booked_count
  from public.reservation_slots rs
  join public.menus m on m.id = rs.menu_id
  left join public.reservations r on r.reservation_slot_id = rs.id
  where m.name ilike '%セミパーソナル%'
    and rs.starts_at >= now()
    and extract(dow from rs.starts_at at time zone 'Asia/Tokyo') = 4
  group by rs.id, rs.menu_id, m.name, rs.starts_at, rs.ends_at, rs.is_open
)
select *
from remaining_slots
order by starts_at;
