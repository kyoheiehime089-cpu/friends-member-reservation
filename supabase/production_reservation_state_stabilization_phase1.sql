-- Phase1: reservation state stabilization (idempotent)

alter table public.reservations
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;

-- pre-check: duplicated booked rows by slot/member
select reservation_slot_id, member_id, count(*) as booked_count
from public.reservations
where status = 'booked' and reservation_slot_id is not null and member_id is not null
group by reservation_slot_id, member_id
having count(*) > 1
order by booked_count desc;

-- repair: keep latest booked, mark older booked as cancelled
with ranked as (
  select id,
         row_number() over (
           partition by reservation_slot_id, member_id
           order by created_at desc nulls last, id desc
         ) as rn
  from public.reservations
  where status = 'booked'
    and reservation_slot_id is not null
    and member_id is not null
)
update public.reservations r
set status = 'cancelled',
    cancelled_at = coalesce(r.cancelled_at, now())
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

create index if not exists reservations_reservation_slot_id_idx on public.reservations(reservation_slot_id);
create index if not exists reservations_member_id_idx on public.reservations(member_id);
create index if not exists reservations_status_idx on public.reservations(status);
create index if not exists reservations_created_at_idx on public.reservations(created_at desc);

create unique index if not exists reservations_slot_member_booked_uniq
  on public.reservations (reservation_slot_id, member_id)
  where status = 'booked' and reservation_slot_id is not null and member_id is not null;

-- post-check: should be zero
select reservation_slot_id, member_id, count(*) as booked_count
from public.reservations
where status = 'booked' and reservation_slot_id is not null and member_id is not null
group by reservation_slot_id, member_id
having count(*) > 1;
