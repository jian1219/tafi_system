-- Deletes filed leave requests for one branch.
-- Attached files are deleted automatically through the request attachment foreign key.
-- Attendance records and manual leave-credit adjustments are not changed.

-- Preview the requests before deleting them:
select id, employee_code, start_date, end_date, leave_type, status, created_at
from public.branch_employee_leave_request
where branch_id = '032bc932-9d38-4099-8c1e-3f00645787f4'::uuid
order by created_at desc;

-- Run only after confirming the preview:
begin;

delete from public.branch_employee_leave_request
where branch_id = '032bc932-9d38-4099-8c1e-3f00645787f4'::uuid;

commit;
