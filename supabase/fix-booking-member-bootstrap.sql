-- Safe booking fix for users who exist in Supabase Auth but not yet in public.members.
-- This does not delete or truncate any existing data.
-- It only adds a trigger that creates a minimal member row when a logged-in user books for the first time.

create extension if not exists "pgcrypto";

create or replace function public.ensure_member_exists_for_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_store_id uuid;
  auth_email text;
begin
  if new.member_id is null then
    return new;
  end if;

  if exists (select 1 from public.members where id = new.member_id) then
    return new;
  end if;

  select id into default_store_id
  from public.stores
  where name = 'friends 行徳'
  limit 1;

  auth_email := coalesce(auth.jwt() ->> 'email', new.member_id::text || '@temporary.local');

  insert into public.members (id, store_id, full_name, email, status)
  values (
    new.member_id,
    default_store_id,
    coalesce(nullif(auth.jwt() ->> 'name', ''), auth_email, 'テスト会員'),
    auth_email,
    '有効'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists reservations_member_bootstrap on public.reservations;
create trigger reservations_member_bootstrap
before insert on public.reservations
for each row
execute function public.ensure_member_exists_for_reservation();

-- Make sure members can read their own profile after the bootstrap creates it.
drop policy if exists "members read own profile" on public.members;
create policy "members read own profile"
on public.members
for select
to authenticated
using (id = auth.uid() or public.is_admin());

-- Keep the existing reservation policies explicit and re-runnable.
drop policy if exists "members read own reservations" on public.reservations;
create policy "members read own reservations"
on public.reservations
for select
to authenticated
using (member_id = auth.uid() or public.is_admin());

drop policy if exists "members create own reservations" on public.reservations;
create policy "members create own reservations"
on public.reservations
for insert
to authenticated
with check (member_id = auth.uid() or public.is_admin());

drop policy if exists "members cancel own reservations" on public.reservations;
create policy "members cancel own reservations"
on public.reservations
for update
to authenticated
using (member_id = auth.uid() or public.is_admin())
with check (member_id = auth.uid() or public.is_admin());
