-- Run after branch_stock_requests.sql, branch_stock_request_batches.sql,
-- stock_request_delivery_receipt.sql, tafi_stock_inventory_barcode_balance.sql,
-- tafi_admin_stock_in_scan_price.sql, tafi_admin_stock_out_records.sql, and
-- the TAFI Admin session migration.
begin;

do $$
begin
  if to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.inventory_information') is null
    or to_regclass('public.tafi_stock_inventory') is null
    or to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.stock_out_records') is null
    or to_regclass('public.tafi_admin_session') is null then
    raise exception 'Install the TAFI stock request, barcode inventory, stock-out, and session migrations first.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.tafi_admin_stock_in_scans'::regclass
      and attname = 'price'
      and not attisdropped
  ) then
    raise exception 'Run tafi_admin_stock_in_scan_price.sql before this migration.';
  end if;
end;
$$;

create table if not exists public.tafi_stock_request_preparations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  request_date date not null,
  status text not null default 'preparing'
    check (status in ('preparing', 'delivered')),
  started_by_tafi_admin_id uuid not null
    references public.tafi_admin(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table public.tafi_stock_request_preparations enable row level security;
revoke all on table public.tafi_stock_request_preparations from public, anon, authenticated;

alter table public.branch_stock_requests
  add column if not exists preparation_id uuid
    references public.tafi_stock_request_preparations(id) on delete restrict;

create index if not exists branch_stock_requests_preparation_idx
  on public.branch_stock_requests (preparation_id, stock_inventory_id);

create table if not exists public.tafi_stock_request_preparation_items (
  id uuid primary key default gen_random_uuid(),
  preparation_id uuid not null
    references public.tafi_stock_request_preparations(id) on delete restrict,
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  barcode text not null,
  stock_no text not null,
  category text,
  item_description text not null,
  unit_of_measure text not null,
  quantity bigint not null check (quantity > 0),
  unit_price numeric(12, 2) check (unit_price is null or unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (preparation_id, barcode)
);

create index if not exists tafi_stock_request_preparation_items_prep_idx
  on public.tafi_stock_request_preparation_items
    (preparation_id, stock_inventory_id, barcode);

alter table public.tafi_stock_request_preparation_items enable row level security;
revoke all on table public.tafi_stock_request_preparation_items from public, anon, authenticated;

alter table public.branch_stock_requests
  drop constraint if exists branch_stock_requests_status_check,
  add constraint branch_stock_requests_status_check
    check (status in ('pending', 'preparing', 'delivered', 'received'));

alter table public.branch_stock_requests
  drop constraint if exists branch_stock_requests_delivery_receipt_check,
  add constraint branch_stock_requests_delivery_receipt_check
    check (
      (status = 'pending'
        and preparation_id is null
        and quantity_delivered is null
        and delivered_at is null
        and delivered_by_tafi_admin_id is null
        and quantity_received is null
        and received_at is null
        and received_by_branch_admin_id is null)
      or (status = 'preparing'
        and preparation_id is not null
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
  quantity_requested numeric,
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
         request.quantity_requested,
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

create or replace function public.tafi_admin_start_stock_request_preparation(
  p_session_token uuid,
  p_request_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_preparation_id uuid;
  v_request_count integer;
  v_branch_count integer;
  v_request_date_count integer;
  v_branch_id uuid;
  v_request_date date;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    raise exception 'At least one stock request is required';
  end if;

  perform request.id
  from public.branch_stock_requests as request
  where request.id = any(p_request_ids)
  order by request.id
  for update;

  select count(*)::integer,
         count(distinct request.branch_id)::integer,
         count(distinct (request.created_at at time zone 'Asia/Manila')::date)::integer,
         (array_agg(request.branch_id))[1],
         min((request.created_at at time zone 'Asia/Manila')::date)
  into v_request_count, v_branch_count, v_request_date_count,
       v_branch_id, v_request_date
  from public.branch_stock_requests as request
  where request.id = any(p_request_ids);

  if v_request_count <> cardinality(p_request_ids) then
    raise exception 'One or more stock requests are missing or duplicated';
  end if;
  if v_branch_count <> 1 or v_request_date_count <> 1 then
    raise exception 'Requests must belong to the same branch and request date';
  end if;
  if exists (
    select 1
    from public.branch_stock_requests as request
    where request.id = any(p_request_ids)
      and (request.status <> 'pending' or request.preparation_id is not null)
  ) then
    raise exception 'Only unprepared pending requests can be prepared';
  end if;

  insert into public.tafi_stock_request_preparations (
    branch_id,
    request_date,
    started_by_tafi_admin_id
  )
  values (v_branch_id, v_request_date, v_tafi_admin_id)
  returning id into v_preparation_id;

  update public.branch_stock_requests
  set status = 'preparing',
      preparation_id = v_preparation_id
  where id = any(p_request_ids);

  return v_preparation_id;
end;
$$;

create or replace function public.tafi_admin_lookup_stock_request_barcode(
  p_session_token uuid,
  p_preparation_id uuid,
  p_barcode text
)
returns table (
  barcode text,
  stock_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  price numeric,
  barcode_available bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if v_barcode is null then
    raise exception 'A barcode is required.';
  end if;

  perform 1
  from public.tafi_stock_request_preparations as preparation
  where preparation.id = p_preparation_id
    and preparation.status = 'preparing'
  for update;
  if not found then
    raise exception 'This stock request is no longer being prepared.';
  end if;

  return query
  select saved.barcode,
         stock.id,
         stock.stock_no,
         inventory.category,
         stock.item_description,
         stock.unit_of_measure,
         saved.price,
         saved.scan_count
  from public.tafi_admin_stock_in_scans as saved
  join public.tafi_stock_inventory as stock
    on stock.stock_no = saved.stock_no
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where saved.barcode = v_barcode
    and saved.scan_count > 0
    and exists (
      select 1
      from public.branch_stock_requests as request
      where request.preparation_id = p_preparation_id
        and request.stock_inventory_id = stock.id
    );

  if not found then
    raise exception 'This barcode has no remaining stock or is not part of this request.';
  end if;
end;
$$;

create or replace function public.tafi_admin_save_stock_request_preparation_item(
  p_session_token uuid,
  p_preparation_id uuid,
  p_barcode text,
  p_quantity bigint,
  p_unit_price numeric default null
)
returns table (
  item_id uuid,
  barcode text,
  stock_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  quantity bigint,
  unit_price numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
  v_scan record;
  v_requested numeric;
  v_other_prepared numeric;
  v_item_id uuid;
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Prepared quantity must be a whole number greater than zero.';
  end if;
  if p_unit_price is not null and (
    p_unit_price < 0
    or p_unit_price > 9999999999.99
    or p_unit_price <> round(p_unit_price, 2)
  ) then
    raise exception 'Unit price must be zero or greater and have no more than two decimal places.';
  end if;
  if v_barcode is null then
    raise exception 'A barcode is required.';
  end if;

  perform 1
  from public.tafi_stock_request_preparations as preparation
  where preparation.id = p_preparation_id
    and preparation.status = 'preparing'
  for update;
  if not found then
    raise exception 'This stock request is no longer being prepared.';
  end if;

  select saved.barcode,
         saved.stock_no,
         saved.item_description,
         saved.unit_of_measure,
         saved.scan_count,
         stock.id as stock_inventory_id,
         inventory.category
  into v_scan
  from public.tafi_admin_stock_in_scans as saved
  join public.tafi_stock_inventory as stock
    on stock.stock_no = saved.stock_no
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where saved.barcode = v_barcode
  for update of saved;

  if not found then
    raise exception 'This barcode is not in TAFI Barcode Inventory.';
  end if;
  if v_scan.scan_count < p_quantity then
    raise exception 'Prepared quantity exceeds the remaining quantity for this barcode.';
  end if;
  if not exists (
    select 1
    from public.branch_stock_requests as request
    where request.preparation_id = p_preparation_id
      and request.stock_inventory_id = v_scan.stock_inventory_id
  ) then
    raise exception 'This item is not part of the selected stock request.';
  end if;

  select coalesce(sum(request.quantity_requested), 0)
  into v_requested
  from public.branch_stock_requests as request
  where request.preparation_id = p_preparation_id
    and request.stock_inventory_id = v_scan.stock_inventory_id;

  select coalesce(sum(item.quantity), 0)
  into v_other_prepared
  from public.tafi_stock_request_preparation_items as item
  where item.preparation_id = p_preparation_id
    and item.stock_inventory_id = v_scan.stock_inventory_id
    and item.barcode <> v_barcode;

  if v_other_prepared + p_quantity > v_requested then
    raise exception 'Prepared quantity cannot exceed the requested quantity for this item.';
  end if;

  insert into public.tafi_stock_request_preparation_items as item (
    preparation_id,
    stock_inventory_id,
    barcode,
    stock_no,
    category,
    item_description,
    unit_of_measure,
    quantity,
    unit_price
  )
  values (
    p_preparation_id,
    v_scan.stock_inventory_id,
    v_scan.barcode,
    v_scan.stock_no,
    v_scan.category,
    v_scan.item_description,
    v_scan.unit_of_measure,
    p_quantity,
    p_unit_price
  )
  on conflict (preparation_id, barcode) do update
  set stock_inventory_id = excluded.stock_inventory_id,
      stock_no = excluded.stock_no,
      category = excluded.category,
      item_description = excluded.item_description,
      unit_of_measure = excluded.unit_of_measure,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      updated_at = now()
  returning item.id into v_item_id;

  return query
  select item.id,
         item.barcode,
         item.stock_inventory_id,
         item.stock_no,
         item.category,
         item.item_description,
         item.unit_of_measure,
         item.quantity,
         item.unit_price
  from public.tafi_stock_request_preparation_items as item
  where item.id = v_item_id;
end;
$$;

create or replace function public.tafi_admin_delete_stock_request_preparation_item(
  p_session_token uuid,
  p_preparation_id uuid,
  p_item_id uuid
)
returns boolean
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

  perform 1
  from public.tafi_stock_request_preparations as preparation
  where preparation.id = p_preparation_id
    and preparation.status = 'preparing'
  for update;
  if not found then
    raise exception 'This stock request is no longer being prepared.';
  end if;

  delete from public.tafi_stock_request_preparation_items as item
  where item.id = p_item_id
    and item.preparation_id = p_preparation_id;

  if not found then
    raise exception 'The prepared item was not found.';
  end if;
  return true;
end;
$$;

create or replace function public.tafi_admin_list_stock_request_preparation_items(
  p_session_token uuid,
  p_preparation_id uuid
)
returns table (
  item_id uuid,
  barcode text,
  stock_inventory_id uuid,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  quantity bigint,
  unit_price numeric
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

  if not exists (
    select 1
    from public.tafi_stock_request_preparations as preparation
    where preparation.id = p_preparation_id
  ) then
    raise exception 'Stock request preparation was not found.';
  end if;

  return query
  select item.id,
         item.barcode,
         item.stock_inventory_id,
         item.stock_no,
         item.category,
         item.item_description,
         item.unit_of_measure,
         item.quantity,
         item.unit_price
  from public.tafi_stock_request_preparation_items as item
  where item.preparation_id = p_preparation_id
  order by item.stock_no, item.barcode;
end;
$$;

create or replace function public.tafi_admin_list_stock_request_preparation_history(
  p_session_token uuid
)
returns table (
  preparation_id uuid,
  branch_name text,
  request_date date,
  status text,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  quantity bigint,
  unit_price numeric,
  barcode text,
  delivered_at timestamptz
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
  select preparation.id,
         branch.name,
         preparation.request_date,
         preparation.status,
         item.stock_no,
         item.category,
         item.item_description,
         item.unit_of_measure,
         item.quantity,
         item.unit_price,
         item.barcode,
         preparation.delivered_at
  from public.tafi_stock_request_preparations as preparation
  join public.branch as branch
    on branch.id = preparation.branch_id
  join public.tafi_stock_request_preparation_items as item
    on item.preparation_id = preparation.id
  where preparation.status = 'delivered'
  order by preparation.created_at desc, item.stock_no, item.barcode;
end;
$$;

create or replace function public.tafi_admin_complete_stock_request_preparation(
  p_session_token uuid,
  p_preparation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_preparation public.tafi_stock_request_preparations%rowtype;
  v_item record;
  v_request_count integer;
  v_delivery_date date := (now() at time zone 'Asia/Manila')::date;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  select preparation.*
  into v_preparation
  from public.tafi_stock_request_preparations as preparation
  where preparation.id = p_preparation_id
  for update;

  if not found or v_preparation.status <> 'preparing' then
    raise exception 'This stock request is no longer being prepared.';
  end if;

  perform request.id
  from public.branch_stock_requests as request
  where request.preparation_id = p_preparation_id
  order by request.stock_inventory_id, request.id
  for update;

  select count(*)::integer
  into v_request_count
  from public.branch_stock_requests as request
  where request.preparation_id = p_preparation_id
    and request.status = 'preparing';

  if v_request_count = 0 then
    raise exception 'There are no pending requests in this preparation.';
  end if;

  if exists (
    select 1
    from (
      select request.stock_inventory_id,
             sum(request.quantity_requested) as requested_quantity
      from public.branch_stock_requests as request
      where request.preparation_id = p_preparation_id
      group by request.stock_inventory_id
    ) as requested
    full join (
      select item.stock_inventory_id,
             sum(item.quantity) as prepared_quantity
      from public.tafi_stock_request_preparation_items as item
      where item.preparation_id = p_preparation_id
      group by item.stock_inventory_id
    ) as prepared
      on prepared.stock_inventory_id = requested.stock_inventory_id
    where coalesce(requested.requested_quantity, 0)
      <> coalesce(prepared.prepared_quantity, 0)
  ) then
    raise exception 'Prepared quantities must exactly match all requested quantities.';
  end if;

  for v_item in
    select item.barcode,
           item.stock_inventory_id,
           item.stock_no,
           item.item_description,
           item.unit_of_measure,
           item.quantity
    from public.tafi_stock_request_preparation_items as item
    where item.preparation_id = p_preparation_id
    order by item.barcode
    for update
  loop
    update public.tafi_admin_stock_in_scans as saved
    set scan_count = saved.scan_count - v_item.quantity,
        updated_at = now()
    where saved.barcode = v_item.barcode
      and saved.stock_no = v_item.stock_no
      and saved.scan_count >= v_item.quantity;

    if not found then
      raise exception 'Barcode % no longer has the prepared quantity available.', v_item.barcode;
    end if;

    insert into public.stock_out_records as saved (
      barcode,
      stock_no,
      item_description,
      unit_of_measure,
      stock_out_count,
      date
    )
    values (
      v_item.barcode,
      v_item.stock_no,
      v_item.item_description,
      v_item.unit_of_measure,
      v_item.quantity,
      v_delivery_date
    )
    on conflict on constraint stock_out_records_pkey do update
    set stock_no = excluded.stock_no,
        item_description = excluded.item_description,
        unit_of_measure = excluded.unit_of_measure,
        stock_out_count = saved.stock_out_count + excluded.stock_out_count;
  end loop;

  update public.branch_stock_requests as request
  set status = 'delivered',
      quantity_delivered = request.quantity_requested,
      delivered_at = now(),
      delivered_by_tafi_admin_id = v_tafi_admin_id
  where request.preparation_id = p_preparation_id
    and request.status = 'preparing';

  update public.tafi_stock_request_preparations
  set status = 'delivered',
      updated_at = now(),
      delivered_at = now()
  where id = p_preparation_id;

  return v_request_count;
end;
$$;

create or replace function public.tafi_admin_deliver_stock_requests(
  p_session_token uuid,
  p_request_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preparation_id uuid;
  v_request_count integer;
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    raise exception 'At least one stock request is required';
  end if;

  select (array_agg(request.preparation_id))[1], count(*)::integer
  into v_preparation_id, v_request_count
  from public.branch_stock_requests as request
  where request.id = any(p_request_ids)
    and request.status = 'preparing';

  if v_request_count <> cardinality(p_request_ids)
    or v_preparation_id is null
    or exists (
      select 1
      from public.branch_stock_requests as request
      where request.id = any(p_request_ids)
        and request.preparation_id <> v_preparation_id
    )
    or (
      select count(*)::integer
      from public.branch_stock_requests as request
      where request.preparation_id = v_preparation_id
        and request.status = 'preparing'
    ) <> cardinality(p_request_ids) then
    raise exception 'Requests must include every item in the same active preparation.';
  end if;

  return public.tafi_admin_complete_stock_request_preparation(
    p_session_token,
    v_preparation_id
  );
end;
$$;

create or replace function public.tafi_admin_deliver_stock_request_group(
  p_session_token uuid,
  p_request_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preparation_id uuid;
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  select (array_agg(request.preparation_id))[1]
  into v_preparation_id
  from public.branch_stock_requests as request
  where request.request_group_id = p_request_group_id
    and request.status = 'preparing';

  if v_preparation_id is null
    or exists (
      select 1
      from public.branch_stock_requests as request
      where request.request_group_id = p_request_group_id
        and (
          request.status <> 'preparing'
          or request.preparation_id <> v_preparation_id
        )
    ) then
    raise exception 'The request group must belong to one active preparation.';
  end if;

  perform public.tafi_admin_complete_stock_request_preparation(
    p_session_token,
    v_preparation_id
  );
  return p_request_group_id;
end;
$$;

revoke all on function public.tafi_admin_list_stock_requests(uuid) from public;
revoke all on function public.tafi_admin_start_stock_request_preparation(uuid, uuid[]) from public;
revoke all on function public.tafi_admin_lookup_stock_request_barcode(uuid, uuid, text) from public;
revoke all on function public.tafi_admin_save_stock_request_preparation_item(uuid, uuid, text, bigint, numeric) from public;
revoke all on function public.tafi_admin_delete_stock_request_preparation_item(uuid, uuid, uuid) from public;
revoke all on function public.tafi_admin_list_stock_request_preparation_items(uuid, uuid) from public;
revoke all on function public.tafi_admin_list_stock_request_preparation_history(uuid) from public;
revoke all on function public.tafi_admin_complete_stock_request_preparation(uuid, uuid) from public;
revoke all on function public.tafi_admin_deliver_stock_requests(uuid, uuid[]) from public;
revoke all on function public.tafi_admin_deliver_stock_request_group(uuid, uuid) from public;

grant execute on function public.tafi_admin_list_stock_requests(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_start_stock_request_preparation(uuid, uuid[]) to anon, authenticated;
grant execute on function public.tafi_admin_lookup_stock_request_barcode(uuid, uuid, text) to anon, authenticated;
grant execute on function public.tafi_admin_save_stock_request_preparation_item(uuid, uuid, text, bigint, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_delete_stock_request_preparation_item(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_request_preparation_items(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_request_preparation_history(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_complete_stock_request_preparation(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_deliver_stock_requests(uuid, uuid[]) to anon, authenticated;
grant execute on function public.tafi_admin_deliver_stock_request_group(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
