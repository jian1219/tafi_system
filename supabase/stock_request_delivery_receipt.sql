-- Run after branch_stock_requests.sql.
begin;

alter table public.branch_stock_requests
  add column if not exists status text not null default 'pending',
  add column if not exists quantity_delivered numeric(14, 3),
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict,
  add column if not exists quantity_received numeric(14, 3),
  add column if not exists received_at timestamptz,
  add column if not exists received_by_branch_admin_id uuid
    references public.branch_admin(id) on delete restrict;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_stock_requests_status_check'
      and conrelid = 'public.branch_stock_requests'::regclass
  ) then
    alter table public.branch_stock_requests
      add constraint branch_stock_requests_status_check
      check (status in ('pending', 'delivered', 'received'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_stock_requests_delivery_receipt_check'
      and conrelid = 'public.branch_stock_requests'::regclass
  ) then
    alter table public.branch_stock_requests
      add constraint branch_stock_requests_delivery_receipt_check
      check (
        (status = 'pending'
          and quantity_delivered is null
          and delivered_at is null
          and delivered_by_tafi_admin_id is null
          and quantity_received is null
          and received_at is null
          and received_by_branch_admin_id is null)
        or (status = 'delivered'
          and quantity_delivered > 0
          and quantity_delivered <= quantity_requested
          and delivered_at is not null
          and delivered_by_tafi_admin_id is not null
          and quantity_received is null
          and received_at is null
          and received_by_branch_admin_id is null)
        or (status = 'received'
          and quantity_delivered > 0
          and quantity_delivered <= quantity_requested
          and delivered_at is not null
          and delivered_by_tafi_admin_id is not null
          and quantity_received >= 0
          and quantity_received <= quantity_delivered
          and received_at is not null
          and received_by_branch_admin_id is not null)
      );
  end if;
end;
$$;

create table if not exists public.branch_stock_receipt_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique
    references public.branch_stock_requests(id) on delete restrict,
  branch_id uuid not null references public.branch(id) on delete restrict,
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  quantity_requested numeric(14, 3) not null check (quantity_requested > 0),
  quantity_delivered numeric(14, 3) not null check (quantity_delivered > 0),
  quantity_received numeric(14, 3) not null
    check (quantity_received >= 0 and quantity_received <= quantity_delivered),
  received_by_branch_admin_id uuid not null
    references public.branch_admin(id) on delete restrict,
  received_at timestamptz not null default now()
);

create index if not exists branch_stock_receipt_history_branch_received_idx
  on public.branch_stock_receipt_history (branch_id, received_at desc);

alter table public.branch_stock_receipt_history enable row level security;
revoke all on table public.branch_stock_receipt_history from public, anon, authenticated;

drop function if exists public.branch_admin_list_stock_requests(uuid);
create function public.branch_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
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
  order by request.created_at desc;
end;
$$;

create or replace function public.branch_admin_list_stock_receipt_history(
  p_session_token uuid
)
returns table (
  receipt_id uuid,
  request_id uuid,
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
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         history.quantity_requested,
         history.quantity_delivered,
         history.quantity_received,
         history.received_at
  from public.branch_stock_receipt_history as history
  join public.tafi_stock_inventory as stock
    on stock.id = history.stock_inventory_id
  where history.branch_id = v_branch_id
  order by history.received_at desc;
end;
$$;

create or replace function public.branch_admin_receive_stock_request(
  p_session_token uuid,
  p_request_id uuid,
  p_quantity_received numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_branch_admin_id uuid;
  v_stock_inventory_id uuid;
  v_quantity_requested numeric(14, 3);
  v_quantity_delivered numeric(14, 3);
  v_status text;
  v_receipt_id uuid;
begin
  select branch_admin.id, branch_admin.branch_id
  into v_branch_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_quantity_received is null or p_quantity_received < 0 then
    raise exception 'Counted quantity must be zero or greater';
  end if;

  select request.stock_inventory_id,
         request.quantity_requested,
         request.quantity_delivered,
         request.status
  into v_stock_inventory_id,
       v_quantity_requested,
       v_quantity_delivered,
       v_status
  from public.branch_stock_requests as request
  where request.id = p_request_id
    and request.branch_id = v_branch_id
  for update;

  if not found then
    raise exception 'Stock request was not found for this branch';
  end if;

  if v_status <> 'delivered' then
    raise exception 'Only delivered stock requests can be received';
  end if;

  if p_quantity_received > v_quantity_delivered then
    raise exception 'Counted quantity cannot exceed the delivered quantity';
  end if;

  insert into public.branch_inventory (branch_id, stock_inventory_id, onhand)
  values (v_branch_id, v_stock_inventory_id, p_quantity_received)
  on conflict (branch_id, stock_inventory_id)
  do update set onhand = public.branch_inventory.onhand + excluded.onhand;

  insert into public.branch_stock_receipt_history (
    request_id,
    branch_id,
    stock_inventory_id,
    quantity_requested,
    quantity_delivered,
    quantity_received,
    received_by_branch_admin_id
  )
  values (
    p_request_id,
    v_branch_id,
    v_stock_inventory_id,
    v_quantity_requested,
    v_quantity_delivered,
    p_quantity_received,
    v_branch_admin_id
  )
  returning id into v_receipt_id;

  update public.branch_stock_requests
  set status = 'received',
      quantity_received = p_quantity_received,
      received_at = now(),
      received_by_branch_admin_id = v_branch_admin_id
  where id = p_request_id;

  return v_receipt_id;
end;
$$;

drop function if exists public.tafi_admin_list_stock_requests(uuid);
create function public.tafi_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
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
  order by request.created_at desc;
end;
$$;

create or replace function public.tafi_admin_deliver_stock_request(
  p_session_token uuid,
  p_request_id uuid,
  p_quantity_delivered numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_stock_inventory_id uuid;
  v_quantity_requested numeric(14, 3);
  v_status text;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_quantity_delivered is null or p_quantity_delivered <= 0 then
    raise exception 'Delivered quantity must be greater than zero';
  end if;

  select request.stock_inventory_id, request.quantity_requested, request.status
  into v_stock_inventory_id, v_quantity_requested, v_status
  from public.branch_stock_requests as request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Stock request was not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'Only pending stock requests can be marked delivered';
  end if;

  if p_quantity_delivered > v_quantity_requested then
    raise exception 'Delivered quantity cannot exceed the requested quantity';
  end if;

  update public.tafi_stock_inventory
  set onhand = onhand - p_quantity_delivered
  where id = v_stock_inventory_id
    and available >= p_quantity_delivered;

  if not found then
    raise exception 'Delivered quantity exceeds current available TAFI stock';
  end if;

  update public.branch_stock_requests
  set status = 'delivered',
      quantity_delivered = p_quantity_delivered,
      delivered_at = now(),
      delivered_by_tafi_admin_id = v_tafi_admin_id
  where id = p_request_id;

  return p_request_id;
end;
$$;

revoke all on function public.branch_admin_list_stock_requests(uuid) from public;
revoke all on function public.branch_admin_list_stock_receipt_history(uuid) from public;
revoke all on function public.branch_admin_receive_stock_request(uuid, uuid, numeric) from public;
revoke all on function public.tafi_admin_list_stock_requests(uuid) from public;
revoke all on function public.tafi_admin_deliver_stock_request(uuid, uuid, numeric) from public;

grant execute on function public.branch_admin_list_stock_requests(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_stock_receipt_history(uuid) to anon, authenticated;
grant execute on function public.branch_admin_receive_stock_request(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_requests(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_deliver_stock_request(uuid, uuid, numeric) to anon, authenticated;

commit;
