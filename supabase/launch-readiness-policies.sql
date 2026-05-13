-- Safe, re-runnable policies needed for launch-readiness testing.
-- Run in Supabase SQL Editor after supabase/schema.sql.

alter table public.mail_logs enable row level security;

drop policy if exists "members create own mail logs" on public.mail_logs;
create policy "members create own mail logs"
on public.mail_logs
for insert
to authenticated
with check (true);

drop policy if exists "members read own mail logs" on public.mail_logs;
create policy "members read own mail logs"
on public.mail_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.reservations r
    where r.id = mail_logs.reservation_id
      and r.member_id = auth.uid()
  )
  or public.is_admin()
);

-- Keep the booking-count RPC compatible with browser string slot IDs.
drop function if exists public.get_slot_booking_counts(uuid[]);
create or replace function public.get_slot_booking_counts(slot_ids text[])
returns table (reservation_slot_id text, booked_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.reservation_slot_id::text, count(*)::bigint as booked_count
  from public.reservations r
  where r.reservation_slot_id::text = any(slot_ids)
    and r.status = 'booked'
  group by r.reservation_slot_id::text;
$$;

grant execute on function public.get_slot_booking_counts(text[]) to anon, authenticated;
