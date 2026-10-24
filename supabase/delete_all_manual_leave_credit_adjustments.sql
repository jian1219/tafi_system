-- Deletes manually added leave-credit adjustments across all branches.
-- Filed leave requests and attendance records are not changed.
-- The displayed leave-credit balance will be recalculated from the remaining data.

-- Preview the adjustment rows and credits that will be removed:
select branch_id, count(*) as adjustments_to_delete, sum(credit_days) as credits_to_remove
from public.branch_employee_leave_credit_adjustment
group by branch_id
order by branch_id;

-- Run only after confirming the preview:
begin;

delete from public.branch_employee_leave_credit_adjustment;

commit;
