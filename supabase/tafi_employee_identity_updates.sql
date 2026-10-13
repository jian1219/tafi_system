begin;

-- Run after all employee-related schema and feature SQL files. These
-- employee-code relationships must cascade so changing an employee ID keeps
-- their branch attendance/payroll records attached to the same employee.
do $$
begin
  if to_regclass('public.branch_employee_cash_advance') is not null then
    execute 'alter table public.branch_employee_cash_advance drop constraint if exists branch_employee_cash_advance_employee_fk';
    execute 'alter table public.branch_employee_cash_advance add constraint branch_employee_cash_advance_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_cash_advance_loan') is not null then
    execute 'alter table public.branch_employee_cash_advance_loan drop constraint if exists branch_employee_cash_advance_loan_employee_fk';
    execute 'alter table public.branch_employee_cash_advance_loan add constraint branch_employee_cash_advance_loan_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_cash_advance_payment') is not null then
    execute 'alter table public.branch_employee_cash_advance_payment drop constraint if exists branch_employee_cash_advance_payment_loan_fk';
    execute 'alter table public.branch_employee_cash_advance_payment add constraint branch_employee_cash_advance_payment_loan_fk foreign key (advance_id, branch_id, employee_code) references public.branch_employee_cash_advance_loan (id, branch_id, employee_code) on update cascade on delete cascade';
  end if;
  if to_regclass('public.branch_employee_hdmf_loan') is not null then
    execute 'alter table public.branch_employee_hdmf_loan drop constraint if exists branch_employee_hdmf_loan_employee_fk';
    execute 'alter table public.branch_employee_hdmf_loan add constraint branch_employee_hdmf_loan_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_hdmf_payment') is not null then
    execute 'alter table public.branch_employee_hdmf_payment drop constraint if exists branch_employee_hdmf_payment_loan_fk';
    execute 'alter table public.branch_employee_hdmf_payment add constraint branch_employee_hdmf_payment_loan_fk foreign key (loan_id, branch_id, employee_code) references public.branch_employee_hdmf_loan (id, branch_id, employee_code) on update cascade on delete cascade';
  end if;
  if to_regclass('public.branch_employee_undertime_deduction') is not null then
    execute 'alter table public.branch_employee_undertime_deduction drop constraint if exists branch_employee_undertime_deduction_employee_fk';
    execute 'alter table public.branch_employee_undertime_deduction add constraint branch_employee_undertime_deduction_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_payroll_addition') is not null then
    execute 'alter table public.branch_employee_payroll_addition drop constraint if exists branch_employee_payroll_addition_employee_fk';
    execute 'alter table public.branch_employee_payroll_addition add constraint branch_employee_payroll_addition_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_other_deduction') is not null then
    execute 'alter table public.branch_employee_other_deduction drop constraint if exists branch_employee_other_deduction_employee_fk';
    execute 'alter table public.branch_employee_other_deduction add constraint branch_employee_other_deduction_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_leave_request') is not null then
    execute 'alter table public.branch_employee_leave_request drop constraint if exists branch_employee_leave_request_employee_fk';
    execute 'alter table public.branch_employee_leave_request add constraint branch_employee_leave_request_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_overtime_hours') is not null then
    execute 'alter table public.branch_employee_overtime_hours drop constraint if exists branch_employee_overtime_hours_employee_fk';
    execute 'alter table public.branch_employee_overtime_hours add constraint branch_employee_overtime_hours_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_holiday_pay') is not null then
    execute 'alter table public.branch_employee_holiday_pay drop constraint if exists branch_employee_holiday_pay_employee_fk';
    execute 'alter table public.branch_employee_holiday_pay add constraint branch_employee_holiday_pay_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
  if to_regclass('public.branch_employee_holiday_pay_base') is not null then
    execute 'alter table public.branch_employee_holiday_pay_base drop constraint if exists branch_employee_holiday_pay_base_employee_fk';
    execute 'alter table public.branch_employee_holiday_pay_base add constraint branch_employee_holiday_pay_base_employee_fk foreign key (branch_id, employee_code) references public.employee (branch_id, employee_code) on update cascade on delete restrict';
  end if;
end;
$$;

create or replace function public.tafi_admin_update_employee_identity(
  p_session_token uuid,
  p_employee_id uuid,
  p_employee_code text,
  p_name text,
  p_position text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_old_employee_code text;
  v_new_employee_code text := nullif(trim(p_employee_code), '');
  v_name text := nullif(trim(p_name), '');
  v_position text := nullif(trim(p_position), '');
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_employee_id is null or v_new_employee_code is null
    or v_name is null or v_position is null then
    raise exception 'Employee ID, name, and position are required';
  end if;

  select employee.branch_id, employee.employee_code
  into v_branch_id, v_old_employee_code
  from public.employee as employee
  where employee.id = p_employee_id
  for update;

  if not found then
    raise exception 'Employee was not found';
  end if;

  if exists (
    select 1 from public.employee as other_employee
    where other_employee.branch_id = v_branch_id
      and other_employee.employee_code = v_new_employee_code
      and other_employee.id <> p_employee_id
  ) then
    raise exception 'That employee ID is already in use in this branch';
  end if;

  if v_new_employee_code <> v_old_employee_code and exists (
    select 1 from public.branch_weekly_payroll_snapshot_item as snapshot_item
    where snapshot_item.branch_id = v_branch_id
      and snapshot_item.employee_code = v_new_employee_code
  ) then
    raise exception 'This employee ID already exists in saved payroll history for this branch';
  end if;

  update public.employee
  set employee_code = v_new_employee_code,
    name = v_name,
    position = v_position,
    updated_at = now()
  where id = p_employee_id;

  if v_new_employee_code <> v_old_employee_code then
    update public.branch_employee_contribution
    set employee_code = v_new_employee_code,
      updated_at = now()
    where branch_id = v_branch_id
      and employee_code = v_old_employee_code;

    update public.branch_weekly_payroll_snapshot_item
    set employee_code = v_new_employee_code
    where branch_id = v_branch_id
      and employee_code = v_old_employee_code;
  end if;

  return true;
end;
$$;

revoke all on function public.tafi_admin_update_employee_identity(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.tafi_admin_update_employee_identity(uuid, uuid, text, text, text)
  to anon, authenticated;

commit;
