-- LINE webhook users captured from the official account.
-- Run this after the base schema in Supabase SQL editor.

create table if not exists public.line_users (
  line_user_id text primary key,
  display_name text,
  member_status text not null default 'guest' check (member_status in ('guest','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.line_users enable row level security;

drop policy if exists "admins manage line users" on public.line_users;
create policy "admins manage line users"
on public.line_users
for all
using (public.is_admin())
with check (public.is_admin());
