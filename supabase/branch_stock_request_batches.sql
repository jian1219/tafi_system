-- Run after stock_request_delivery_receipt.sql.
begin;

alter table public.branch_stock_requests
  add column if not exists request_group_id uuid;

update public.branch_stock_requests
set request_group_id = gen_random_uuid()
where request_group_id is null;

alter table public.branch_stock_requests
  alter column request_group_id set default gen_random_uuid(),
  alter column request_group_id set not null;

create unique index if not exists branch_stock_requests_group_stock_idx
  on public.branch_stock_requests (request_group_id, stock_inventory_id);

create index if not exists branch_stock_requests_group_idx
  on public.branch_stock_requests (request_group_id);

drop function if exists public.branch_admin_list_stock_requests(uuid);
create function public.branch_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
  request_group_id uuid,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
  status text,
  quantity_delivered numeric,
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
         request.request_group_id,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         request.quantity_requested,
         request.status,
         request.quantity_delivered,
         request.created_at
  from public.branch_stock_requests as request
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  where request.branch_id = v_branch_id
  order by request.created_at desc, request.request_group_id;
end;
$$;

drop function if exists public.branch_admin_list_stock_receipt_history(uuid);
create function public.branch_admin_list_stock_receipt_history(
  p_session_token uuid
)
returns table (
  receipt_id uuid,
  request_id uuid,
  request_group_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
  quantity_delivered numeric,
  quantity_received numeric,
  received_at timestamptz
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
  select history.id,
         history.request_id,
         request.request_group_id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         history.quantity_requested,
         history.quantity_delivered,
         history.quantity_received,
         history.received_at
  from public.branch_stock_receipt_history as history
  join public.branch_stock_requests as request
    on request.id = history.request_id
  join public.tafi_stock_inventory as stock
    on stock.id = history.stock_inventory_id
  where history.branch_id = v_branch_id
  order by history.received_at desc;
end;
$$;

drop function if exists public.tafi_admin_list_stock_requests(uuid);
create function public.tafi_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
  request_group_id uuid,
  branch_name text,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
  current_available numeric,
  status text,
  quantity_delivered numeric,
  quantity_received numeric,
  received_at timestamptz,
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
         request.request_group_id,
         branch.name,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         request.quantity_requested,
         stock.available,
         request.status,
         request.quantity_delivered,
         request.quantity_received,
         request.received_at,
         request.created_at
  from public.branch_stock_requests as request
  join public.branch as branch
    on branch.id = request.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  order by request.created_at desc, request.request_group_id;
end;
$$;

create or replace function public.branch_admin_create_stock_request_batch(
  p_session_token uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_request_group_id uuid;
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'At least one stock request item is required';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one stock request item is required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(stock_inventory_id uuid, quantity_requested numeric)
    where item.stock_inventory_id is null
      or item.quantity_requested is null
      or item.quantity_requested <= 0
  ) then
    raise exception 'Each request item needs a stock item and a quantity greater than zero';
  end if;

  if exists (
    select item.stock_inventory_id
    from jsonb_to_recordset(p_items) as item(stock_inventory_id uuid, quantity_requested numeric)
    group by item.stock_inventory_id
    having count(*) > 1
  ) then
    raise exception 'A stock item can only appear once in each request';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(stock_inventory_id uuid, quantity_requested numeric)
    left join public.tafi_stock_inventory as stock
      on stock.id = item.stock_inventory_id
    where stock.id is null
  ) then
    raise exception 'A selected TAFI stock item no longer exists';
  end if;

  v_request_group_id := gen_random_uuid();

  insert into public.branch_stock_requests (
    request_group_id,
    branch_id,
    stock_inventory_id,
    quantity_requested
  )
  select v_request_group_id,
         v_branch_id,
         item.stock_inventory_id,
         item.quantity_requested
  from jsonb_to_recordset(p_items) as item(stock_inventory_id uuid, quantity_requested numeric);

  return v_request_group_id;
end;
$$;

revoke all on function public.branch_admin_list_stock_requests(uuid) from public;
revoke all on function public.branch_admin_list_stock_receipt_history(uuid) from public;
revoke all on function public.tafi_admin_list_stock_requests(uuid) from public;
revoke all on function public.branch_admin_create_stock_request_batch(uuid, jsonb) from public;

grant execute on function public.branch_admin_list_stock_requests(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_stock_receipt_history(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_requests(uuid) to anon, authenticated;
grant execute on function public.branch_admin_create_stock_request_batch(uuid, jsonb) to anon, authenticated;

commit;
