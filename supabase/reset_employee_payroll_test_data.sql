-- CAUTION: This deletes employee records and related attendance/payroll data
-- for every branch. It preserves branches, branch admins, admin sessions,
-- and branch-level holiday pay rules.
--
-- Run only in the intended testing database after applying the project schema
-- and feature SQL files. Review the database/project before committing.

begin;

delete from public.payroll_item;
delete from public.payroll_run;

delete from public.branch_weekly_payroll_snapshot_item;
delete from public.branch_weekly_payroll_snapshot;

delete from public.branch_employee_hdmf_payment;
delete from public.branch_employee_hdmf_loan;

delete from public.branch_employee_cash_advance_payment;
delete from public.branch_employee_cash_advance_loan;
delete from public.branch_employee_cash_advance;

delete from public.branch_employee_payroll_addition;
delete from public.branch_employee_holiday_pay;
delete from public.branch_employee_holiday_pay_base;
delete from public.branch_employee_undertime_deduction;
delete from public.branch_employee_other_deduction;
delete from public.branch_employee_overtime_hours;
delete from public.branch_employee_leave_request;
delete from public.branch_employee_contribution;

delete from public.employee_attendance;
delete from public.employee;

-- Verify that branches and branch admins remain while employee data is clear.
select
  (select count(*) from public.branch) as branches_preserved,
  (select count(*) from public.branch_admin) as branch_admins_preserved,
  (select count(*) from public.employee) as employees_remaining,
  (select count(*) from public.employee_attendance) as attendance_records_remaining,
  (select count(*) from public.payroll_run) as payroll_runs_remaining,
  (select count(*) from public.payroll_item) as payroll_items_remaining;

commit;
