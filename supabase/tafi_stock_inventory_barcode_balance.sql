-- Run after tafi_stock_inventory.sql, tafi_admin_stock_in_scans.sql,
-- branch_inventory.sql, branch_stock_requests.sql,
-- stock_request_delivery_receipt.sql, and branch_stock_request_batches.sql.
-- Makes tafi_stock_inventory.available the stored total of barcode scan counts.
begin;

do $$
begin
  if to_regclass('public.tafi_stock_inventory') is null
    or to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.branch_inventory') is null
    or to_regclass('public.branch_stock_receipt_history') is null then
    raise exception 'Install TAFI Stock Inventory, Barcode Inventory, and Branch Stock Request migrations before this migration.';
  end if;
end;
$$;

drop function if exists public.tafi_admin_list_stock_inventory(uuid);
drop function if exists public.accountant_list_tafi_stock_inventory(uuid);
drop function if exists public.branch_admin_list_tafi_stock_items(uuid);
drop function if exists public.tafi_admin_create_stock_inventory(uuid, uuid, numeric);
drop function if exists public.tafi_admin_create_stock_inventory(uuid, uuid);

alter table public.tafi_stock_inventory
  drop column if exists available,
  drop column if exists onhand,
  drop column if exists allocated;

alter table public.tafi_stock_inventory
  add column available numeric(14, 3) not null default 0;

alter table public.tafi_stock_inventory
  drop constraint if exists tafi_stock_inventory_available_whole_check,
  add constraint tafi_stock_inventory_available_whole_check
    check (available >= 0 and available = trunc(available));

