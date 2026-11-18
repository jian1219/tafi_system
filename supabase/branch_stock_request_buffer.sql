-- Run after branch_stock_request_prices.sql and all stock request migrations.
begin;

do $$
begin
  if to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.branch_stock_receipt_history') is null
    or to_regclass('public.branch_inventory') is null
    or to_regclass('public.tafi_stock_request_preparation_items') is null
    or to_regclass('public.tafi_stock_inventory') is null
    or to_regprocedure('public.branch_admin_list_stock_requests(uuid)') is null
    or to_regprocedure('public.branch_admin_list_stock_receipt_history(uuid)') is null then
    raise exception 'Install branch stock request, receipt, and price migrations first.';
  end if;
end;
$$;

alter table public.branch_stock_requests
  add column if not exists quantity_requested_base numeric(14, 3),
  add column if not exists quantity_buffer numeric(14, 3) not null default 0,
  add column if not exists branch_current_stock numeric(14, 3);

update public.branch_stock_requests
set quantity_requested_base = quantity_requested,
    quantity_buffer = 0
where quantity_requested_base is null;

alter table public.branch_stock_requests
  alter column quantity_requested_base set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_stock_requests_quantity_breakdown_check'
      and conrelid = 'public.branch_stock_requests'::regclass
  ) then
    alter table public.branch_stock_requests
      add constraint branch_stock_requests_quantity_breakdown_check
      check (
        quantity_requested_base > 0
        and quantity_requested_base = trunc(quantity_requested_base)
        and quantity_buffer >= 0
        and quantity_buffer = trunc(quantity_buffer)
        and quantity_requested = quantity_requested_base + quantity_buffer
      );
  end if;
end;
$$;

drop function public.branch_admin_list_stock_requests(uuid);
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
  quantity_requested_base numeric,
  quantity_buffer numeric,
  quantity_requested numeric,
  branch_current_stock numeric,
  status text,
  quantity_delivered numeric,
  unit_price numeric,
  total_price numeric,
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
         request.quantity_requested_base,
         request.quantity_buffer,
         request.quantity_requested,
         request.branch_current_stock,
         request.status,
         request.quantity_delivered,
         delivered_price.unit_price,
         delivered_price.total_price,
         request.created_at
  from public.branch_stock_requests as request
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  left join lateral (
    select case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
               / nullif(sum(item.quantity), 0)
             else null::numeric
           end as unit_price,
           case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
             else null::numeric
           end as total_price
    from public.tafi_stock_request_preparation_items as item
    where item.preparation_id = request.preparation_id
      and item.stock_inventory_id = request.stock_inventory_id
  ) as delivered_price on true
  where request.branch_id = v_branch_id
  order by request.created_at desc, request.request_group_id;
end;
$$;

