-- Permanently deletes one employee and that employee's attendance, payroll,
-- leave, loan, deduction, contribution, and saved payroll snapshot records.
-- Branches, branch admins, payroll runs, and other employees are preserved.
--
-- Before running:
--   1. Set v_branch_name and v_employee_code to the exact employee.
--   2. Review the NOTICE output and change v_confirm_delete to true.
-- Run only after the project schema and employee feature SQL files are applied.

begin;

do $$
declare
  v_branch_name text := 'REPLACE WITH EXACT BRANCH NAME';
  v_employee_code text := 'REPLACE WITH EXACT EMPLOYEE ID';
  v_confirm_delete boolean := false;
  v_branch_matches integer;
  v_branch_id uuid;
  v_employee_id uuid;
begin
  select count(*)
  into v_branch_matches
  from public.branch
  where name = v_branch_name;

  if v_branch_matches <> 1 then
    raise exception 'Expected exactly one branch named "%"; found %',
      v_branch_name, v_branch_matches;
  end if;

  select id
  into v_branch_id
  from public.branch
  where name = v_branch_name;

  select id
  into v_employee_id
  from public.employee
  where branch_id = v_branch_id
    and employee_code = v_employee_code
  for update;

  if not found then
    raise exception 'Employee ID "%" was not found in branch "%"',
      v_employee_code, v_branch_name;
  end if;

  if not v_confirm_delete then
    raise exception 'Deletion not confirmed. Review the target, then set v_confirm_delete to true.';
  end if;

  raise notice 'Deleting employee "%" (ID: %) from branch "%" (ID: %)',
    (select name from public.employee where id = v_employee_id),
    v_employee_code,
    v_branch_name,
    v_branch_id;

  delete from public.payroll_item
  where employee_id = v_employee_id
    and branch_id = v_branch_id;

  delete from public.employee_attendance
  where employee_id = v_employee_id;

  delete from public.branch_employee_cash_advance_payment
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_cash_advance_loan
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_cash_advance
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_hdmf_payment
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_hdmf_loan
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_contribution
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_undertime_deduction
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_payroll_addition
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_other_deduction
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_leave_request
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_overtime_hours
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_holiday_pay
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_employee_holiday_pay_base
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.branch_weekly_payroll_snapshot_item
  where branch_id = v_branch_id
    and employee_code = v_employee_code;

  delete from public.employee
  where id = v_employee_id
    and branch_id = v_branch_id
    and employee_code = v_employee_code;

  if not found then
    raise exception 'Employee was not deleted; transaction cancelled';
  end if;

  raise notice 'Employee "%" and connected records were deleted. Commit the transaction to keep the changes.',
    v_employee_code;
end;
$$;

-- Review the NOTICE messages before committing. Run ROLLBACK instead to cancel.
commit;