create or replace function public.tafi_sync_stock_available_for_stock_no(
  p_stock_no text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.tafi_stock_inventory as stock
  where stock.stock_no = p_stock_no
  for update;

  update public.tafi_stock_inventory as stock
  set available = coalesce((
    select sum(saved.scan_count)::numeric
    from public.tafi_admin_stock_in_scans as saved
    where saved.stock_no = p_stock_no
  ), 0::numeric)
  where stock.stock_no = p_stock_no;
end;
$$;

create or replace function public.tafi_sync_stock_available_from_scan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.tafi_sync_stock_available_for_stock_no(new.stock_no);
  elsif tg_op = 'DELETE' then
    perform public.tafi_sync_stock_available_for_stock_no(old.stock_no);
  else
    if old.stock_no is distinct from new.stock_no then
      perform public.tafi_sync_stock_available_for_stock_no(old.stock_no);
    end if;
    perform public.tafi_sync_stock_available_for_stock_no(new.stock_no);
  end if;

  return null;
end;
$$;

create or replace function public.tafi_sync_stock_available_after_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_sync_stock_available_for_stock_no(new.stock_no);
  return null;
end;
$$;

drop trigger if exists tafi_stock_scan_available_sync
  on public.tafi_admin_stock_in_scans;
create trigger tafi_stock_scan_available_sync
after insert or update or delete on public.tafi_admin_stock_in_scans
for each row execute function public.tafi_sync_stock_available_from_scan_change();

drop trigger if exists tafi_stock_item_available_sync
  on public.tafi_stock_inventory;
create trigger tafi_stock_item_available_sync
after insert or update of stock_no on public.tafi_stock_inventory
for each row execute function public.tafi_sync_stock_available_after_stock_change();

update public.tafi_stock_inventory as stock
set available = coalesce((
  select sum(saved.scan_count)::numeric
  from public.tafi_admin_stock_in_scans as saved
  where saved.stock_no = stock.stock_no
), 0::numeric);

create or replace function public.tafi_admin_deduct_stock_inventory(
  p_stock_inventory_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock_no text;
  v_available numeric;
  v_remaining bigint;
  v_deduct bigint;
  v_barcode record;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) then
    raise exception 'Delivery quantity must be a whole number greater than zero';
  end if;

  select stock.stock_no
  into v_stock_no
  from public.tafi_stock_inventory as stock
  where stock.id = p_stock_inventory_id;

  if not found then
    raise exception 'TAFI stock item was not found';
  end if;

  for v_barcode in
    select saved.barcode
    from public.tafi_admin_stock_in_scans as saved
    where saved.stock_no = v_stock_no
      and saved.scan_count > 0
    order by saved.barcode
    for update
  loop
    null;
  end loop;

  select stock.available
  into v_available
  from public.tafi_stock_inventory as stock
  where stock.id = p_stock_inventory_id
  for update;

  if v_available < p_quantity then
    raise exception 'Delivered quantity exceeds current available TAFI stock';
  end if;

  v_remaining := p_quantity::bigint;
  for v_barcode in
    select saved.barcode, saved.scan_count
    from public.tafi_admin_stock_in_scans as saved
    where saved.stock_no = v_stock_no
      and saved.scan_count > 0
    order by saved.barcode
    for update
  loop
    exit when v_remaining = 0;
    v_deduct := least(v_barcode.scan_count, v_remaining);

    update public.tafi_admin_stock_in_scans
    set scan_count = scan_count - v_deduct,
        updated_at = now()
    where barcode = v_barcode.barcode;

    v_remaining := v_remaining - v_deduct;
  end loop;

  if v_remaining <> 0 then
    raise exception 'Barcode Inventory does not contain enough stock to fulfill this delivery';
  end if;
end;
$$;

revoke all on function public.tafi_sync_stock_available_for_stock_no(text) from public, anon, authenticated;
revoke all on function public.tafi_sync_stock_available_from_scan_change() from public, anon, authenticated;
revoke all on function public.tafi_sync_stock_available_after_stock_change() from public, anon, authenticated;
revoke all on function public.tafi_admin_deduct_stock_inventory(uuid, numeric) from public, anon, authenticated;

create function public.tafi_admin_list_stock_inventory(p_session_token uuid)
returns table (
  stock_inventory_id uuid,
  inventory_id uuid,
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
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select stock.id, stock.inventory_id, stock.stock_no, stock.item_description,
         stock.unit_of_measure, inventory.category, stock.available, stock.created_at
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory on inventory.id = stock.inventory_id
  order by inventory.stock_no, stock.created_at desc;
end;
$$;

create function public.accountant_list_tafi_stock_inventory(p_session_token uuid)
returns table (
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
    select 1 from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select stock.id, stock.stock_no, stock.item_description, stock.unit_of_measure,
         inventory.category, stock.available, stock.created_at
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory on inventory.id = stock.inventory_id
  order by inventory.stock_no, stock.created_at desc;
end;
$$;

create function public.branch_admin_list_tafi_stock_items(p_session_token uuid)
returns table (
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
    select 1 from public.branch_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select stock.id, stock.stock_no, stock.item_description, stock.unit_of_measure,
         inventory.category, stock.available
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory on inventory.id = stock.inventory_id
  order by inventory.category, stock.stock_no;
end;
$$;

create function public.tafi_admin_create_stock_inventory(
  p_session_token uuid,
  p_inventory_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock_inventory_id uuid;
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_inventory_id is null then
    raise exception 'An inventory item is required';
  end if;

  insert into public.tafi_stock_inventory (
    inventory_id, stock_no, item_description, unit_of_measure
  )
  select inventory.id, inventory.stock_no, inventory.item_description,
         inventory.unit_of_measure
  from public.inventory_information as inventory
  where inventory.id = p_inventory_id
  returning id into v_stock_inventory_id;

  if not found then
    raise exception 'The selected inventory item does not exist';
  end if;
  return v_stock_inventory_id;
end;
$$;

revoke all on function public.tafi_admin_list_stock_inventory(uuid) from public;
revoke all on function public.accountant_list_tafi_stock_inventory(uuid) from public;
revoke all on function public.branch_admin_list_tafi_stock_items(uuid) from public;
revoke all on function public.tafi_admin_create_stock_inventory(uuid, uuid) from public;
grant execute on function public.tafi_admin_list_stock_inventory(uuid) to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_inventory(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_tafi_stock_items(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_create_stock_inventory(uuid, uuid) to anon, authenticated;

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
    branch_id, stock_inventory_id, quantity_requested
  )
  values (v_branch_id, p_stock_inventory_id, p_quantity_requested)
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
    from jsonb_to_recordset(p_items) as item(stock_inventory_id uuid, quantity_requested numeric)
    where item.stock_inventory_id is null
      or item.quantity_requested is null
      or item.quantity_requested <= 0
      or item.quantity_requested <> trunc(item.quantity_requested)
  ) then
    raise exception 'Each request item needs a stock item and a whole-number quantity greater than zero';
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
    left join public.tafi_stock_inventory as stock on stock.id = item.stock_inventory_id
    where stock.id is null
  ) then
    raise exception 'A selected TAFI stock item no longer exists';
  end if;

  v_request_group_id := gen_random_uuid();
  insert into public.branch_stock_requests (
    request_group_id, branch_id, stock_inventory_id, quantity_requested
  )
  select v_request_group_id, v_branch_id, item.stock_inventory_id, item.quantity_requested
  from jsonb_to_recordset(p_items) as item(stock_inventory_id uuid, quantity_requested numeric);
  return v_request_group_id;
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
  join public.branch_admin as branch_admin on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();
  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_quantity_received is null or p_quantity_received < 0
    or p_quantity_received <> trunc(p_quantity_received) then
    raise exception 'Counted quantity must be a whole number zero or greater';
  end if;

  select request.stock_inventory_id, request.quantity_requested,
         request.quantity_delivered, request.status
  into v_stock_inventory_id, v_quantity_requested, v_quantity_delivered, v_status
  from public.branch_stock_requests as request
  where request.id = p_request_id and request.branch_id = v_branch_id
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

  insert into public.branch_inventory (branch_id, stock_inventory_id, available)
  values (v_branch_id, v_stock_inventory_id, p_quantity_received)
  on conflict (branch_id, stock_inventory_id)
  do update set available = public.branch_inventory.available + excluded.available;

  insert into public.branch_stock_receipt_history (
    request_id, branch_id, stock_inventory_id, quantity_requested,
    quantity_delivered, quantity_received, received_by_branch_admin_id
  )
  values (
    p_request_id, v_branch_id, v_stock_inventory_id, v_quantity_requested,
    v_quantity_delivered, p_quantity_received, v_branch_admin_id
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
  select admin_session.tafi_admin_id into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();
  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_quantity_delivered is null or p_quantity_delivered <= 0
    or p_quantity_delivered <> trunc(p_quantity_delivered) then
    raise exception 'Delivered quantity must be a whole number greater than zero';
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
  if v_quantity_requested is null or v_quantity_requested <= 0
    or v_quantity_requested <> trunc(v_quantity_requested) then
    raise exception 'Requested quantity must be a whole number greater than zero';
  end if;
  if p_quantity_delivered > v_quantity_requested then
    raise exception 'Delivered quantity cannot exceed the requested quantity';
  end if;

  perform public.tafi_admin_deduct_stock_inventory(v_stock_inventory_id, p_quantity_delivered);
  update public.branch_stock_requests
  set status = 'delivered',
      quantity_delivered = p_quantity_delivered,
      delivered_at = now(),
      delivered_by_tafi_admin_id = v_tafi_admin_id
  where id = p_request_id;
  return p_request_id;
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
  v_tafi_admin_id uuid;
  v_request record;
  v_found_request boolean := false;
begin
  select admin_session.tafi_admin_id into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();
  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_request_group_id is null then
    raise exception 'A stock request group is required';
  end if;

  for v_request in
    select request.id, request.stock_inventory_id,
           request.quantity_requested, request.status
    from public.branch_stock_requests as request
    where request.request_group_id = p_request_group_id
    order by request.stock_inventory_id, request.id
    for update
  loop
    v_found_request := true;
    if v_request.status <> 'pending' then
      raise exception 'Only orders with pending items can be marked delivered';
    end if;
    if v_request.quantity_requested is null or v_request.quantity_requested <= 0
      or v_request.quantity_requested <> trunc(v_request.quantity_requested) then
      raise exception 'Requested quantity must be a whole number greater than zero';
    end if;
    perform public.tafi_admin_deduct_stock_inventory(
      v_request.stock_inventory_id, v_request.quantity_requested
    );
    update public.branch_stock_requests
    set status = 'delivered',
        quantity_delivered = v_request.quantity_requested,
        delivered_at = now(),
        delivered_by_tafi_admin_id = v_tafi_admin_id
    where id = v_request.id;
  end loop;
  if not v_found_request then
    raise exception 'Stock request order was not found';
  end if;
  return p_request_group_id;
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
  v_tafi_admin_id uuid;
  v_request record;
  v_request_count integer;
  v_branch_count integer;
  v_request_date_count integer;
begin
  select admin_session.tafi_admin_id into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();
  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    raise exception 'At least one stock request is required';
  end if;

  select count(*)::integer,
         count(distinct request.branch_id)::integer,
         count(distinct (request.created_at at time zone 'Asia/Manila')::date)::integer
  into v_request_count, v_branch_count, v_request_date_count
  from public.branch_stock_requests as request
  where request.id = any(p_request_ids);
  if v_request_count <> cardinality(p_request_ids) then
    raise exception 'One or more stock requests are missing or duplicated';
  end if;
  if v_branch_count <> 1 or v_request_date_count <> 1 then
    raise exception 'Requests must belong to the same branch and request date';
  end if;

  for v_request in
    select request.id, request.stock_inventory_id,
           request.quantity_requested, request.status
    from public.branch_stock_requests as request
    where request.id = any(p_request_ids)
    order by request.stock_inventory_id, request.id
    for update
  loop
    if v_request.status <> 'pending' then
      raise exception 'Only pending stock requests can be marked delivered';
    end if;
    if v_request.quantity_requested is null or v_request.quantity_requested <= 0
      or v_request.quantity_requested <> trunc(v_request.quantity_requested) then
      raise exception 'Requested quantity must be a whole number greater than zero';
    end if;
    perform public.tafi_admin_deduct_stock_inventory(
      v_request.stock_inventory_id, v_request.quantity_requested
    );
    update public.branch_stock_requests
    set status = 'delivered',
        quantity_delivered = v_request.quantity_requested,
        delivered_at = now(),
        delivered_by_tafi_admin_id = v_tafi_admin_id
    where id = v_request.id;
  end loop;
  return v_request_count;
end;
$$;

revoke all on function public.branch_admin_create_stock_request_batch(uuid, jsonb) from public;
revoke all on function public.branch_admin_create_stock_request(uuid, uuid, numeric) from public;
revoke all on function public.branch_admin_receive_stock_request(uuid, uuid, numeric) from public;
revoke all on function public.tafi_admin_deliver_stock_request(uuid, uuid, numeric) from public;
revoke all on function public.tafi_admin_deliver_stock_request_group(uuid, uuid) from public;
revoke all on function public.tafi_admin_deliver_stock_requests(uuid, uuid[]) from public;
grant execute on function public.branch_admin_create_stock_request_batch(uuid, jsonb) to anon, authenticated;
grant execute on function public.branch_admin_create_stock_request(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.branch_admin_receive_stock_request(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_deliver_stock_request(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_deliver_stock_request_group(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_deliver_stock_requests(uuid, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
