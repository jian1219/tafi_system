-- Deletes only Holiday Regular Pay and Special Non-working Holiday source data
-- across all branches. Saved weekly payroll snapshots are retained, but their
-- holiday pay columns are cleared and net pay is reduced by those amounts.
-- Legacy payroll_item.other_earnings is not changed because it combines holiday
-- pay with other earnings and cannot be safely separated.
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
union all
select 'branch_weekly_payroll_snapshot_item', 'saved_holiday_pay', count(*)
from public.branch_weekly_payroll_snapshot_item
where holiday_regular_pay <> 0
  or special_nonworking_holiday_pay <> 0
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

update public.branch_weekly_payroll_snapshot_item
set net_pay = net_pay - holiday_regular_pay - special_nonworking_holiday_pay,
  holiday_regular_pay = 0,
  special_nonworking_holiday_pay = 0
where holiday_regular_pay <> 0
  or special_nonworking_holiday_pay <> 0;

commit;
