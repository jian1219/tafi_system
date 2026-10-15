begin;

-- Run after tafi_complete_schema.sql and branch_employee_contributions.sql.
-- Then apply tafi_admin_management.sql to enable TAFI Admin leave-credit tools.
alter table public.employee
  add column if not exists probationary_start_date date,
  add column if not exists regular_start_date date;

create table if not exists public.branch_employee_leave_request (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  start_date date not null,
  end_date date not null,
  credit_days numeric(8, 2) not null check (credit_days > 0),
  reason text not null check (nullif(trim(reason), '') is not null),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_employee_leave_request_date_order check (end_date >= start_date),
  constraint branch_employee_leave_request_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on update cascade on delete restrict,
  constraint branch_employee_leave_request_admin_fk
    foreign key (requested_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create table if not exists public.branch_employee_leave_credit_adjustment (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  credit_days numeric(8, 2) not null check (credit_days > 0),
  reason text not null check (nullif(trim(reason), '') is not null),
  created_by_tafi_admin_id uuid not null,
  created_at timestamptz not null default now(),
  constraint branch_employee_leave_credit_adjustment_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on update cascade on delete restrict
);

create index if not exists branch_employee_leave_request_branch_status_idx
  on public.branch_employee_leave_request (branch_id, status, created_at desc);
create index if not exists branch_employee_leave_request_employee_idx
  on public.branch_employee_leave_request (branch_id, employee_code, status);
create index if not exists branch_employee_leave_credit_adjustment_employee_idx
  on public.branch_employee_leave_credit_adjustment (branch_id, employee_code, created_at desc);

alter table public.branch_employee_leave_request enable row level security;
alter table public.branch_employee_leave_credit_adjustment enable row level security;
revoke all on table public.branch_employee_leave_request from public, anon, authenticated;
revoke all on table public.branch_employee_leave_credit_adjustment from public, anon, authenticated;

drop function if exists public.branch_admin_list_employee_leave_credits(uuid);

create function public.branch_admin_list_employee_leave_credits(
  p_session_token uuid
)
returns table (
  employee_code text,
  name text,
  employee_position text,
  hire_date date,
  employment_status text,
  employment_classification text,
  earned_credits numeric,
  manual_credits numeric,
  used_credits numeric,
  pending_credits numeric,
  balance numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  with qualifying_months as (
    select attendance.employee_id,
      date_trunc('month', attendance.attendance_date)::date as attendance_month
    from public.employee_attendance as attendance
    join public.employee as employee on employee.id = attendance.employee_id
    where employee.branch_id = v_branch_id
      and attendance.status in ('present', 'present_late')
    group by attendance.employee_id, date_trunc('month', attendance.attendance_date)::date
    having count(distinct attendance.attendance_date) >=
      case when extract(month from min(attendance.attendance_date)) = 2
        then 24 else 26 end
  ),
  earned as (
    select qualifying_months.employee_id, count(*)::numeric * 1.25 as credits
    from qualifying_months
    group by qualifying_months.employee_id
  ),
  manual_totals as (
    select adjustment.employee_code,
      sum(adjustment.credit_days) as credits
    from public.branch_employee_leave_credit_adjustment as adjustment
    where adjustment.branch_id = v_branch_id
    group by adjustment.employee_code
  ),
  request_totals as (
    select leave_request.employee_code,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'approved'), 0) as used,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'pending'), 0) as pending
    from public.branch_employee_leave_request as leave_request
    where leave_request.branch_id = v_branch_id
    group by leave_request.employee_code
  )
  select employee.employee_code,
    employee.name,
    employee.position,
    employee.hire_date,
    employee.employment_status,
    employee.employment_classification,
    case when employee.employment_classification = 'Regular'
      then coalesce(earned.credits, 0) else 0 end,
    case when employee.employment_classification = 'Regular'
      then coalesce(manual_totals.credits, 0) else 0 end,
    coalesce(request_totals.used, 0),
    coalesce(request_totals.pending, 0),
    case when employee.employment_classification = 'Regular'
      then coalesce(earned.credits, 0) + coalesce(manual_totals.credits, 0)
        - coalesce(request_totals.used, 0)
      else 0 end
  from public.employee as employee
  left join earned on earned.employee_id = employee.id
  left join manual_totals on manual_totals.employee_code = employee.employee_code
  left join request_totals on request_totals.employee_code = employee.employee_code
  where employee.branch_id = v_branch_id
  order by employee.name, employee.employee_code;
