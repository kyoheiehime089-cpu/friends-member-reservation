-- Phase2: reservation_slots duplicate cleanup (do not delete rows)

-- 1) Duplicate check by menu_id + starts_at + ends_at + capacity
select
  menu_id,
  starts_at,
  ends_at,
  capacity,
  count(*) as slot_count
from reservation_slots
where menu_id is not null
group by menu_id, starts_at, ends_at, capacity
having count(*) > 1
order by starts_at, menu_id;

-- 2) Close duplicate rows that have no reservation attached.
-- keep the oldest row per (menu_id, starts_at, ends_at, capacity),
-- keep rows with booked reservations, close only empty duplicates.
with ranked as (
  select
    rs.id,
    rs.menu_id,
    rs.starts_at,
    rs.ends_at,
    rs.capacity,
    rs.is_open,
    rs.created_at,
    exists (
      select 1
      from reservations r
      where r.reservation_slot_id = rs.id::text
        and coalesce(r.status, 'booked') = 'booked'
    ) as has_booked,
    row_number() over (
      partition by rs.menu_id, rs.starts_at, rs.ends_at, rs.capacity
      order by
        case when exists (
          select 1 from reservations r2
          where r2.reservation_slot_id = rs.id::text
            and coalesce(r2.status, 'booked') = 'booked'
        ) then 0 else 1 end,
        rs.created_at asc,
        rs.id asc
    ) as rn
  from reservation_slots rs
  where rs.menu_id is not null
), to_close as (
  select id
  from ranked
  where rn > 1
    and has_booked = false
    and is_open = true
)
update reservation_slots rs
set is_open = false,
    updated_at = now()
from to_close
where rs.id = to_close.id;

-- 3) Verify open duplicates are zero
select
  menu_id,
  starts_at,
  count(*) as open_duplicate_count
from reservation_slots
where menu_id is not null
  and is_open = true
group by menu_id, starts_at
having count(*) > 1
order by starts_at, menu_id;
