-- Run after super_admin_login.sql and tafi_admin_management.sql.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.accountant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists accountant_email_lower_idx
  on public.accountant (lower(email));

alter table public.accountant enable row level security;
revoke all on table public.accountant from public, anon, authenticated;

create table if not exists public.accountant_session (
  session_token uuid primary key default gen_random_uuid(),
  accountant_id uuid not null references public.accountant(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

alter table public.accountant_session enable row level security;
revoke all on table public.accountant_session from public, anon, authenticated;

do $$
begin
  if to_regclass('public.inventory_information') is not null then
    if to_regclass('public.accountant_inventory_information') is not null
      or to_regclass('public.tafi_inventory_information') is not null
      or to_regclass('public.tafi_invintory_information') is not null then
      raise exception 'Multiple inventory tables exist. Resolve or merge their records before renaming.';
    end if;
  elsif to_regclass('public.accountant_inventory_information') is not null then
    if to_regclass('public.tafi_inventory_information') is not null
      or to_regclass('public.tafi_invintory_information') is not null then
      raise exception 'Multiple inventory tables exist. Resolve or merge their records before renaming.';
    end if;
    alter table public.accountant_inventory_information
      rename to inventory_information;
  elsif to_regclass('public.tafi_inventory_information') is not null then
    if to_regclass('public.tafi_invintory_information') is not null then
      raise exception 'Multiple inventory tables exist. Resolve or merge their records before renaming.';
    end if;
    alter table public.tafi_inventory_information
      rename to inventory_information;
  elsif to_regclass('public.tafi_invintory_information') is not null then
    alter table public.tafi_invintory_information
      rename to inventory_information;
  end if;
end;
$$;

create table if not exists public.inventory_information (
  id uuid primary key default gen_random_uuid(),
  stock_no text not null,
  category text not null,
  item_description text not null,
  unit_of_measure text not null,
  supplier text not null,
  created_by_accountant_id uuid not null
    references public.accountant(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.inventory_information enable row level security;
revoke all on table public.inventory_information from public, anon, authenticated;

create or replace function public.super_admin_list_accountants(
  p_super_admin_email text,
  p_super_admin_password text
)
returns table (
  accountant_id uuid,
  accountant_name text,
  accountant_email text,
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
  select accountant.id, accountant.name, accountant.email, accountant.created_at
  from public.accountant
  order by accountant.created_at desc;
end;
$$;

create or replace function public.super_admin_create_accountant(
  p_super_admin_email text,
  p_super_admin_password text,
  p_accountant_name text,
  p_accountant_email text,
  p_accountant_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_accountant_id uuid;
begin
  if not exists (
    select 1
    from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  if nullif(trim(p_accountant_name), '') is null
    or nullif(trim(p_accountant_email), '') is null
    or nullif(p_accountant_password, '') is null then
    raise exception 'Accountant name, email, and password are required';
  end if;

  if length(p_accountant_password) < 8 then
    raise exception 'Accountant password must be at least 8 characters';
  end if;

  if exists (
    select 1
    from public.accountant
    where lower(email) = lower(trim(p_accountant_email))
  ) then
    raise exception 'An Accountant with this email already exists';
  end if;

  insert into public.accountant (name, email, password_hash)
  values (
    trim(p_accountant_name),
    lower(trim(p_accountant_email)),
    extensions.crypt(p_accountant_password, extensions.gen_salt('bf'))
  )
  returning id into new_accountant_id;

  return new_accountant_id;
end;
$$;

create or replace function public.accountant_login(
  p_email text,
  p_password text
)
returns table (
  session_token uuid,
  accountant_id uuid,
  accountant_name text,
  accountant_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  accountant_account public.accountant%rowtype;
  new_session_token uuid;
begin
  select account.* into accountant_account
  from public.accountant as account
  where lower(account.email) = lower(trim(p_email))
    and account.password_hash = extensions.crypt(p_password, account.password_hash)
  limit 1;

  if not found then
    return;
  end if;

  insert into public.accountant_session as created_session (accountant_id)
  values (accountant_account.id)
  returning created_session.session_token into new_session_token;

  return query
  select new_session_token, accountant_account.id, accountant_account.name, accountant_account.email;
end;
$$;

create or replace function public.accountant_logout(p_session_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.accountant_session
  where session_token = p_session_token;
$$;

create or replace function public.accountant_list_inventory_information(
  p_session_token uuid
)
returns table (
  inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  supplier text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select inventory.id,
         inventory.stock_no,
         inventory.category,
         inventory.item_description,
         inventory.unit_of_measure,
         inventory.supplier,
         inventory.created_at
  from public.inventory_information as inventory
  order by inventory.stock_no, inventory.created_at desc;
end;
$$;

create or replace function public.accountant_create_inventory_information(
  p_session_token uuid,
  p_stock_no text,
  p_category text,
  p_item_description text,
  p_unit_of_measure text,
  p_supplier text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  accountant_id uuid;
  inventory_id uuid;
begin
  select accountant_session.accountant_id
  into accountant_id
  from public.accountant_session as accountant_session
  where accountant_session.session_token = p_session_token
    and accountant_session.expires_at > now();

  if not found then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  if nullif(trim(p_stock_no), '') is null
    or nullif(trim(p_category), '') is null
    or nullif(trim(p_item_description), '') is null
    or nullif(trim(p_unit_of_measure), '') is null
    or nullif(trim(p_supplier), '') is null then
    raise exception 'Stock number, category, item description, unit of measure, and supplier are required';
  end if;

  insert into public.inventory_information (
    stock_no,
    category,
    item_description,
    unit_of_measure,
    supplier,
    created_by_accountant_id
  )
  values (
    trim(p_stock_no),
    trim(p_category),
    trim(p_item_description),
    trim(p_unit_of_measure),
    trim(p_supplier),
    accountant_id
  )
  returning id into inventory_id;

  return inventory_id;
end;
$$;

revoke all on function public.super_admin_list_accountants(text, text) from public;
revoke all on function public.super_admin_create_accountant(text, text, text, text, text) from public;
revoke all on function public.accountant_login(text, text) from public;
revoke all on function public.accountant_logout(uuid) from public;
revoke all on function public.accountant_list_inventory_information(uuid) from public;
revoke all on function public.accountant_create_inventory_information(uuid, text, text, text, text, text) from public;

grant execute on function public.super_admin_list_accountants(text, text) to anon, authenticated;
grant execute on function public.super_admin_create_accountant(text, text, text, text, text) to anon, authenticated;
grant execute on function public.accountant_login(text, text) to anon, authenticated;
grant execute on function public.accountant_logout(uuid) to anon, authenticated;
grant execute on function public.accountant_list_inventory_information(uuid) to anon, authenticated;
grant execute on function public.accountant_create_inventory_information(uuid, text, text, text, text, text) to anon, authenticated;
