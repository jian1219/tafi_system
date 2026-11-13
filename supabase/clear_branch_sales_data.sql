-- Permanently clear Sales data for every branch.
-- This removes Cash Receipts Journal entries, targets, deposits, and their daily summaries.
-- It keeps the tables, functions, and dashboard sections in place.
begin;

truncate table
  public.daily_summary_crj,
  public.targets,
  public.deposit,
  public.cash_receipts_journal;

commit;
