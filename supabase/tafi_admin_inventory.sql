begin;

-- Run after accountant_management.sql and tafi_admin_management.sql.
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
  else
    raise exception 'Inventory table not found. Run accountant_management.sql first.';
  end if;
end;
$$;

alter table public.inventory_information
  alter column created_by_accountant_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict;

alter table public.inventory_information enable row level security;
revoke all on table public.inventory_information from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'accountant_inventory_information_one_creator'
      and conrelid = 'public.inventory_information'::regclass
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_information_one_creator'
      and conrelid = 'public.inventory_information'::regclass
  ) then
    alter table public.inventory_information
      rename constraint accountant_inventory_information_one_creator
      to inventory_information_one_creator;
  elsif exists (
    select 1
    from pg_constraint
    where conname = 'tafi_inventory_information_one_creator'
      and conrelid = 'public.inventory_information'::regclass
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_information_one_creator'
      and conrelid = 'public.inventory_information'::regclass
  ) then
    alter table public.inventory_information
      rename constraint tafi_inventory_information_one_creator
      to inventory_information_one_creator;
  elsif exists (
    select 1
    from pg_constraint
    where conname = 'tafi_invintory_information_one_creator'
      and conrelid = 'public.inventory_information'::regclass
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_information_one_creator'
      and conrelid = 'public.inventory_information'::regclass
  ) then
    alter table public.inventory_information
      rename constraint tafi_invintory_information_one_creator
      to inventory_information_one_creator;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_information_one_creator'
      and conrelid = 'public.inventory_information'::regclass
  ) then
    alter table public.inventory_information
      add constraint inventory_information_one_creator
      check (
        (created_by_accountant_id is not null)
        <> (created_by_tafi_admin_id is not null)
      );
  end if;
end;
$$;

create or replace function public.tafi_admin_list_inventory_information(
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
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
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

create or replace function public.tafi_admin_create_inventory_information(
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
  v_admin_id uuid;
  v_inventory_id uuid;
begin
  select admin_session.tafi_admin_id
  into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
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
    created_by_accountant_id,
    created_by_tafi_admin_id
  )
  values (
    trim(p_stock_no),
    trim(p_category),
    trim(p_item_description),
    trim(p_unit_of_measure),
    trim(p_supplier),
    null,
    v_admin_id
  )
  returning id into v_inventory_id;

  return v_inventory_id;
end;
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

revoke all on function public.tafi_admin_list_inventory_information(uuid) from public;
revoke all on function public.tafi_admin_create_inventory_information(uuid, text, text, text, text, text) from public;
revoke all on function public.accountant_list_inventory_information(uuid) from public;
revoke all on function public.accountant_create_inventory_information(uuid, text, text, text, text, text) from public;

grant execute on function public.tafi_admin_list_inventory_information(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_create_inventory_information(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.accountant_list_inventory_information(uuid) to anon, authenticated;
grant execute on function public.accountant_create_inventory_information(uuid, text, text, text, text, text) to anon, authenticated;

commit;
