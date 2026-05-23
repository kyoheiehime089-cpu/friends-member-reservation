-- 同一会員 + 同一メニュー + 同一開始時刻で booked が残っていないか確認するSQL
-- :member_id, :menu_id, :starts_at は実際の値に置き換えて実行してください。

select
  r.id as reservation_id,
  r.status,
  r.member_id,
  r.reservation_slot_id,
  rs.menu_id,
  rs.starts_at,
  r.created_at,
  r.cancelled_at,
  r.cancelled_by
from reservations r
join reservation_slots rs on rs.id = r.reservation_slot_id
where r.member_id = :member_id
  and rs.menu_id = :menu_id
  and rs.starts_at = :starts_at
order by r.created_at desc;

-- booked 件数確認
select count(*) as booked_count
from reservations r
join reservation_slots rs on rs.id = r.reservation_slot_id
where r.member_id = :member_id
  and rs.menu_id = :menu_id
  and rs.starts_at = :starts_at
  and r.status = 'booked';
