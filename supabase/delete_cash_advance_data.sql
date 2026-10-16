-- Deletes cash-advance records across all branches.
-- Saved payroll runs and their historical deductions are not changed.
--
-- Optional preview: run this query by itself before running the transaction.
/*
select 'branch_employee_cash_advance' as table_name, count(*) as rows_to_delete
from public.branch_employee_cash_advance
union all
select 'branch_employee_cash_advance_loan', count(*)
from public.branch_employee_cash_advance_loan
union all
select 'branch_employee_cash_advance_payment', count(*)
from public.branch_employee_cash_advance_payment;
*/

begin;

delete from public.branch_employee_cash_advance_payment;
delete from public.branch_employee_cash_advance_loan;
delete from public.branch_employee_cash_advance;

commit;
