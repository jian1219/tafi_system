-- Run after tafi_admin_stock_in_scans.sql and the TAFI Admin inventory RPC.
begin;

do $$
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null then
    raise exception 'Run tafi_admin_stock_in_scans.sql before this migration.';
  end if;
  if to_regprocedure('public.tafi_admin_list_inventory_information(uuid)') is null then
    raise exception 'The session-validating inventory RPC is missing; install the TAFI Admin inventory migration first.';
  end if;
end;
$$;

alter table public.tafi_admin_stock_in_scans
  add column if not exists price numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.tafi_admin_stock_in_scans'::regclass
      and conname = 'tafi_admin_stock_in_scans_price_nonnegative'
  ) then
    alter table public.tafi_admin_stock_in_scans
      add constraint tafi_admin_stock_in_scans_price_nonnegative
      check (price is null or price >= 0);
  end if;
end;
$$;

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
         saved.scan_count,
         false,
         saved.updated_at,
         saved.created_at
  from public.tafi_admin_stock_in_scans as saved
  order by saved.stock_no, saved.barcode;
end;
$$;

create or replace function public.tafi_admin_update_stock_in_scan_price(
  p_session_token uuid,
  p_barcode text,
  p_price numeric
)
returns table (
  barcode text,
  price numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
  v_barcode_result text;
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
  returning saved.barcode, saved.price
  into v_barcode_result, v_price_result;

  if not found then
    raise exception 'The barcode was not found in Barcode Inventory.';
  end if;

  return query
  select v_barcode_result, v_price_result;
end;
$$;

revoke all on function public.tafi_admin_list_stock_in_scans(uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_update_stock_in_scan_price(uuid, text, numeric)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_list_stock_in_scans(uuid)
  to anon, authenticated;
grant execute on function public.tafi_admin_update_stock_in_scan_price(uuid, text, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
