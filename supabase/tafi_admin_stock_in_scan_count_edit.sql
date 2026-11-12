-- Run after tafi_admin_stock_in_scans.sql and tafi_stock_inventory_barcode_balance.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.tafi_admin_session') is null then
    raise exception 'Install TAFI Admin barcode inventory and session migrations first.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.tafi_admin_stock_in_scans'::regclass
      and tgname = 'tafi_stock_scan_available_sync'
      and not tgisinternal
  ) then
    raise exception 'Install tafi_stock_inventory_barcode_balance.sql before this migration.';
  end if;
end;
$$;

do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'tafi_admin_update_stock_inventory_available'
  loop
    execute format('drop function %s', v_function.signature);
  end loop;
end;
$$;

create or replace function public.tafi_admin_update_stock_in_scan_count(
  p_session_token uuid,
  p_barcode text,
  p_scan_count bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
  v_updated_count bigint;
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

  if p_scan_count is null or p_scan_count < 0 or p_scan_count > 99999999999 then
    raise exception 'Item count must be a whole number from 0 to 99,999,999,999.';
  end if;

  update public.tafi_admin_stock_in_scans as saved
  set scan_count = p_scan_count,
      updated_at = now()
  where saved.barcode = v_barcode
  returning saved.scan_count into v_updated_count;

  if not found then
    raise exception 'The barcode was not found in Barcode Inventory.';
  end if;

  return v_updated_count;
end;
$$;

create or replace function public.tafi_admin_delete_stock_in_scan(
  p_session_token uuid,
  p_barcode text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
  v_scan_count bigint;
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

  select saved.scan_count
  into v_scan_count
  from public.tafi_admin_stock_in_scans as saved
  where saved.barcode = v_barcode
  for update;

  if not found then
    raise exception 'The barcode was not found in Barcode Inventory.';
  end if;
  if v_scan_count <> 0 then
    raise exception 'Only barcode items with a count of zero can be deleted.';
  end if;

  delete from public.tafi_admin_stock_in_scans as saved
  where saved.barcode = v_barcode;

  return v_barcode;
end;
$$;

revoke all on function public.tafi_admin_update_stock_in_scan_count(uuid, text, bigint)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_delete_stock_in_scan(uuid, text)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_update_stock_in_scan_count(uuid, text, bigint)
  to anon, authenticated;
grant execute on function public.tafi_admin_delete_stock_in_scan(uuid, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
