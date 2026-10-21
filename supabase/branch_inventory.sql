-- Run after branch_management.sql, tafi_admin_management.sql, and tafi_stock_inventory.sql.
begin;

create table if not exists public.branch_inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  onhand numeric(14, 3) not null default 0 check (onhand >= 0),
  allocated numeric(14, 3) not null default 0 check (allocated >= 0),
  available numeric(14, 3) generated always as (onhand - allocated) stored,
  created_at timestamptz not null default now(),
  unique (branch_id, stock_inventory_id),
  check (allocated <= onhand)
);

create index if not exists branch_inventory_branch_idx
  on public.branch_inventory (branch_id);

alter table public.branch_inventory enable row level security;
revoke all on table public.branch_inventory from public, anon, authenticated;

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

create or replace function public.branch_admin_list_inventory(
  p_session_token uuid
)
returns table (
  branch_inventory_id uuid,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  onhand numeric,
  allocated numeric,
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
         branch_stock.onhand,
         branch_stock.allocated,
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

create or replace function public.branch_admin_add_inventory_item(
  p_session_token uuid,
  p_stock_inventory_id uuid,
  p_onhand numeric
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

  if p_onhand is null or p_onhand < 0 then
    raise exception 'Branch on-hand quantity must be zero or greater';
  end if;

  insert into public.branch_inventory (branch_id, stock_inventory_id, onhand)
  values (v_branch_id, p_stock_inventory_id, p_onhand)
  returning id into v_branch_inventory_id;

  return v_branch_inventory_id;
end;
$$;

create or replace function public.tafi_admin_list_branch_inventory(
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
  onhand numeric,
  allocated numeric,
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
         branch_stock.onhand,
         branch_stock.allocated,
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

revoke all on function public.branch_admin_list_tafi_stock_items(uuid) from public;
revoke all on function public.branch_admin_list_inventory(uuid) from public;
revoke all on function public.branch_admin_add_inventory_item(uuid, uuid, numeric) from public;
revoke all on function public.tafi_admin_list_branch_inventory(uuid) from public;

grant execute on function public.branch_admin_list_tafi_stock_items(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_inventory(uuid) to anon, authenticated;
grant execute on function public.branch_admin_add_inventory_item(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_inventory(uuid) to anon, authenticated;

commit;
