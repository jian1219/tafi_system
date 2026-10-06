create extension if not exists pgcrypto with schema extensions;

create table if not exists public.super_admin (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.super_admin enable row level security;
revoke all on table public.super_admin from public, anon, authenticated;

insert into public.super_admin (name, email, password_hash)
values (
  'SuperAdmin',
  'SuperAdmin@tafi.com',
  extensions.crypt('superadmin123', extensions.gen_salt('bf'))
)
on conflict (email) do update
set name = excluded.name,
    password_hash = excluded.password_hash;

create or replace function public.super_admin_login(p_email text, p_password text)
returns table (user_id uuid, full_name text, user_email text)
language sql
security definer
set search_path = ''
as $$
  select account.id, account.name, account.email
  from public.super_admin as account
  where lower(account.email) = lower(trim(p_email))
    and account.password_hash = extensions.crypt(p_password, account.password_hash)
  limit 1;
$$;

revoke all on function public.super_admin_login(text, text) from public;
grant execute on function public.super_admin_login(text, text) to anon, authenticated;
