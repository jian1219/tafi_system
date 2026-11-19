-- Run after tafi_stock_records_total_price.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.stock_in_records') is null
    or to_regclass('public.stock_out_records') is null
    or to_regprocedure('public.tafi_admin_list_inventory_information(uuid)') is null then
    raise exception 'Install TAFI Admin barcode and stock-record price migrations first.';
  end if;
end;
$$;

create or replace function public.tafi_admin_update_stock_in_scan_prices_by_stock_no(
  p_session_token uuid,
  p_stock_no text,
  p_unit_price numeric
)
returns table (updated_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stock_no text := nullif(btrim(p_stock_no), '');
  v_updated_barcodes text[];
  v_updated_count integer;
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  if v_stock_no is null then
    raise exception 'A stock number is required.';
  end if;

  if p_unit_price is null or p_unit_price < 0
    or p_unit_price > 99999999999999999999999999999.99
    or p_unit_price <> round(p_unit_price, 2) then
    raise exception 'Per item price must be zero or greater and have no more than two decimal places.';
  end if;

  perform 1
  from public.tafi_admin_stock_in_scans as saved
  where saved.stock_no = v_stock_no
  order by saved.barcode
  for update;

  if not found then
    raise exception 'No barcode items were found for this stock number.';
  end if;

  if exists (
    select 1
    from public.tafi_admin_stock_in_scans as saved
    where saved.stock_no = v_stock_no
      and saved.price is null
      and saved.scan_count <= 0
  ) then
    raise exception 'Every barcode for this stock number must have a positive item count before setting its per item price.';
  end if;

  if exists (
    select 1
    from public.tafi_admin_stock_in_scans as saved
    where saved.stock_no = v_stock_no
      and saved.price is null
      and p_unit_price * saved.scan_count
        > 99999999999999999999999999999.99
  ) then
    raise exception 'The calculated total price exceeds the supported limit.';
  end if;

  with updated_scans as (
    update public.tafi_admin_stock_in_scans as saved
    set price = p_unit_price,
        updated_at = now()
    where saved.stock_no = v_stock_no
      and saved.price is null
    returning saved.barcode
  )
  select array_agg(updated_scans.barcode), count(*)::integer
  into v_updated_barcodes, v_updated_count
  from updated_scans;

  if v_updated_count = 0 then
    raise exception 'All barcode items for this stock number already have a per item price.';
  end if;

  update public.stock_in_records as saved
  set price = p_unit_price
  where saved.barcode = any(v_updated_barcodes);

  update public.stock_out_records as saved
  set price = p_unit_price
  where saved.barcode = any(v_updated_barcodes);

  return query select v_updated_count;
end;
$$;

revoke all on function public.tafi_admin_update_stock_in_scan_prices_by_stock_no(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.tafi_admin_update_stock_in_scan_prices_by_stock_no(uuid, text, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
