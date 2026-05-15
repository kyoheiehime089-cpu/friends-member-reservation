-- Safe SQL to harden production reservation flow. No table drops, no truncate, no data deletion.
create extension if not exists "pgcrypto";

alter table public.reservations add column if not exists member_id uuid;
alter table public.reservations add column if not exists reservation_slot_id uuid;
alter table public.reservations add column if not exists created_by uuid;
alter table public.reservations add column if not exists cancelled_by uuid;
alter table public.reservations add column if not exists cancelled_at timestamptz;
alter table public.reservations add column if not exists created_at timestamptz default now();
alter table public.reservations alter column status set default 'booked';
update public.reservations set status='booked' where status='confirmed';

alter table public.mail_logs add column if not exists reservation_id uuid;
alter table public.mail_logs add column if not exists to_email text;
alter table public.mail_logs add column if not exists subject text;
alter table public.mail_logs add column if not exists status text default 'skipped';
alter table public.mail_logs add column if not exists provider_response jsonb;
alter table public.mail_logs add column if not exists created_at timestamptz default now();

create or replace function public.get_slot_booking_counts(slot_ids uuid[])
returns table (reservation_slot_id uuid, booked_count bigint)
language sql stable security definer set search_path=public as $$
  select r.reservation_slot_id, count(*)::bigint
  from public.reservations r
  where r.reservation_slot_id=any(slot_ids) and r.status='booked'
  group by r.reservation_slot_id;
$$;

grant execute on function public.get_slot_booking_counts(uuid[]) to anon, authenticated;