end;
$$;

create or replace function public.branch_admin_list_employee_leave_requests(
  p_session_token uuid
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  employee_position text,
  start_date date,
  end_date date,
  credit_days numeric,
  reason text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select leave_request.id,
    leave_request.employee_code,
    employee.name,
    employee.position,
    leave_request.start_date,
    leave_request.end_date,
    leave_request.credit_days,
    leave_request.reason,
    leave_request.status,
    leave_request.created_at
  from public.branch_employee_leave_request as leave_request
  join public.employee as employee
    on employee.branch_id = leave_request.branch_id
    and employee.employee_code = leave_request.employee_code
  where leave_request.branch_id = v_branch_id
  order by case when leave_request.status = 'pending' then 0 else 1 end,
    leave_request.created_at desc;
end;
$$;

create or replace function public.branch_admin_create_employee_leave_request(
  p_session_token uuid,
  p_employee_code text,
  p_start_date date,
  p_end_date date,
  p_credit_days numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_employee_id uuid;
  v_earned numeric := 0;
  v_manual numeric := 0;
  v_used numeric := 0;
  v_pending numeric := 0;
  v_request_id uuid;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid leave date range is required';
  end if;
  if p_credit_days is null or p_credit_days <= 0 then
    raise exception 'Requested leave credits must be greater than zero';
  end if;
  if p_credit_days <> trunc(p_credit_days)
    or p_end_date - p_start_date + 1 <> p_credit_days then
    raise exception 'Leave credits must be whole days with one leave date for each credit day';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required for the leave request';
  end if;

  select employee.id into v_employee_id
  from public.employee as employee
  where employee.branch_id = v_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active'
    and employee.employment_classification = 'Regular'
  for update;

  if not found then
    raise exception 'The employee is not an active Regular employee in this branch';
  end if;

  select count(*)::numeric * 1.25 into v_earned
  from (
    select date_trunc('month', attendance.attendance_date)::date as attendance_month
    from public.employee_attendance as attendance
    where attendance.employee_id = v_employee_id
      and attendance.status in ('present', 'present_late')
    group by date_trunc('month', attendance.attendance_date)::date
    having count(distinct attendance.attendance_date) >=
      case when extract(month from min(attendance.attendance_date)) = 2
        then 24 else 26 end
  ) as qualifying_months;

  select coalesce(sum(adjustment.credit_days), 0)
  into v_manual
  from public.branch_employee_leave_credit_adjustment as adjustment
  where adjustment.branch_id = v_branch_id
    and adjustment.employee_code = trim(p_employee_code);

  select
    coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'approved'), 0),
    coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'pending'), 0)
  into v_used, v_pending
  from public.branch_employee_leave_request as leave_request
  where leave_request.branch_id = v_branch_id
    and leave_request.employee_code = trim(p_employee_code);

  if p_credit_days > v_earned + v_manual - v_used - v_pending then
    raise exception 'Requested credits exceed the employee available balance of % days',
      greatest(v_earned + v_manual - v_used - v_pending, 0);
  end if;

  insert into public.branch_employee_leave_request (
    branch_id,
    employee_code,
    start_date,
    end_date,
    credit_days,
    reason,
    requested_by_branch_admin_id
  )
  values (
    v_branch_id,
    trim(p_employee_code),
    p_start_date,
    p_end_date,
    p_credit_days,
    trim(p_reason),
    v_admin_id
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.branch_admin_update_employee_leave_request_status(
  p_session_token uuid,
  p_request_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_employee_id uuid;
  v_employee_code text;
  v_start_date date;
  v_end_date date;
  v_credit_days numeric;
  v_daily_rate numeric;
  v_day_offset integer;
  v_saved_count bigint;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'Request status must be approved or rejected';
  end if;

  select leave_request.employee_code, leave_request.start_date,
    leave_request.end_date, leave_request.credit_days
  into v_employee_code, v_start_date, v_end_date, v_credit_days
  from public.branch_employee_leave_request as leave_request
  where leave_request.id = p_request_id
    and leave_request.branch_id = v_branch_id
    and leave_request.status = 'pending'
  for update;

  if not found then
    raise exception 'Pending leave request was not found in this branch';
  end if;

  if p_status = 'approved' then
    if v_credit_days <> trunc(v_credit_days)
      or v_end_date - v_start_date + 1 <> v_credit_days then
      raise exception 'Leave credits must be whole days with one leave date for each credit day';
    end if;

    select employee.id, employee.daily_rate
    into v_employee_id, v_daily_rate
    from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = v_employee_code
      and employee.employment_status = 'active'
      and employee.employment_classification = 'Regular'
    for update;

    if not found then
      raise exception 'The employee is not an active Regular employee in this branch';
    end if;

    if exists (
      select 1
      from public.branch_employee_leave_request as other_request
      where other_request.branch_id = v_branch_id
        and other_request.employee_code = v_employee_code
        and other_request.id <> p_request_id
        and other_request.status = 'approved'
        and other_request.start_date <= v_end_date
        and other_request.end_date >= v_start_date
    ) then
      raise exception 'These leave dates overlap another approved leave request';
    end if;

    if exists (
      select 1
      from public.employee_attendance as attendance
      where attendance.employee_id = v_employee_id
        and attendance.attendance_date between v_start_date and v_end_date
        and attendance.status not in ('absent', 'not_marked', 'vl_with_pay')
    ) then
      raise exception 'One or more leave dates already have a different attendance status';
    end if;

    for v_day_offset in 0..(v_end_date - v_start_date)
    loop
      insert into public.employee_attendance as current_attendance (
        employee_id,
        attendance_date,
        status,
        late_minutes,
        daily_rate_snapshot,
        submitted_by,
        updated_at
      )
      values (
        v_employee_id,
        v_start_date + v_day_offset,
        'vl_with_pay',
        0,
        v_daily_rate,
        v_admin_id,
        now()
      )
      on conflict (employee_id, attendance_date) do update
      set status = excluded.status,
        late_minutes = 0,
        daily_rate_snapshot = excluded.daily_rate_snapshot,
        submitted_by = excluded.submitted_by,
        updated_at = now()
      where current_attendance.status in ('absent', 'not_marked', 'vl_with_pay');

      get diagnostics v_saved_count = row_count;
      if v_saved_count <> 1 then
        raise exception 'Could not record Leave with Pay for %', v_start_date + v_day_offset;
      end if;
    end loop;
  end if;

  update public.branch_employee_leave_request as leave_request
  set status = p_status,
    updated_at = now()
  where leave_request.id = p_request_id
    and leave_request.branch_id = v_branch_id
    and leave_request.status = 'pending';

  return true;
end;
$$;

drop function if exists public.branch_admin_list_employees(uuid);

create function public.branch_admin_list_employees(p_session_token uuid)
returns table (
  employee_code text,
  name text,
  employee_position text,
  daily_rate numeric,
  today_status text,
  address text,
  gender text,
  birthday date,
  tin_number text,
  sss_number text,
  pagibig_number text,
  philhealth_number text,
  employment_classification text,
  hire_date date,
  probationary_start_date date,
  regular_start_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select employee.employee_code, employee.name, employee.position, employee.daily_rate,
    coalesce(attendance.status, 'not_marked'), employee.address, employee.gender,
    employee.birthday, employee.tin_number, employee.sss_number, employee.pagibig_number,
    employee.philhealth_number, employee.employment_classification, employee.hire_date,
    employee.probationary_start_date, employee.regular_start_date
  from public.employee as employee
  left join public.employee_attendance as attendance
    on attendance.employee_id = employee.id
    and attendance.attendance_date = current_date
  where employee.branch_id = v_branch_id
    and employee.employment_status = 'active'
  order by employee.name;
end;
$$;

drop function if exists public.branch_admin_update_employee_profile(uuid, text, text, text, date, text, text, text, text);
drop function if exists public.branch_admin_update_employee_profile(uuid, text, text, text, date, date, text, text, text, text);
drop function if exists public.branch_admin_update_employee_profile(uuid, text, text, text, date, date, text, text, text, text, text);
drop function if exists public.branch_admin_update_employee_profile(uuid, text, text, text, date, date, date, date, text, text, text, text, text);

create function public.branch_admin_update_employee_profile(
  p_session_token uuid,
  p_employee_code text,
  p_address text,
  p_gender text,
  p_birthday date,
  p_hire_date date,
  p_probationary_start_date date,
  p_regular_start_date date,
  p_tin_number text,
  p_sss_number text,
  p_pagibig_number text,
  p_philhealth_number text,
  p_employment_classification text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if nullif(trim(p_employee_code), '') is null
    or p_employment_classification is null
    or p_employment_classification not in ('Regular', 'Probationary', 'Trainee', 'OnCall')
    or (p_birthday is not null and p_birthday > current_date)
    or (p_hire_date is not null and p_hire_date > current_date)
    or (p_probationary_start_date is not null and p_probationary_start_date > current_date)
    or (p_regular_start_date is not null and p_regular_start_date > current_date)
    or (p_hire_date is not null and p_probationary_start_date is not null
      and p_probationary_start_date < p_hire_date)
    or (coalesce(p_probationary_start_date, p_hire_date) is not null
      and p_regular_start_date is not null
      and p_regular_start_date < coalesce(p_probationary_start_date, p_hire_date)) then
    raise exception 'Enter valid employee profile and employment stage dates in chronological order';
  end if;
  if p_gender is not null and p_gender not in ('Male', 'Female', 'Other', 'Prefer not to say') then
    raise exception 'Select a valid gender option';
  end if;

  update public.employee
  set address = nullif(trim(p_address), ''),
    gender = p_gender,
    birthday = p_birthday,
    hire_date = p_hire_date,
    probationary_start_date = p_probationary_start_date,
    regular_start_date = p_regular_start_date,
    tin_number = nullif(trim(p_tin_number), ''),
    sss_number = nullif(trim(p_sss_number), ''),
    pagibig_number = nullif(trim(p_pagibig_number), ''),
    philhealth_number = nullif(trim(p_philhealth_number), ''),
    employment_classification = p_employment_classification,
    updated_at = now()
  where branch_id = v_branch_id
    and employee_code = trim(p_employee_code)
    and employment_status = 'active';

  if not found then
    raise exception 'Employee was not found in this branch';
  end if;

  return true;
end;
$$;

revoke all on function public.branch_admin_list_employee_leave_credits(uuid) from public;
revoke all on function public.branch_admin_list_employee_leave_requests(uuid) from public;
revoke all on function public.branch_admin_create_employee_leave_request(uuid, text, date, date, numeric, text) from public;
revoke all on function public.branch_admin_update_employee_leave_request_status(uuid, uuid, text) from public;
revoke all on function public.branch_admin_list_employees(uuid) from public;
revoke all on function public.branch_admin_update_employee_profile(uuid, text, text, text, date, date, date, date, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.branch_admin_list_employee_leave_credits(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_employee_leave_requests(uuid) to anon, authenticated;
grant execute on function public.branch_admin_create_employee_leave_request(uuid, text, date, date, numeric, text) to anon, authenticated;
grant execute on function public.branch_admin_update_employee_leave_request_status(uuid, uuid, text) to anon, authenticated;
grant execute on function public.branch_admin_list_employees(uuid) to anon, authenticated;

commit;
