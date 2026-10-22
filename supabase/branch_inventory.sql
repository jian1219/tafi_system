-- Run after branch_management.sql, tafi_admin_management.sql, tafi_stock_inventory.sql, and accountant_management.sql.
begin;

create table if not exists public.branch_inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  available numeric(14, 3) not null default 0,
  created_at timestamptz not null default now(),
  unique (branch_id, stock_inventory_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'branch_inventory'
      and column_name = 'onhand'
  ) then
    alter table public.branch_inventory
      add column available_migration numeric(14, 3);

    update public.branch_inventory
    set available_migration = onhand - allocated;

    alter table public.branch_inventory drop column available;
    alter table public.branch_inventory drop column onhand;
    alter table public.branch_inventory drop column allocated;
    alter table public.branch_inventory
      rename column available_migration to available;
    alter table public.branch_inventory
      alter column available set default 0;
    alter table public.branch_inventory
      alter column available set not null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.branch_inventory'::regclass
      and conname = 'branch_inventory_available_nonnegative_check'
  ) then
    alter table public.branch_inventory
      add constraint branch_inventory_available_nonnegative_check
      check (available >= 0);
  end if;
end;
$$;

create index if not exists branch_inventory_branch_idx
  on public.branch_inventory (branch_id);

create table if not exists public.branch_inventory_daily_log (
  id uuid primary key default gen_random_uuid(),
  branch_inventory_id uuid not null
    references public.branch_inventory(id) on delete cascade,
  usage_date date not null,
  beginning_stock numeric(14, 3) not null check (beginning_stock >= 0),
  usage_quantity numeric(14, 3) not null default 0 check (usage_quantity >= 0),
  ending_stock numeric(14, 3)
    generated always as (beginning_stock - usage_quantity) stored,
  created_at timestamptz not null default now(),
  unique (branch_inventory_id, usage_date),
  check (usage_quantity <= beginning_stock)
);

alter table public.branch_inventory_daily_log
  drop column if exists opening_stock;

create index if not exists branch_inventory_daily_log_date_idx
  on public.branch_inventory_daily_log (branch_inventory_id, usage_date desc);

alter table public.branch_inventory enable row level security;
revoke all on table public.branch_inventory from public, anon, authenticated;
alter table public.branch_inventory_daily_log enable row level security;
revoke all on table public.branch_inventory_daily_log from public, anon, authenticated;