drop function public.branch_admin_list_stock_receipt_history(uuid);
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
  quantity_requested_base numeric,
  quantity_buffer numeric,
  quantity_requested numeric,
  branch_current_stock numeric,
  quantity_delivered numeric,
  quantity_received numeric,
  unit_price numeric,
  total_price numeric,
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
         request.quantity_requested_base,
         request.quantity_buffer,
         history.quantity_requested,
         request.branch_current_stock,
         history.quantity_delivered,
         history.quantity_received,
         delivered_price.unit_price,
         delivered_price.total_price,
         history.received_at
  from public.branch_stock_receipt_history as history
  join public.branch_stock_requests as request
    on request.id = history.request_id
  join public.tafi_stock_inventory as stock
    on stock.id = history.stock_inventory_id
  left join lateral (
    select case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
               / nullif(sum(item.quantity), 0)
             else null::numeric
           end as unit_price,
           case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
             else null::numeric
           end as total_price
    from public.tafi_stock_request_preparation_items as item
    where item.preparation_id = request.preparation_id
      and item.stock_inventory_id = history.stock_inventory_id
  ) as delivered_price on true
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
  branch_id uuid,
  branch_name text,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested_base numeric,
  quantity_buffer numeric,
  quantity_requested numeric,
  branch_current_stock numeric,
  current_available numeric,
  status text,
  quantity_delivered numeric,
  quantity_received numeric,
  received_at timestamptz,
  created_at timestamptz,
  preparation_id uuid
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
         request.branch_id,
         branch.name,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         request.quantity_requested_base,
         request.quantity_buffer,
         request.quantity_requested,
         request.branch_current_stock,
         stock.available,
         request.status,
         request.quantity_delivered,
         request.quantity_received,
         request.received_at,
         request.created_at,
         request.preparation_id
  from public.branch_stock_requests as request
  join public.branch as branch
    on branch.id = request.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  order by request.created_at desc, request.request_group_id;
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
  if p_quantity_requested is null or p_quantity_requested <= 0
    or p_quantity_requested <> trunc(p_quantity_requested) then
    raise exception 'Requested quantity must be a whole number greater than zero';
  end if;

  insert into public.branch_stock_requests (
    branch_id,
    stock_inventory_id,
    quantity_requested_base,
    quantity_buffer,
    quantity_requested,
    branch_current_stock
  )
  values (
    v_branch_id,
    p_stock_inventory_id,
    p_quantity_requested,
    0,
    p_quantity_requested,
    coalesce((
      select branch_stock.available
      from public.branch_inventory as branch_stock
      where branch_stock.branch_id = v_branch_id
        and branch_stock.stock_inventory_id = p_stock_inventory_id
    ), 0)
  )
  returning id into v_request_id;

  return v_request_id;
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
    from jsonb_to_recordset(p_items) as item(
      stock_inventory_id uuid,
      quantity_requested numeric,
      quantity_buffer numeric
    )
    where item.stock_inventory_id is null
      or item.quantity_requested is null
      or item.quantity_requested <= 0
      or item.quantity_requested <> trunc(item.quantity_requested)
      or coalesce(item.quantity_buffer, 0) < 0
      or coalesce(item.quantity_buffer, 0) <> trunc(coalesce(item.quantity_buffer, 0))
  ) then
    raise exception 'Each request item needs a stock item, a positive whole-number requested quantity, and a nonnegative whole-number buffer';
  end if;

  if exists (
    select item.stock_inventory_id
    from jsonb_to_recordset(p_items) as item(
      stock_inventory_id uuid,
      quantity_requested numeric,
      quantity_buffer numeric
    )
    group by item.stock_inventory_id
    having count(*) > 1
  ) then
    raise exception 'A stock item can only appear once in each request';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      stock_inventory_id uuid,
      quantity_requested numeric,
      quantity_buffer numeric
    )
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
    quantity_requested_base,
    quantity_buffer,
    quantity_requested,
    branch_current_stock
  )
  select v_request_group_id,
         v_branch_id,
         item.stock_inventory_id,
         item.quantity_requested,
         coalesce(item.quantity_buffer, 0),
         item.quantity_requested + coalesce(item.quantity_buffer, 0),
         coalesce(branch_stock.available, 0)
  from jsonb_to_recordset(p_items) as item(
    stock_inventory_id uuid,
    quantity_requested numeric,
    quantity_buffer numeric
  )
  left join public.branch_inventory as branch_stock
    on branch_stock.branch_id = v_branch_id
    and branch_stock.stock_inventory_id = item.stock_inventory_id;

  return v_request_group_id;
end;
$$;

drop function if exists public.branch_admin_list_tafi_stock_items(uuid);
create function public.branch_admin_list_tafi_stock_items(
  p_session_token uuid
)
returns table (
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric,
  branch_current_stock numeric
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
  select stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         stock.available,
         coalesce(branch_stock.available, 0)
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  left join public.branch_inventory as branch_stock
    on branch_stock.branch_id = v_branch_id
    and branch_stock.stock_inventory_id = stock.id
  order by inventory.category, stock.stock_no;
end;
$$;

revoke all on function public.branch_admin_list_stock_requests(uuid)
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_stock_receipt_history(uuid)
  from public, anon, authenticated;
revoke all on function public.branch_admin_create_stock_request(uuid, uuid, numeric)
  from public;
revoke all on function public.branch_admin_create_stock_request_batch(uuid, jsonb)
  from public;
revoke all on function public.branch_admin_list_tafi_stock_items(uuid)
  from public;
revoke all on function public.tafi_admin_list_stock_requests(uuid)
  from public, anon, authenticated;

grant execute on function public.branch_admin_list_stock_requests(uuid)
  to anon, authenticated;
grant execute on function public.branch_admin_list_stock_receipt_history(uuid)
  to anon, authenticated;
grant execute on function public.branch_admin_create_stock_request(uuid, uuid, numeric)
  to anon, authenticated;
grant execute on function public.branch_admin_create_stock_request_batch(uuid, jsonb)
  to anon, authenticated;
grant execute on function public.branch_admin_list_tafi_stock_items(uuid)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_requests(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
