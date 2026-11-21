-- Permanently clears My Request Stock, Receive Orders, Branch Stock Record,
-- Branch Stock Requests, and Inventory Transform Form data for every branch.
-- This does not change branch inventory balances or daily inventory logs.
begin;

do $$
begin
  if to_regclass('public.branch_stock_in_record') is null
    or to_regclass('public.branch_stock_receipt_history') is null
    or to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.tafi_stock_request_preparation_items') is null
    or to_regclass('public.tafi_stock_request_preparations') is null then
    raise exception
      'Required stock request, receipt history, stock-in record, or Inventory Transform table is missing.';
  end if;
end;
$$;

delete from public.branch_stock_in_record;
delete from public.branch_stock_receipt_history;
delete from public.branch_stock_requests;
delete from public.tafi_stock_request_preparation_items;
delete from public.tafi_stock_request_preparations;

commit;
