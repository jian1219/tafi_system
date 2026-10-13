create extension if not exists pgcrypto with schema extensions;

create table if not exists public.tafi_admin (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tafi_admin_email_lower_idx
  on public.tafi_admin (lower(email));

alter table public.tafi_admin enable row level security;
revoke all on table public.tafi_admin from public, anon, authenticated;

create table if not exists public.tafi_admin_session (
  session_token uuid primary key default gen_random_uuid(),
  tafi_admin_id uuid not null references public.tafi_admin(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

alter table public.tafi_admin_session enable row level security;
revoke all on table public.tafi_admin_session from public, anon, authenticated;

create or replace function public.super_admin_list_tafi_admins(
  p_super_admin_email text,
  p_super_admin_password text
)
returns table (
  admin_id uuid,
  admin_name text,
  admin_email text,
  created_at timestamptz
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
  select ta.id, ta.name, ta.email, ta.created_at
  from public.tafi_admin as ta
  order by ta.created_at desc;
end;
$$;

create or replace function public.super_admin_create_tafi_admin(
  p_super_admin_email text,
  p_super_admin_password text,
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
  new_admin_id uuid;
begin
  if not exists (
    select 1
    from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  if nullif(trim(p_admin_name), '') is null
    or nullif(trim(p_admin_email), '') is null
    or nullif(p_admin_password, '') is null then
    raise exception 'TAFI Admin name, email, and password are required';
  end if;

  if length(p_admin_password) < 8 then
    raise exception 'TAFI Admin password must be at least 8 characters';
  end if;

  if exists (select 1 from public.tafi_admin where lower(email) = lower(trim(p_admin_email))) then
    raise exception 'A TAFI Admin with this email already exists';
  end if;

  insert into public.tafi_admin (name, email, password_hash)
  values (
    trim(p_admin_name),
    lower(trim(p_admin_email)),
    extensions.crypt(p_admin_password, extensions.gen_salt('bf'))
  )
  returning id into new_admin_id;

  return new_admin_id;
end;
$$;

drop function if exists public.tafi_admin_login(text, text);

create function public.tafi_admin_login(
  p_email text,
  p_password text
)
returns table (
  session_token uuid,
  admin_id uuid,
  admin_name text,
  admin_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_account public.tafi_admin%rowtype;
  new_session_token uuid;
begin
  select ta.* into admin_account
  from public.tafi_admin as ta
  where lower(ta.email) = lower(trim(p_email))
    and ta.password_hash = extensions.crypt(p_password, ta.password_hash)
  limit 1;

  if not found then
    return;
  end if;

  insert into public.tafi_admin_session as created_session (tafi_admin_id)
  values (admin_account.id)
  returning created_session.session_token into new_session_token;

  return query select new_session_token, admin_account.id, admin_account.name, admin_account.email;
end;
$$;

create or replace function public.tafi_admin_list_branches(p_session_token uuid)
returns table (
  branch_id uuid,
  branch_name text,
  branch_location text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  return query
  select b.id, b.name, b.location
  from public.branch as b
  order by b.name;
end;
$$;

drop function if exists public.tafi_admin_list_employees(uuid);

create function public.tafi_admin_list_employees(p_session_token uuid)
returns table (
  employee_id uuid,
  branch_id uuid,
  branch_name text,
  employee_code text,
  employee_name text,
  employee_position text,
  employment_status text,
  email text,
  phone text,
  address text,
  gender text,
  birthday date,
  tin_number text,
  sss_number text,
  pagibig_number text,
  philhealth_number text,
  employment_classification text,
  daily_rate numeric,
  hire_date date,
  probationary_start_date date,
  regular_start_date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  return query
  select e.id, e.branch_id, b.name, e.employee_code, e.name, e.position,
    e.employment_status, e.email, e.phone, e.address, e.gender, e.birthday,
    e.tin_number, e.sss_number, e.pagibig_number, e.philhealth_number,
    e.employment_classification, e.daily_rate, e.hire_date,
    e.probationary_start_date, e.regular_start_date
  from public.employee as e
  join public.branch as b on b.id = e.branch_id
  order by b.name, e.name;
end;
$$;

create or replace function public.tafi_admin_logout(p_session_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.tafi_admin_session
  where session_token = p_session_token;
$$;

revoke all on function public.tafi_admin_list_branches(uuid) from public;
revoke all on function public.tafi_admin_list_employees(uuid) from public;
revoke all on function public.tafi_admin_logout(uuid) from public;
grant execute on function public.tafi_admin_list_branches(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_employees(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_logout(uuid) to anon, authenticated;

revoke all on function public.tafi_admin_login(text, text) from public;
grant execute on function public.tafi_admin_login(text, text) to anon, authenticated;

revoke all on function public.super_admin_list_tafi_admins(text, text) from public;
revoke all on function public.super_admin_create_tafi_admin(text, text, text, text, text) from public;
grant execute on function public.super_admin_list_tafi_admins(text, text) to anon, authenticated;
grant execute on function public.super_admin_create_tafi_admin(text, text, text, text, text) to anon, authenticated;
