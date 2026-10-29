-- Permanently removes inventory, stock, request, and branch usage data.
-- Tables are kept; this script does not reset inventory IDs or affect branches.
begin;

do $$
declare
  table_name text;
begin
  if to_regclass('public.inventory_information') is null then
    raise exception 'Required table public.inventory_information was not found.';
  end if;
  if to_regclass('public.tafi_stock_inventory') is null then
    raise exception 'Required table public.tafi_stock_inventory was not found.';
  end if;
  if to_regclass('public.branch_stock_requests') is null then
    raise exception 'Required table public.branch_stock_requests was not found.';
  end if;

  for table_name in
    select unnest(array[
      'branch_stock_receipt_history',
      'branch_stock_requests',
      'branch_inventory_daily_log',
      'branch_inventory',
      'tafi_stock_inventory_arrivals',
      'stock_in_records',
      'stock_out_records',
      'tafi_admin_stock_in_scans',
      'tafi_stock_inventory',
      'inventory_information',
      'accountant_inventory_information',
      'tafi_inventory_information',
      'tafi_invintory_information'
    ])
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('delete from public.%I', table_name);
      raise notice 'Cleared public.%', table_name;
    else
      raise notice 'Skipped public.%: table does not exist.', table_name;
    end if;
  end loop;
end;
$$;

commit;
