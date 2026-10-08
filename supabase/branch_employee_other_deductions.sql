begin;

-- Run after tafi_complete_schema.sql and branch_employee_contributions.sql.
create table if not exists public.branch_employee_other_deduction (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  description text not null check (
    nullif(trim(description), '') is not null and length(trim(description)) <= 200
  ),
  amount numeric(12, 2) not null check (amount > 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  constraint branch_employee_other_deduction_period check (
    period_end >= period_start and period_end <= period_start + 6
  ),
  constraint branch_employee_other_deduction_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_other_deduction_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_other_deduction_period_idx
  on public.branch_employee_other_deduction (branch_id, period_start, employee_code);

alter table public.branch_weekly_payroll_snapshot_item
  add column if not exists other_deduction numeric(12, 2) not null default 0
  check (other_deduction >= 0);

alter table public.branch_employee_other_deduction enable row level security;
revoke all on table public.branch_employee_other_deduction from public, anon, authenticated;

create or replace function public.branch_admin_list_other_deductions(
  p_session_token uuid,
  p_period_start date,
  p_period_end date,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  description text,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Other deduction page offset and limit are invalid';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid period range is required';
  end if;

  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select deduction.id,
    deduction.employee_code,
    employee.name,
    deduction.period_start,
    deduction.period_end,
    deduction.description,
    deduction.amount,
    deduction.created_at
  from public.branch_employee_other_deduction as deduction
  join public.employee as employee
    on employee.branch_id = deduction.branch_id
    and employee.employee_code = deduction.employee_code
  where deduction.branch_id = v_branch_id
    and deduction.period_start between p_period_start and p_period_end
  order by deduction.period_start desc, employee.name, deduction.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_create_other_deduction(
  p_session_token uuid,
  p_employee_code text,
  p_period_start date,
  p_period_end date,
  p_description text,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_deduction_id uuid;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if nullif(trim(p_employee_code), '') is null
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
    or p_period_end > p_period_start + 6 then
    raise exception 'Choose a valid employee and payroll week';
  end if;
  if nullif(trim(p_description), '') is null or length(trim(p_description)) > 200 then
    raise exception 'Enter a description of up to 200 characters';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Deduction amount must be greater than zero';
  end if;

  if not exists (
    select 1
    from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Employee was not found in this branch';
  end if;

  insert into public.branch_employee_other_deduction (
    branch_id,
    employee_code,
    period_start,
    period_end,
    description,
    amount,
    created_by_branch_admin_id
  )
  values (
    v_branch_id,
    trim(p_employee_code),
    p_period_start,
    p_period_end,
    trim(p_description),
    p_amount,
    v_admin_id
  )
  returning id into v_deduction_id;

  return v_deduction_id;
end;
$$;

create or replace function public.branch_admin_save_weekly_payroll_snapshot(
  p_session_token uuid,
  p_period_start date,
  p_period_end date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_period_start is null or p_period_end is null
    or p_period_end < p_period_start
    or p_period_end > p_period_start + 6 then
    raise exception 'A valid payroll week of seven days or fewer is required';
  end if;
  if not exists (
    select 1
    from public.employee_attendance as attendance
    join public.employee as employee on employee.id = attendance.employee_id
    where employee.branch_id = v_branch_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status <> 'not_marked'
  ) then
    raise exception 'Save at least one marked attendance record before saving weekly payroll';
  end if;

  insert into public.branch_weekly_payroll_snapshot (
    branch_id, period_start, period_end, created_by_branch_admin_id
  )
  values (v_branch_id, p_period_start, p_period_end, v_admin_id);

  insert into public.branch_weekly_payroll_snapshot_item (
    branch_id, period_start, employee_code, employee_name, employee_position,
    present_days, late_days, absent_days, weekly_gross, sss, philhealth,
    pagibig, cash_advance_deduction, hdmf_loan_deduction,
    undertime_deduction, other_deduction, holiday_regular_pay, overtime_pay,
    special_nonworking_holiday_pay, net_pay
  )
  select
    v_branch_id,
    p_period_start,
    employee.employee_code,
    employee.name,
    employee.position,
    count(*) filter (where attendance.status = 'present')::integer,
    count(*) filter (where attendance.status = 'present_late')::integer,
    count(*) filter (where attendance.status = 'absent')::integer,
    round(sum(case
      when attendance.status in ('present', 'present_late') then attendance.daily_rate_snapshot
      else 0
    end), 2),
    coalesce(contribution.sss, 0),
    coalesce(contribution.philhealth, 0),
    coalesce(contribution.pagibig, 0),
    coalesce(cash_advance.weekly_deduction, 0),
    coalesce(hdmf_payment.amount, 0),
    coalesce(undertime.amount, round(sum(case
      when attendance.status = 'present_late'
        then attendance.daily_rate_snapshot / 8 / 60 * attendance.late_minutes
      else 0
    end), 2)),
    coalesce(other_deductions.amount, 0),
    coalesce(additions.holiday_regular_pay, 0),
    coalesce(additions.overtime_pay, 0),
    coalesce(additions.special_nonworking_holiday_pay, 0),
    round(
      sum(case
        when attendance.status in ('present', 'present_late') then attendance.daily_rate_snapshot
        else 0
      end)
      + coalesce(additions.holiday_regular_pay, 0)
      + coalesce(additions.overtime_pay, 0)
      + coalesce(additions.special_nonworking_holiday_pay, 0)
      - coalesce(contribution.sss, 0)
      - coalesce(contribution.philhealth, 0)
      - coalesce(contribution.pagibig, 0)
      - coalesce(cash_advance.weekly_deduction, 0)
      - coalesce(hdmf_payment.amount, 0)
      - coalesce(undertime.amount, round(sum(case
        when attendance.status = 'present_late'
          then attendance.daily_rate_snapshot / 8 / 60 * attendance.late_minutes
        else 0
      end), 2))
      - coalesce(other_deductions.amount, 0),
      2
    )
  from public.employee_attendance as attendance
  join public.employee as employee on employee.id = attendance.employee_id
  left join public.branch_employee_contribution as contribution
    on contribution.branch_id = v_branch_id
    and contribution.employee_code = employee.employee_code
  left join lateral (
    select sum(payment.amount) as weekly_deduction
    from public.branch_employee_cash_advance_payment as payment
    where payment.branch_id = v_branch_id
      and payment.employee_code = employee.employee_code
      and payment.period_start = p_period_start
      and payment.period_end = p_period_end
  ) as cash_advance on true
  left join lateral (
    select sum(payment.amount) as amount
    from public.branch_employee_hdmf_payment as payment
    where payment.branch_id = v_branch_id
      and payment.employee_code = employee.employee_code
      and payment.period_start = p_period_start
      and payment.period_end = p_period_end
  ) as hdmf_payment on true
  left join public.branch_employee_undertime_deduction as undertime
    on undertime.branch_id = v_branch_id
    and undertime.employee_code = employee.employee_code
    and undertime.period_start = p_period_start
    and undertime.period_end = p_period_end
  left join lateral (
    select sum(deduction.amount) as amount
    from public.branch_employee_other_deduction as deduction
    where deduction.branch_id = v_branch_id
      and deduction.employee_code = employee.employee_code
      and deduction.period_start = p_period_start
      and deduction.period_end = p_period_end
  ) as other_deductions on true
  left join lateral (
    select
      sum(addition.amount) filter (where addition.addition_type = 'holiday_regular_pay') as holiday_regular_pay,
      sum(addition.amount) filter (where addition.addition_type = 'overtime_pay') as overtime_pay,
      sum(addition.amount) filter (where addition.addition_type = 'special_nonworking_holiday') as special_nonworking_holiday_pay
    from public.branch_employee_payroll_addition as addition
    where addition.branch_id = v_branch_id
      and addition.employee_code = employee.employee_code
      and addition.period_start = p_period_start
      and addition.period_end = p_period_end
  ) as additions on true
  where employee.branch_id = v_branch_id
    and attendance.attendance_date between p_period_start and p_period_end
  group by employee.employee_code, employee.name, employee.position,
    contribution.sss, contribution.philhealth, contribution.pagibig,
    cash_advance.weekly_deduction, hdmf_payment.amount, undertime.amount,
    other_deductions.amount, additions.holiday_regular_pay, additions.overtime_pay,
    additions.special_nonworking_holiday_pay;

  return true;
end;
$$;

create or replace function public.branch_admin_list_weekly_payroll_snapshots(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  period_start date,
  period_end date,
  created_at timestamptz,
  employees jsonb,
  total_gross numeric,
  total_deductions numeric,
  net_total numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Payroll history page offset and limit are invalid';
  end if;

  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select
    snapshot.period_start,
    snapshot.period_end,
    snapshot.created_at,
    coalesce(jsonb_agg(jsonb_build_object(
      'employee_code', item.employee_code,
      'employee_name', item.employee_name,
      'employee_position', item.employee_position,
      'present_days', item.present_days,
      'late_days', item.late_days,
      'absent_days', item.absent_days,
      'weekly_gross', item.weekly_gross,
      'sss', item.sss,
      'philhealth', item.philhealth,
      'pagibig', item.pagibig,
      'cash_advance_deduction', item.cash_advance_deduction,
      'hdmf_loan_deduction', item.hdmf_loan_deduction,
      'undertime_deduction', item.undertime_deduction,
      'other_deduction', item.other_deduction,
      'holiday_regular_pay', item.holiday_regular_pay,
      'overtime_pay', item.overtime_pay,
      'special_nonworking_holiday_pay', item.special_nonworking_holiday_pay,
      'net_pay', item.net_pay
    ) order by item.employee_name), '[]'::jsonb),
    coalesce(sum(
      item.weekly_gross + item.holiday_regular_pay + item.overtime_pay
      + item.special_nonworking_holiday_pay
    ), 0),
    coalesce(sum(
      item.sss + item.philhealth + item.pagibig + item.cash_advance_deduction
      + item.hdmf_loan_deduction + item.undertime_deduction + item.other_deduction
    ), 0),
    coalesce(sum(item.net_pay), 0)
  from public.branch_weekly_payroll_snapshot as snapshot
  left join public.branch_weekly_payroll_snapshot_item as item
    on item.branch_id = snapshot.branch_id
    and item.period_start = snapshot.period_start
  where snapshot.branch_id = v_branch_id
  group by snapshot.branch_id, snapshot.period_start, snapshot.period_end, snapshot.created_at
  order by snapshot.period_start desc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.branch_admin_list_other_deductions(uuid, date, date, integer, integer) from public;
revoke all on function public.branch_admin_create_other_deduction(uuid, text, date, date, text, numeric) from public;
revoke all on function public.branch_admin_save_weekly_payroll_snapshot(uuid, date, date) from public;
revoke all on function public.branch_admin_list_weekly_payroll_snapshots(uuid, integer, integer) from public;
grant execute on function public.branch_admin_list_other_deductions(uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.branch_admin_create_other_deduction(uuid, text, date, date, text, numeric) to anon, authenticated;
grant execute on function public.branch_admin_save_weekly_payroll_snapshot(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_list_weekly_payroll_snapshots(uuid, integer, integer) to anon, authenticated;

comment on table public.branch_employee_other_deduction is
  'Branch-admin entered employee deductions assigned to a payroll week and included in payroll totals.';

commit;
