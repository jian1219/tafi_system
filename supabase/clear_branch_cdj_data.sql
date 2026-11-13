-- Permanently clears all Cash Disbursement Journal entries and their daily summaries
-- for every branch. Run only in the intended Supabase project.
begin;

truncate table public.branch_daily_summary_cdj, public.branch_cdj;

commit;
