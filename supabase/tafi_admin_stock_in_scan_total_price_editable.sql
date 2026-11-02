-- Run after tafi_admin_stock_in_scan_total_price.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regprocedure('public.tafi_admin_list_inventory_information(uuid)') is null
    or to_regprocedure('public.accountant_list_tafi_barcode_inventory(uuid)') is null then
    raise exception 'Run TAFI barcode inventory and Accountant barcode inventory migrations first.';
  end if;
end;
$$;

drop function if exists public.tafi_admin_list_stock_in_scans(uuid);
drop function if exists public.accountant_list_tafi_barcode_inventory(uuid);
drop function if exists public.tafi_admin_update_stock_in_scan_price(uuid, text, numeric);

alter table public.tafi_admin_stock_in_scans
  add column total_price_migration numeric(31, 2);

update public.tafi_admin_stock_in_scans
set total_price_migration = total_price;

alter table public.tafi_admin_stock_in_scans
  drop constraint if exists tafi_admin_stock_in_scans_price_nonnegative;

alter table public.tafi_admin_stock_in_scans
  drop column total_price;

alter table public.tafi_admin_stock_in_scans
  drop column price;

alter table public.tafi_admin_stock_in_scans
  rename column total_price_migration to total_price;

alter table public.tafi_admin_stock_in_scans
  add constraint tafi_admin_stock_in_scans_total_price_nonnegative
  check (total_price is null or total_price >= 0);

alter table public.tafi_admin_stock_in_scans
  add column price numeric
  generated always as (total_price / nullif(scan_count, 0)) stored;

create function public.tafi_admin_list_stock_in_scans(
  p_session_token uuid
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  price numeric,
  total_price numeric,
  scan_count bigint,
  needs_stock_selection boolean,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  return query
  select saved.barcode,
         saved.stock_no,
         saved.item_description,
         saved.unit_of_measure,
         saved.price,
         saved.total_price,
         saved.scan_count,
         false,
         saved.updated_at,
         saved.created_at
  from public.tafi_admin_stock_in_scans as saved
  order by saved.stock_no, saved.barcode;
end;
$$;

create function public.accountant_list_tafi_barcode_inventory(
  p_session_token uuid
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  price numeric,
  total_price numeric,
  scan_count bigint,
  created_at timestamptz,
  updated_at timestamptz
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
  select saved.barcode,
         saved.stock_no,
         saved.item_description,
         saved.unit_of_measure,
         saved.price,
         saved.total_price,
         saved.scan_count,
         saved.created_at,
         saved.updated_at
  from public.tafi_admin_stock_in_scans as saved
  order by saved.stock_no, saved.barcode;
end;
$$;

create function public.tafi_admin_update_stock_in_scan_total_price(
  p_session_token uuid,
  p_barcode text,
  p_total_price numeric
)
returns table (
  barcode text,
  total_price numeric,
  price numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
  v_barcode_result text;
  v_total_price_result numeric;
  v_price_result numeric;
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  if v_barcode is null then
    raise exception 'A barcode is required.';
  end if;

  if p_total_price is not null and (
    p_total_price < 0
    or p_total_price > 999999999999999999999999999.99
    or p_total_price <> round(p_total_price, 2)
  ) then
    raise exception 'Total price must be zero or greater and have no more than two decimal places.';
  end if;

  update public.tafi_admin_stock_in_scans as saved
  set total_price = p_total_price,
      updated_at = now()
  where saved.barcode = v_barcode
  returning saved.barcode, saved.total_price, saved.price
  into v_barcode_result, v_total_price_result, v_price_result;

  if not found then
    raise exception 'The barcode was not found in Barcode Inventory.';
  end if;

  return query
  select v_barcode_result, v_total_price_result, v_price_result;
end;
$$;

revoke all on function public.tafi_admin_list_stock_in_scans(uuid)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_barcode_inventory(uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_update_stock_in_scan_total_price(uuid, text, numeric)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_list_stock_in_scans(uuid)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_barcode_inventory(uuid)
  to anon, authenticated;
grant execute on function public.tafi_admin_update_stock_in_scan_total_price(uuid, text, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
