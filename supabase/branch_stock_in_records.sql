-- Run after branch_stock_request_batches.sql, tafi_stock_inventory_barcode_balance.sql,
-- tafi_stock_request_preparation.sql, and branch_stock_request_prices.sql.
begin;

do $$
begin
  if to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.branch_stock_receipt_history') is null
    or to_regclass('public.tafi_stock_request_preparations') is null
    or to_regclass('public.tafi_stock_request_preparation_items') is null
    or to_regclass('public.branch_inventory') is null
    or to_regclass('public.tafi_stock_inventory') is null
    or to_regclass('public.branch_admin_session') is null
    or to_regclass('public.branch_admin') is null
    or to_regprocedure('public.branch_admin_receive_stock_request(uuid, uuid, numeric)') is null then
    raise exception 'Install branch request, receipt, stock preparation, and inventory migrations first.';
  end if;
end;
$$;

create table if not exists public.branch_stock_in_record (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique
    references public.branch_stock_requests(id) on delete restrict,
  branch_id uuid not null references public.branch(id) on delete restrict,
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  stock_no text not null,
  item_description text not null,
  unit_of_measure text not null,
  stock_in_count numeric(14, 3) not null check (stock_in_count >= 0),
  per_item_price numeric check (per_item_price is null or per_item_price >= 0),
  total_price numeric check (total_price is null or total_price >= 0),
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists branch_stock_in_record_branch_date_idx
  on public.branch_stock_in_record (branch_id, date desc, created_at desc);

alter table public.branch_stock_in_record enable row level security;
revoke all on table public.branch_stock_in_record from public, anon, authenticated;

insert into public.branch_stock_in_record (
  request_id,
  branch_id,
  stock_inventory_id,
  stock_no,
  item_description,
  unit_of_measure,
  stock_in_count,
  per_item_price,
  total_price,
  date
)
select history.request_id,
       history.branch_id,
       history.stock_inventory_id,
       stock.stock_no,
       stock.item_description,
       stock.unit_of_measure,
       history.quantity_received,
       price_data.per_item_price,
       case
         when price_data.total_price is null then null
         when history.quantity_received = history.quantity_delivered
           then price_data.total_price
         else round(price_data.per_item_price * history.quantity_received, 2)
       end,
       (history.received_at at time zone 'Asia/Manila')::date
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
         end as per_item_price,
         case
           when count(item.id) > 0
             and count(item.unit_price) = count(item.id)
           then sum(item.quantity * item.unit_price)
           else null::numeric
         end as total_price
  from public.tafi_stock_request_preparation_items as item
  where item.preparation_id = request.preparation_id
    and item.stock_inventory_id = history.stock_inventory_id
) as price_data on true
on conflict (request_id) do nothing;

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
  v_preparation_id uuid;
  v_stock_no text;
  v_item_description text;
  v_unit_of_measure text;
  v_quantity_requested numeric(14, 3);
  v_quantity_delivered numeric(14, 3);
  v_status text;
  v_total_price numeric;
  v_per_item_price numeric;
  v_record_total_price numeric;
  v_record_date date := (now() at time zone 'Asia/Manila')::date;
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

  if p_quantity_received is null
    or p_quantity_received < 0
    or p_quantity_received <> trunc(p_quantity_received) then
    raise exception 'Received quantity must be a whole number zero or greater';
  end if;

  select request.stock_inventory_id,
         request.preparation_id,
         request.quantity_requested,
         request.quantity_delivered,
         request.status
  into v_stock_inventory_id,
       v_preparation_id,
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
    raise exception 'Received quantity cannot exceed the delivered quantity';
  end if;

  select stock.stock_no, stock.item_description, stock.unit_of_measure
  into v_stock_no, v_item_description, v_unit_of_measure
  from public.tafi_stock_inventory as stock
  where stock.id = v_stock_inventory_id;

  if not found then
    raise exception 'The delivered stock item could not be found';
  end if;

  select case
           when count(item.id) > 0
             and count(item.unit_price) = count(item.id)
           then sum(item.quantity * item.unit_price)
           else null::numeric
         end
  into v_total_price
  from public.tafi_stock_request_preparation_items as item
  where item.preparation_id = v_preparation_id
    and item.stock_inventory_id = v_stock_inventory_id;

  v_per_item_price := v_total_price / nullif(v_quantity_delivered, 0);
  v_record_total_price := case
    when v_total_price is null then null
    when p_quantity_received = v_quantity_delivered then v_total_price
    else round(v_per_item_price * p_quantity_received, 2)
  end;

  insert into public.branch_inventory (branch_id, stock_inventory_id, available)
  values (v_branch_id, v_stock_inventory_id, p_quantity_received)
  on conflict (branch_id, stock_inventory_id)
  do update set available = public.branch_inventory.available + excluded.available;

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

  insert into public.branch_stock_in_record (
    request_id,
    branch_id,
    stock_inventory_id,
    stock_no,
    item_description,
    unit_of_measure,
    stock_in_count,
    per_item_price,
    total_price,
    date
  )
  values (
    p_request_id,
    v_branch_id,
    v_stock_inventory_id,
    v_stock_no,
    v_item_description,
    v_unit_of_measure,
    p_quantity_received,
    v_per_item_price,
    v_record_total_price,
    v_record_date
  );

  update public.branch_stock_requests
  set status = 'received',
      quantity_received = p_quantity_received,
      received_at = now(),
      received_by_branch_admin_id = v_branch_admin_id
  where id = p_request_id;

  return v_receipt_id;
end;
$$;

create or replace function public.branch_admin_list_stock_in_records(
  p_session_token uuid
)
returns table (
  record_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  stock_in_count numeric,
  per_item_price numeric,
  total_price numeric,
  date date
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
  select saved.id,
         saved.stock_no,
         saved.item_description,
         saved.unit_of_measure,
         saved.stock_in_count,
         saved.per_item_price,
         saved.total_price,
         saved.date
  from public.branch_stock_in_record as saved
  where saved.branch_id = v_branch_id
  order by saved.date desc, saved.created_at desc, saved.stock_no;
end;
$$;

revoke all on function public.branch_admin_receive_stock_request(uuid, uuid, numeric)
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_stock_in_records(uuid)
  from public, anon, authenticated;

grant execute on function public.branch_admin_receive_stock_request(uuid, uuid, numeric)
  to anon, authenticated;
grant execute on function public.branch_admin_list_stock_in_records(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
