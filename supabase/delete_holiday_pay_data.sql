-- Deletes only Holiday Regular Pay and Special Non-working Holiday source data
-- across all branches. Payroll runs and their saved payroll items are not changed.
--
-- Optional preview: run this query by itself first to review what will be deleted.
/*
select 'branch_employee_holiday_pay' as table_name, addition_type, count(*) as rows_to_delete
from public.branch_employee_holiday_pay
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday')
group by addition_type
union all
select 'branch_employee_holiday_pay_base', addition_type, count(*)
from public.branch_employee_holiday_pay_base
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday')
group by addition_type
union all
select 'branch_employee_holiday_pay_rule', addition_type, count(*)
from public.branch_employee_holiday_pay_rule
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday')
group by addition_type
union all
select 'branch_employee_payroll_addition', addition_type, count(*)
from public.branch_employee_payroll_addition
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday')
group by addition_type
order by table_name, addition_type;
*/

-- Run the transaction below only after confirming the preview.
begin;

delete from public.branch_employee_holiday_pay
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday');

delete from public.branch_employee_holiday_pay_base
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday');

delete from public.branch_employee_holiday_pay_rule
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday');

delete from public.branch_employee_payroll_addition
where addition_type in ('holiday_regular_pay', 'special_nonworking_holiday');

commit;
