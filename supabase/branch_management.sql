create extension if not exists pgcrypto with schema extensions;

create table if not exists public.branch (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.branch_admin (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references public.branch(id) on delete cascade,
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.branch_admin_session (
  session_token uuid primary key,
  branch_admin_id uuid not null references public.branch_admin(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now()
);

create index if not exists branch_admin_session_expiry_idx
  on public.branch_admin_session (expires_at);

create unique index if not exists branch_admin_email_lower_idx
  on public.branch_admin (lower(email));

alter table public.branch enable row level security;
alter table public.branch_admin enable row level security;
alter table public.branch_admin_session enable row level security;
revoke all on table public.branch from public, anon, authenticated;
revoke all on table public.branch_admin from public, anon, authenticated;
revoke all on table public.branch_admin_session from public, anon, authenticated;

create or replace function public.super_admin_list_branches(
  p_super_admin_email text,
  p_super_admin_password text
)
returns table (
  branch_id uuid,
  branch_name text,
  branch_location text,
  created_at timestamptz,
  admin_name text,
  admin_email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  return query
  select b.id, b.name, b.location, b.created_at, ba.name, ba.email
  from public.branch as b
  left join public.branch_admin as ba on ba.branch_id = b.id
  order by b.created_at desc;
end;
$$;

create or replace function public.super_admin_create_branch(
  p_super_admin_email text,
  p_super_admin_password text,
  p_branch_name text,
  p_branch_location text,
  p_admin_name text,
  p_admin_email text,
  p_admin_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_branch_id uuid;
begin
  if not exists (
    select 1
    from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  if nullif(trim(p_branch_name), '') is null
    or nullif(trim(p_admin_name), '') is null
    or nullif(trim(p_admin_email), '') is null
    or nullif(p_admin_password, '') is null then
    raise exception 'Branch name, branch admin name, email, and password are required';
  end if;

  if length(p_admin_password) < 8 then
    raise exception 'Branch admin password must be at least 8 characters';
  end if;

  insert into public.branch (name, location)
  values (trim(p_branch_name), coalesce(trim(p_branch_location), ''))
  returning id into new_branch_id;

  insert into public.branch_admin (branch_id, name, email, password_hash)
  values (
    new_branch_id,
    trim(p_admin_name),
    lower(trim(p_admin_email)),
    extensions.crypt(p_admin_password, extensions.gen_salt('bf'))
  );

  return new_branch_id;
end;
$$;

drop function if exists public.branch_admin_login(text, text);

create function public.branch_admin_login(p_email text, p_password text)
returns table (
  admin_id uuid,
  admin_name text,
  branch_id uuid,
  branch_name text,
  branch_location text,
  admin_email text,
  session_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_session_token uuid;
begin
  select ba.id as admin_id, ba.name as admin_name, b.id as branch_id,
    b.name as branch_name, b.location as branch_location, ba.email as admin_email
  into v_admin
  from public.branch_admin as ba
  join public.branch as b on b.id = ba.branch_id
  where lower(ba.email) = lower(trim(p_email))
    and ba.password_hash = extensions.crypt(p_password, ba.password_hash)
  limit 1;

  if not found then
    return;
  end if;

  delete from public.branch_admin_session where expires_at <= now();

  v_session_token := gen_random_uuid();
  insert into public.branch_admin_session (session_token, branch_admin_id)
  values (v_session_token, v_admin.admin_id);

  return query
  select v_admin.admin_id, v_admin.admin_name, v_admin.branch_id,
    v_admin.branch_name, v_admin.branch_location, v_admin.admin_email,
    v_session_token;
end;
$$;

revoke all on function public.super_admin_list_branches(text, text) from public;
revoke all on function public.super_admin_create_branch(text, text, text, text, text, text, text) from public;
revoke all on function public.branch_admin_login(text, text) from public;
grant execute on function public.super_admin_list_branches(text, text) to anon, authenticated;
grant execute on function public.super_admin_create_branch(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.branch_admin_login(text, text) to anon, authenticated;