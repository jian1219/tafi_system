-- Permanently clears branch stock requests, including Purchase Order Request
-- Form entries and delivered rows shown under Receive Orders, plus receipt
-- history. This does not change inventory balances.
begin;

delete from public.branch_stock_receipt_history;
delete from public.branch_stock_requests;

commit;
