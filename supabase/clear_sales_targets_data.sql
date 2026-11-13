-- Permanently clear saved Sales Targets for every branch.
-- This does not delete Cash Receipts Journal entries or recurring target settings.
begin;

delete from public.targets;

commit;
