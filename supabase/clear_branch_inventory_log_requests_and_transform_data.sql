-- Permanently clears branch daily inventory logs, stock requests and receipts,
-- and TAFI Inventory Transform preparation records.
-- This does not change current inventory balances or stock-in/out history.
begin;

do $$
begin
  if to_regclass('public.branch_inventory_daily_log') is null
    or to_regclass('public.branch_stock_receipt_history') is null
    or to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.tafi_stock_request_preparation_items') is null
    or to_regclass('public.tafi_stock_request_preparations') is null then
    raise exception
      'Required tables are missing. Install the branch inventory, stock request, receipt, and TAFI preparation migrations first.';
  end if;
end;
$$;

delete from public.branch_inventory_daily_log;
delete from public.branch_stock_receipt_history;
delete from public.branch_stock_requests;
delete from public.tafi_stock_request_preparation_items;
delete from public.tafi_stock_request_preparations;

commit;
