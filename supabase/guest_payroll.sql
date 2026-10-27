begin;

create or replace function public.guest_get_weekly_payroll_data(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payroll_data jsonb;
  v_mandatory_contributions_enabled boolean;
begin
  if not exists (
    select 1 from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
    or p_period_end > p_period_start + 6 then
    raise exception 'A valid branch and payroll week are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  select not exists (
    select 1
    from public.tafi_admin_contribution_month_schedule as schedule
    where schedule.month_start = date_trunc('month', p_period_start)::date
  ) or exists (
    select 1
    from public.tafi_admin_contribution_month_schedule as schedule
    where schedule.month_start = date_trunc('month', p_period_start)::date
      and p_period_start = any(schedule.enabled_period_starts)
  )
  into v_mandatory_contributions_enabled;

  select jsonb_build_object(
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', employee.employee_code,
        'employee_name', employee.name,
        'position', employee.position,
        'daily_rate', employee.daily_rate,
        'employment_classification', employee.employment_classification
      ) order by employee.name, employee.employee_code)
      from public.employee as employee
      where employee.branch_id = p_branch_id
        and employee.employment_status = 'active'
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', employee.employee_code,
        'attendance_date', attendance.attendance_date,
        'status', attendance.status,
        'late_minutes', attendance.late_minutes
      ) order by employee.employee_code, attendance.attendance_date)
      from public.employee_attendance as attendance
      join public.employee as employee on employee.id = attendance.employee_id
      where employee.branch_id = p_branch_id
        and attendance.attendance_date between p_period_start and p_period_end
    ), '[]'::jsonb),
    'contributions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', employee.employee_code,
        'sss', case when v_mandatory_contributions_enabled then contribution.sss else 0 end,
        'philhealth', case when v_mandatory_contributions_enabled then contribution.philhealth else 0 end,
        'pagibig', case when v_mandatory_contributions_enabled then contribution.pagibig else 0 end
      ) order by employee.employee_code)
      from public.employee as employee
      left join public.branch_employee_contribution as contribution
        on contribution.branch_id = employee.branch_id
        and contribution.employee_code = employee.employee_code
      where employee.branch_id = p_branch_id
        and employee.employment_status = 'active'
        and (
          not v_mandatory_contributions_enabled
          or contribution.employee_code is not null
        )
    ), '[]'::jsonb),
    'cash_advance_payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', payment.employee_code,
        'amount', payment.amount
      ))
      from public.branch_employee_cash_advance_payment as payment
      where payment.branch_id = p_branch_id
        and payment.period_start >= p_period_start
        and payment.period_end <= p_period_end
    ), '[]'::jsonb),
    'hdmf_payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', payment.employee_code,
        'amount', payment.amount
      ))
      from public.branch_employee_hdmf_payment as payment
      where payment.branch_id = p_branch_id
        and payment.period_start >= p_period_start
        and payment.period_end <= p_period_end
    ), '[]'::jsonb),
    'undertime_deductions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', deduction.employee_code,
        'amount', deduction.amount
      ))
      from public.branch_employee_undertime_deduction as deduction
      where deduction.branch_id = p_branch_id
        and deduction.period_start >= p_period_start
        and deduction.period_end <= p_period_end
    ), '[]'::jsonb),
    'other_deductions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', deduction.employee_code,
        'amount', deduction.amount
      ))
      from public.branch_employee_other_deduction as deduction
      where deduction.branch_id = p_branch_id
        and deduction.period_start between p_period_start and p_period_end
    ), '[]'::jsonb),
    'payroll_additions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_code', addition.employee_code,
        'addition_type', addition.addition_type,
        'amount', addition.amount
      ))
      from public.branch_employee_payroll_addition as addition
      where addition.branch_id = p_branch_id
        and addition.period_start >= p_period_start
        and addition.period_end <= p_period_end
    ), '[]'::jsonb)
  )
  into payroll_data;

  return payroll_data;
end;
$$;

revoke all on function public.guest_get_weekly_payroll_data(uuid, uuid, date, date) from public;
grant execute on function public.guest_get_weekly_payroll_data(uuid, uuid, date, date) to anon, authenticated;

commit;