create or replace function public.branch_admin_list_tafi_stock_items(
  p_session_token uuid
)
returns table (
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  onhand numeric,
  available numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.branch_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         stock.onhand,
         stock.available
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  order by inventory.category, stock.stock_no;
end;
$$;

drop function if exists public.branch_admin_list_inventory(uuid);

create function public.branch_admin_list_inventory(
  p_session_token uuid
)
returns table (
  branch_inventory_id uuid,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select branch_stock.id,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         branch_stock.available,
         branch_stock.created_at
  from public.branch_inventory as branch_stock
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where branch_stock.branch_id = v_branch_id
  order by inventory.category, stock.stock_no;
end;
$$;

drop function if exists public.branch_admin_add_inventory_item(uuid, uuid, numeric);

create function public.branch_admin_add_inventory_item(
  p_session_token uuid,
  p_stock_inventory_id uuid,
  p_available numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_branch_inventory_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_stock_inventory_id is null then
    raise exception 'A TAFI stock item is required';
  end if;

  if p_available is null or p_available < 0 then
    raise exception 'Available quantity must be zero or greater';
  end if;

  insert into public.branch_inventory (branch_id, stock_inventory_id, available)
  values (v_branch_id, p_stock_inventory_id, p_available)
  returning id into v_branch_inventory_id;

  return v_branch_inventory_id;
end;
$$;

drop function if exists public.tafi_admin_list_branch_inventory(uuid);

create function public.tafi_admin_list_branch_inventory(
  p_session_token uuid
)
returns table (
  branch_inventory_id uuid,
  branch_name text,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric
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
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  return query
  select branch_stock.id,
         branch.name,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         branch_stock.available
  from public.branch_inventory as branch_stock
  join public.branch as branch
    on branch.id = branch_stock.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  order by branch.name, inventory.category, stock.stock_no;
end;
$$;

drop function if exists public.accountant_list_branch_stock_inventory(uuid);

create function public.accountant_list_branch_stock_inventory(
  p_session_token uuid
)
returns table (
  branch_inventory_id uuid,
  branch_name text,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric,
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
  select branch_stock.id,
         branch.name,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         branch_stock.available,
         branch_stock.created_at
  from public.branch_inventory as branch_stock
  join public.branch as branch
    on branch.id = branch_stock.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  order by branch.name, inventory.category, stock.stock_no;
end;
$$;

create or replace function public.accountant_list_inventory_branches(
  p_session_token uuid
)
returns table (
  branch_id uuid,
  branch_name text
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
  select branch.id, branch.name
  from public.branch as branch
  order by branch.name;
end;
$$;

drop function if exists public.branch_admin_list_inventory_daily_log(uuid);

create function public.branch_admin_list_inventory_daily_log(
  p_session_token uuid
)
returns table (
  usage_date date,
  branch_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  beginning_stock numeric,
  usage_quantity numeric,
  ending_stock numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_usage_date date := timezone('Asia/Manila', now())::date;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select v_usage_date,
         branch_stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         coalesce(today_log.beginning_stock, previous_log.ending_stock, branch_stock.available),
         coalesce(today_log.usage_quantity, 0),
         coalesce(
           today_log.ending_stock,
           today_log.beginning_stock,
           previous_log.ending_stock,
           branch_stock.available
         )
  from public.branch_inventory as branch_stock
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  left join lateral (
    select daily_log.ending_stock
    from public.branch_inventory_daily_log as daily_log
    where daily_log.branch_inventory_id = branch_stock.id
      and daily_log.usage_date < v_usage_date
    order by daily_log.usage_date desc
    limit 1
  ) as previous_log on true
  left join public.branch_inventory_daily_log as today_log
    on today_log.branch_inventory_id = branch_stock.id
    and today_log.usage_date = v_usage_date
  where branch_stock.branch_id = v_branch_id
  order by inventory.category, stock.stock_no;
end;
$$;

create or replace function public.branch_admin_list_inventory_usage_dates(
  p_session_token uuid
)
returns table (
  usage_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select distinct daily_log.usage_date
  from public.branch_inventory_daily_log as daily_log
  join public.branch_inventory as branch_stock
    on branch_stock.id = daily_log.branch_inventory_id
  where branch_stock.branch_id = v_branch_id
  order by daily_log.usage_date desc;
end;
$$;

create or replace function public.branch_admin_list_inventory_usage_history(
  p_session_token uuid,
  p_usage_date date
)
returns table (
  usage_date date,
  branch_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  beginning_stock numeric,
  usage_quantity numeric,
  ending_stock numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_usage_date is null or p_usage_date > timezone('Asia/Manila', now())::date then
    raise exception 'A valid usage history date is required';
  end if;

  return query
  select daily_log.usage_date,
         branch_stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         daily_log.beginning_stock,
         daily_log.usage_quantity,
         daily_log.ending_stock
  from public.branch_inventory_daily_log as daily_log
  join public.branch_inventory as branch_stock
    on branch_stock.id = daily_log.branch_inventory_id
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where branch_stock.branch_id = v_branch_id
    and daily_log.usage_date = p_usage_date
  order by inventory.category, stock.stock_no;
end;
$$;

create or replace function public.branch_admin_list_inventory_monthly_usage(
  p_session_token uuid,
  p_month_start date
)
returns table (
  month_start date,
  branch_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  usage_total numeric,
  days_recorded bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_month_start is null
    or p_month_start <> date_trunc('month', p_month_start::timestamp)::date
    or p_month_start > date_trunc('month', timezone('Asia/Manila', now()))::date then
    raise exception 'A valid current or past month is required';
  end if;

  return query
  select p_month_start,
         branch_stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         coalesce(sum(daily_log.usage_quantity), 0)::numeric,
         count(daily_log.id)::bigint
  from public.branch_inventory as branch_stock
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  left join public.branch_inventory_daily_log as daily_log
    on daily_log.branch_inventory_id = branch_stock.id
    and daily_log.usage_date >= p_month_start
    and daily_log.usage_date < (p_month_start + interval '1 month')::date
  where branch_stock.branch_id = v_branch_id
  group by branch_stock.id,
           stock.stock_no,
           inventory.category,
           stock.item_description,
           stock.unit_of_measure
  order by inventory.category, stock.stock_no;
end;
$$;

create or replace function public.accountant_list_branch_inventory_usage_history(
  p_session_token uuid,
  p_branch_id uuid,
  p_usage_date date
)
returns table (
  usage_date date,
  branch_id uuid,
  branch_name text,
  branch_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  beginning_stock numeric,
  usage_quantity numeric,
  ending_stock numeric
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

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  if p_usage_date is null or p_usage_date > timezone('Asia/Manila', now())::date then
    raise exception 'A valid usage history date is required';
  end if;

  return query
  select daily_log.usage_date,
         branch.id,
         branch.name,
         branch_stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         daily_log.beginning_stock,
         daily_log.usage_quantity,
         daily_log.ending_stock
  from public.branch_inventory_daily_log as daily_log
  join public.branch_inventory as branch_stock
    on branch_stock.id = daily_log.branch_inventory_id
  join public.branch as branch
    on branch.id = branch_stock.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where branch_stock.branch_id = p_branch_id
    and daily_log.usage_date = p_usage_date
  order by inventory.category, stock.stock_no;
end;
$$;

create or replace function public.accountant_list_branch_inventory_monthly_usage(
  p_session_token uuid,
  p_branch_id uuid,
  p_month_start date
)
returns table (
  month_start date,
  branch_id uuid,
  branch_name text,
  branch_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  usage_total numeric,
  days_recorded bigint
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

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  if p_month_start is null
    or p_month_start <> date_trunc('month', p_month_start::timestamp)::date
    or p_month_start > date_trunc('month', timezone('Asia/Manila', now()))::date then
    raise exception 'A valid current or past month is required';
  end if;

  return query
  select p_month_start,
         branch.id,
         branch.name,
         branch_stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         coalesce(sum(daily_log.usage_quantity), 0)::numeric,
         count(daily_log.id)::bigint
  from public.branch_inventory as branch_stock
  join public.branch as branch
    on branch.id = branch_stock.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  left join public.branch_inventory_daily_log as daily_log
    on daily_log.branch_inventory_id = branch_stock.id
    and daily_log.usage_date >= p_month_start
    and daily_log.usage_date < (p_month_start + interval '1 month')::date
  where branch_stock.branch_id = p_branch_id
  group by branch.id,
           branch.name,
           branch_stock.id,
           stock.stock_no,
           inventory.category,
           stock.item_description,
           stock.unit_of_measure
  order by inventory.category, stock.stock_no;
end;
$$;

create or replace function public.tafi_admin_list_branch_inventory_usage_history(
  p_session_token uuid,
  p_branch_id uuid,
  p_usage_date date
)
returns table (
  usage_date date,
  branch_id uuid,
  branch_name text,
  branch_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  beginning_stock numeric,
  usage_quantity numeric,
  ending_stock numeric
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
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  if p_usage_date is null or p_usage_date > timezone('Asia/Manila', now())::date then
    raise exception 'A valid usage history date is required';
  end if;

  return query
  select daily_log.usage_date,
         branch.id,
         branch.name,
         branch_stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         daily_log.beginning_stock,
         daily_log.usage_quantity,
         daily_log.ending_stock
  from public.branch_inventory_daily_log as daily_log
  join public.branch_inventory as branch_stock
    on branch_stock.id = daily_log.branch_inventory_id
  join public.branch as branch
    on branch.id = branch_stock.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where branch_stock.branch_id = p_branch_id
    and daily_log.usage_date = p_usage_date
  order by inventory.category, stock.stock_no;
end;
$$;

create or replace function public.tafi_admin_list_branch_inventory_monthly_usage(
  p_session_token uuid,
  p_branch_id uuid,
  p_month_start date
)
returns table (
  month_start date,
  branch_id uuid,
  branch_name text,
  branch_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  usage_total numeric,
  days_recorded bigint
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
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  if p_month_start is null
    or p_month_start <> date_trunc('month', p_month_start::timestamp)::date
    or p_month_start > date_trunc('month', timezone('Asia/Manila', now()))::date then
    raise exception 'A valid current or past month is required';
  end if;

  return query
  select p_month_start,
         branch.id,
         branch.name,
         branch_stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         coalesce(sum(daily_log.usage_quantity), 0)::numeric,
         count(daily_log.id)::bigint
  from public.branch_inventory as branch_stock
  join public.branch as branch
    on branch.id = branch_stock.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  left join public.branch_inventory_daily_log as daily_log
    on daily_log.branch_inventory_id = branch_stock.id
    and daily_log.usage_date >= p_month_start
    and daily_log.usage_date < (p_month_start + interval '1 month')::date
  where branch_stock.branch_id = p_branch_id
  group by branch.id,
           branch.name,
           branch_stock.id,
           stock.stock_no,
           inventory.category,
           stock.item_description,
           stock.unit_of_measure
  order by inventory.category, stock.stock_no;
end;
$$;

create or replace function public.branch_admin_record_inventory_daily_usage(
  p_session_token uuid,
  p_branch_inventory_id uuid,
  p_usage_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_branch_available numeric(14, 3);
  v_usage_date date := timezone('Asia/Manila', now())::date;
  v_beginning_stock numeric(14, 3);
  v_previous_usage numeric(14, 3);
  v_usage_delta numeric(14, 3);
  v_daily_log_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_usage_quantity is null or p_usage_quantity < 0 then
    raise exception 'Daily usage must be zero or greater';
  end if;

  if p_usage_quantity <> round(p_usage_quantity, 3) then
    raise exception 'Daily usage can have up to three decimal places';
  end if;

  select branch_stock.available
  into v_branch_available
  from public.branch_inventory as branch_stock
  where branch_stock.id = p_branch_inventory_id
    and branch_stock.branch_id = v_branch_id
  for update;

  if not found then
    raise exception 'The selected inventory item does not belong to this branch';
  end if;

  select daily_log.id,
         daily_log.beginning_stock,
         daily_log.usage_quantity
  into v_daily_log_id,
       v_beginning_stock,
       v_previous_usage
  from public.branch_inventory_daily_log as daily_log
  where daily_log.branch_inventory_id = p_branch_inventory_id
    and daily_log.usage_date = v_usage_date
  for update;

  if found then
    if p_usage_quantity > v_beginning_stock then
      raise exception 'Daily usage cannot exceed the beginning stock';
    end if;

    v_usage_delta := p_usage_quantity - v_previous_usage;
    if v_usage_delta > v_branch_available then
      raise exception 'Daily usage exceeds the available branch stock';
    end if;

    update public.branch_inventory
    set available = available - v_usage_delta
    where id = p_branch_inventory_id;

    update public.branch_inventory_daily_log
    set usage_quantity = p_usage_quantity
    where id = v_daily_log_id;

    return v_daily_log_id;
  end if;

  select coalesce(
    (
      select daily_log.ending_stock
      from public.branch_inventory_daily_log as daily_log
      where daily_log.branch_inventory_id = p_branch_inventory_id
        and daily_log.usage_date < v_usage_date
      order by daily_log.usage_date desc
      limit 1
    ),
    v_branch_available
  )
  into v_beginning_stock;

  if p_usage_quantity > v_beginning_stock
    or p_usage_quantity > v_branch_available then
    raise exception 'Daily usage exceeds the available beginning stock';
  end if;

  insert into public.branch_inventory_daily_log (
    branch_inventory_id,
    usage_date,
    beginning_stock,
    usage_quantity
  )
  values (
    p_branch_inventory_id,
    v_usage_date,
    v_beginning_stock,
    p_usage_quantity
  )
  returning id into v_daily_log_id;

  update public.branch_inventory
  set available = available - p_usage_quantity
  where id = p_branch_inventory_id;

  return v_daily_log_id;
end;
$$;

revoke all on function public.branch_admin_list_tafi_stock_items(uuid) from public;
revoke all on function public.branch_admin_list_inventory(uuid) from public;
revoke all on function public.branch_admin_add_inventory_item(uuid, uuid, numeric) from public;
revoke all on function public.tafi_admin_list_branch_inventory(uuid) from public;
revoke all on function public.accountant_list_branch_stock_inventory(uuid) from public;
revoke all on function public.branch_admin_list_inventory_daily_log(uuid) from public;
revoke all on function public.branch_admin_list_inventory_usage_dates(uuid) from public;
revoke all on function public.branch_admin_list_inventory_usage_history(uuid, date) from public;
revoke all on function public.branch_admin_list_inventory_monthly_usage(uuid, date) from public;
revoke all on function public.branch_admin_record_inventory_daily_usage(uuid, uuid, numeric) from public;
revoke all on function public.accountant_list_inventory_branches(uuid) from public;
revoke all on function public.accountant_list_branch_inventory_usage_history(uuid, uuid, date) from public;
revoke all on function public.accountant_list_branch_inventory_monthly_usage(uuid, uuid, date) from public;
revoke all on function public.tafi_admin_list_branch_inventory_usage_history(uuid, uuid, date) from public;
revoke all on function public.tafi_admin_list_branch_inventory_monthly_usage(uuid, uuid, date) from public;

grant execute on function public.branch_admin_list_tafi_stock_items(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_inventory(uuid) to anon, authenticated;
grant execute on function public.branch_admin_add_inventory_item(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_inventory(uuid) to anon, authenticated;
grant execute on function public.accountant_list_branch_stock_inventory(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_daily_log(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_usage_dates(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_usage_history(uuid, date) to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_monthly_usage(uuid, date) to anon, authenticated;
grant execute on function public.branch_admin_record_inventory_daily_usage(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.accountant_list_inventory_branches(uuid) to anon, authenticated;
grant execute on function public.accountant_list_branch_inventory_usage_history(uuid, uuid, date) to anon, authenticated;
grant execute on function public.accountant_list_branch_inventory_monthly_usage(uuid, uuid, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_inventory_usage_history(uuid, uuid, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_inventory_monthly_usage(uuid, uuid, date) to anon, authenticated;

commit;
