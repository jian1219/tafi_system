-- Run after tafi_stock_inventory_barcode_balance.sql and
-- tafi_admin_inventory_item_management.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_stock_inventory') is null
    or to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.tafi_admin_session') is null then
    raise exception 'Run the TAFI stock inventory, barcode scan, and TAFI Admin migrations first.';
  end if;

  if to_regprocedure('public.tafi_sync_stock_available_for_stock_no(text)') is null then
    raise exception 'Run tafi_stock_inventory_barcode_balance.sql before this migration.';
  end if;

  if to_regprocedure('public.tafi_admin_create_stock_inventory_for_catalog_item()') is null then
    raise exception 'Run tafi_admin_inventory_item_management.sql before this migration.';
  end if;

  if to_regprocedure('public.tafi_sync_stock_available_from_scan_change()') is null
    or to_regprocedure('public.tafi_sync_stock_available_after_stock_change()') is null
    or to_regprocedure('public.tafi_admin_deduct_stock_inventory(uuid, numeric)') is null then
    raise exception 'The stock balance synchronization or delivery function is missing.';
  end if;
end;
$$;

create table if not exists public.inventory_add_manually_history (
  id uuid primary key default gen_random_uuid(),
  stock_no text not null,
  item_description text not null,
  unit_of_measure text not null,
  manually_add bigint not null check (manually_add > 0),
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_add_manually_history_date_idx
  on public.inventory_add_manually_history (date desc, created_at desc);

alter table public.inventory_add_manually_history enable row level security;
revoke all on table public.inventory_add_manually_history from public, anon, authenticated;

alter table public.tafi_stock_inventory
  add column if not exists manual_available numeric(14, 3) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.tafi_stock_inventory'::regclass
      and conname = 'tafi_stock_inventory_manual_available_whole_check'
  ) then
    alter table public.tafi_stock_inventory
      add constraint tafi_stock_inventory_manual_available_whole_check
      check (manual_available >= 0 and manual_available = trunc(manual_available));
  end if;
end;
$$;

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
  ), 0::numeric) + stock.manual_available
  where stock.stock_no = p_stock_no;
end;
$$;

drop trigger if exists tafi_stock_item_available_sync
  on public.tafi_stock_inventory;
create trigger tafi_stock_item_available_sync
after insert or update of stock_no, manual_available
on public.tafi_stock_inventory
for each row
execute function public.tafi_sync_stock_available_after_stock_change();

update public.tafi_stock_inventory as stock
set available = coalesce((
  select sum(saved.scan_count)::numeric
  from public.tafi_admin_stock_in_scans as saved
  where saved.stock_no = stock.stock_no
), 0::numeric) + stock.manual_available;

drop function if exists public.tafi_admin_add_manual_stock_inventory(uuid, uuid, numeric);
drop function if exists public.tafi_admin_add_manual_stock_inventory(uuid, uuid, numeric, date);

create function public.tafi_admin_add_manual_stock_inventory(
  p_session_token uuid,
  p_stock_inventory_id uuid,
  p_quantity numeric,
  p_date date default current_date
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manual_available numeric;
  v_available numeric;
  v_stock_no text;
  v_item_description text;
  v_unit_of_measure text;
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_stock_inventory_id is null then
    raise exception 'A TAFI stock item is required.';
  end if;

  if p_date is null then
    raise exception 'A manual stock addition date is required.';
  end if;

  if p_quantity is null
    or p_quantity <= 0
    or p_quantity <> trunc(p_quantity)
    or p_quantity > 99999999999 then
    raise exception 'Quantity to add must be a whole number greater than zero.';
  end if;

  select stock.manual_available,
         stock.available,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure
  into v_manual_available, v_available,
       v_stock_no, v_item_description, v_unit_of_measure
  from public.tafi_stock_inventory as stock
  where stock.id = p_stock_inventory_id
  for update;

  if not found then
    raise exception 'The selected TAFI stock item no longer exists.';
  end if;

  if v_manual_available > 99999999999 - p_quantity then
    raise exception 'The manual quantity would exceed the maximum supported stock balance.';
  end if;

  if v_available > 99999999999 - p_quantity then
    raise exception 'The quantity would exceed the maximum supported stock balance.';
  end if;

  update public.tafi_stock_inventory
  set manual_available = manual_available + p_quantity
  where id = p_stock_inventory_id;

  insert into public.inventory_add_manually_history (
    stock_no,
    item_description,
    unit_of_measure,
    manually_add,
    date
  )
  values (
    v_stock_no,
    v_item_description,
    v_unit_of_measure,
    p_quantity::bigint,
    p_date
  );

  select stock.available
  into v_available
  from public.tafi_stock_inventory as stock
  where stock.id = p_stock_inventory_id;

  return v_available;
end;
$$;

create or replace function public.tafi_admin_list_manual_stock_inventory_history(
  p_session_token uuid
)
returns table (
  history_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  manually_add bigint,
  date date,
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
  select history.id,
         history.stock_no,
         history.item_description,
         history.unit_of_measure,
         history.manually_add,
         history.date,
         history.created_at
  from public.inventory_add_manually_history as history
  order by history.date desc, history.created_at desc, history.id desc;
end;
$$;

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
  v_manual_available numeric;
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

  select stock.available, stock.manual_available
  into v_available, v_manual_available
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

  if v_remaining > 0 then
    if v_manual_available < v_remaining then
      raise exception 'Barcode and manual stock do not contain enough quantity to fulfill this delivery';
    end if;

    update public.tafi_stock_inventory
    set manual_available = manual_available - v_remaining
    where id = p_stock_inventory_id;
  end if;
end;
$$;

revoke all on function public.tafi_sync_stock_available_for_stock_no(text)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_add_manual_stock_inventory(uuid, uuid, numeric, date)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_manual_stock_inventory_history(uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_deduct_stock_inventory(uuid, numeric)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_add_manual_stock_inventory(uuid, uuid, numeric, date)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_manual_stock_inventory_history(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
