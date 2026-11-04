-- Permanently clears TAFI barcode inventory, Stock In, Stock Out, and COGS data.
-- This deletes rows only; it does not drop tables or clear other inventory data.
begin;

do $$
declare
  deleted_rows bigint;
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.stock_in_records') is null
    or to_regclass('public.stock_out_records') is null
    or to_regclass('public.tafi_summary_stock_record') is null then
    raise exception 'One or more TAFI barcode or stock-record tables were not found; no data was deleted.';
  end if;

  delete from public.stock_in_records;
  get diagnostics deleted_rows = row_count;
  raise notice 'Deleted % rows from public.stock_in_records.', deleted_rows;

  delete from public.stock_out_records;
  get diagnostics deleted_rows = row_count;
  raise notice 'Deleted % rows from public.stock_out_records.', deleted_rows;

  delete from public.tafi_summary_stock_record;
  get diagnostics deleted_rows = row_count;
  raise notice 'Deleted % rows from public.tafi_summary_stock_record (COGS).', deleted_rows;

  delete from public.tafi_admin_stock_in_scans;
  get diagnostics deleted_rows = row_count;
  raise notice 'Deleted % rows from public.tafi_admin_stock_in_scans (TAFI Barcode Inventory).', deleted_rows;
end;
$$;

commit;
