-- Run after branch_management.sql, tafi_stock_inventory.sql, and branch_inventory.sql.
begin;

create table if not exists public.branch_stock_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  quantity_requested numeric(14, 3) not null check (quantity_requested > 0),
  created_at timestamptz not null default now()
);

create index if not exists branch_stock_requests_branch_created_idx
  on public.branch_stock_requests (branch_id, created_at desc);

alter table public.branch_stock_requests enable row level security;
revoke all on table public.branch_stock_requests from public, anon, authenticated;

create or replace function public.branch_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
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
  select request.id,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         request.quantity_requested,
         request.created_at
  from public.branch_stock_requests as request
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  where request.branch_id = v_branch_id
  order by request.created_at desc;
end;
$$;

create or replace function public.branch_admin_create_stock_request(
  p_session_token uuid,
  p_stock_inventory_id uuid,
  p_quantity_requested numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_request_id uuid;
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

  if p_quantity_requested is null
    or p_quantity_requested <= 0
    or p_quantity_requested <> trunc(p_quantity_requested) then
    raise exception 'Requested quantity must be a whole number greater than zero';
  end if;

  insert into public.branch_stock_requests (
    branch_id,
    stock_inventory_id,
    quantity_requested
  )
  values (
    v_branch_id,
    p_stock_inventory_id,
    p_quantity_requested
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.tafi_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
  branch_name text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
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
  select request.id,
         branch.name,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         request.quantity_requested,
         request.created_at
  from public.branch_stock_requests as request
  join public.branch as branch
    on branch.id = request.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  order by request.created_at desc;
end;
$$;

revoke all on function public.branch_admin_list_stock_requests(uuid) from public;
revoke all on function public.branch_admin_create_stock_request(uuid, uuid, numeric) from public;
revoke all on function public.tafi_admin_list_stock_requests(uuid) from public;

grant execute on function public.branch_admin_list_stock_requests(uuid) to anon, authenticated;
grant execute on function public.branch_admin_create_stock_request(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_requests(uuid) to anon, authenticated;

commit;
