-- Run after tafi_admin_stock_in_scan_price.sql and
-- accountant_tafi_barcode_records.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.accountant_session') is null then
    raise exception 'Install TAFI barcode inventory and Accountant session migrations first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tafi_admin_stock_in_scans'
      and column_name = 'price'
  ) then
    raise exception 'Run tafi_admin_stock_in_scan_price.sql before this migration.';
  end if;
end;
$$;

alter table public.tafi_admin_stock_in_scans
  add column if not exists total_price numeric
  generated always as (price * scan_count) stored;

drop function if exists public.tafi_admin_list_stock_in_scans(uuid);
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

drop function if exists public.accountant_list_tafi_barcode_inventory(uuid);
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

drop function if exists public.tafi_admin_update_stock_in_scan_price(uuid, text, numeric);
create function public.tafi_admin_update_stock_in_scan_price(
  p_session_token uuid,
  p_barcode text,
  p_price numeric
)
returns table (
  barcode text,
  price numeric,
  total_price numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
  v_barcode_result text;
  v_price_result numeric;
  v_total_price_result numeric;
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  if v_barcode is null then
    raise exception 'A barcode is required.';
  end if;

  if p_price is not null and (
    p_price < 0
    or p_price > 9999999999.99
    or p_price <> round(p_price, 2)
  ) then
    raise exception 'Price must be zero or greater and have no more than two decimal places.';
  end if;

  update public.tafi_admin_stock_in_scans as saved
  set price = p_price,
      updated_at = now()
  where saved.barcode = v_barcode
  returning saved.barcode, saved.price, saved.total_price
  into v_barcode_result, v_price_result, v_total_price_result;

  if not found then
    raise exception 'The barcode was not found in Barcode Inventory.';
  end if;

  return query
  select v_barcode_result, v_price_result, v_total_price_result;
end;
$$;

revoke all on function public.tafi_admin_list_stock_in_scans(uuid)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_barcode_inventory(uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_update_stock_in_scan_price(uuid, text, numeric)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_list_stock_in_scans(uuid)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_barcode_inventory(uuid)
  to anon, authenticated;
grant execute on function public.tafi_admin_update_stock_in_scan_price(uuid, text, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
