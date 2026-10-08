begin;

-- Run after tafi_complete_schema.sql and branch_employee_contributions.sql.
create table if not exists public.branch_employee_overtime_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  overtime_date date not null,
  hours numeric(5, 2) not null check (hours >= 0 and hours <= 24),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, employee_code, overtime_date),
  constraint branch_employee_overtime_hours_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_overtime_hours_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_overtime_hours_date_idx
  on public.branch_employee_overtime_hours (branch_id, overtime_date, employee_code);

alter table public.branch_employee_overtime_hours enable row level security;
revoke all on table public.branch_employee_overtime_hours from public, anon, authenticated;

create or replace function public.branch_admin_list_overtime_hours(
  p_session_token uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  overtime_date date,
  hours numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid overtime date range is required';
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
  select overtime.id, overtime.employee_code, employee.name,
    overtime.overtime_date, overtime.hours
  from public.branch_employee_overtime_hours as overtime
  join public.employee as employee
    on employee.branch_id = overtime.branch_id
    and employee.employee_code = overtime.employee_code
  where overtime.branch_id = v_branch_id
    and overtime.overtime_date between p_period_start and p_period_end
  order by overtime.overtime_date desc, employee.name;
end;
$$;

create or replace function public.branch_admin_save_overtime_hours(
  p_session_token uuid,
  p_employee_code text,
  p_period_start date,
  p_period_end date,
  p_daily_hours jsonb
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_daily_rate numeric;
  v_overtime_pay numeric;
  v_day jsonb;
  v_date date;
  v_hours numeric;
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
    or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or jsonb_typeof(p_daily_hours) is distinct from 'array'
    or jsonb_array_length(p_daily_hours) < 1
    or jsonb_array_length(p_daily_hours) > 7 then
    raise exception 'Choose an employee and valid payroll week, and provide daily overtime hours';
  end if;

  select employee.daily_rate into v_daily_rate
  from public.employee as employee
  where employee.branch_id = v_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active'
  for update;

  if not found then
    raise exception 'Active employee was not found in this branch';
  end if;

  for v_day in select value from jsonb_array_elements(p_daily_hours)
  loop
    if coalesce(v_day->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(v_day->>'hours', '') !~ '^\d+(\.\d{1,2})?$' then
      raise exception 'Each overtime day requires a valid date and non-negative hours';
    end if;
    v_date := (v_day->>'date')::date;
    v_hours := (v_day->>'hours')::numeric;
    if v_date < p_period_start or v_date > p_period_end or v_hours > 24 then
      raise exception 'Overtime dates must be in the selected week and hours cannot exceed 24 per day';
    end if;

    insert into public.branch_employee_overtime_hours (
      branch_id, employee_code, overtime_date, hours, created_by_branch_admin_id, updated_at
    )
    values (
      v_branch_id, trim(p_employee_code), v_date, v_hours, v_admin_id, now()
    )
    on conflict (branch_id, employee_code, overtime_date) do update
    set hours = excluded.hours,
      created_by_branch_admin_id = excluded.created_by_branch_admin_id,
      updated_at = now();
  end loop;

  select round(v_daily_rate / 8 * coalesce(sum(overtime.hours), 0), 2)
  into v_overtime_pay
  from public.branch_employee_overtime_hours as overtime
  where overtime.branch_id = v_branch_id
    and overtime.employee_code = trim(p_employee_code)
    and overtime.overtime_date between p_period_start and p_period_end;

  insert into public.branch_employee_payroll_addition (
    branch_id, employee_code, period_start, period_end, addition_type,
    amount, created_by_branch_admin_id
  )
  values (
    v_branch_id, trim(p_employee_code), p_period_start, p_period_end,
    'overtime_pay', v_overtime_pay, v_admin_id
  )
  on conflict (branch_id, employee_code, period_start, addition_type) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    created_by_branch_admin_id = excluded.created_by_branch_admin_id,
    updated_at = now();

  return v_overtime_pay;
end;
$$;

revoke all on function public.branch_admin_list_overtime_hours(uuid, date, date) from public;
revoke all on function public.branch_admin_save_overtime_hours(uuid, text, date, date, jsonb) from public;
grant execute on function public.branch_admin_list_overtime_hours(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_save_overtime_hours(uuid, text, date, date, jsonb) to anon, authenticated;

comment on table public.branch_employee_overtime_hours is
  'Daily overtime hours by employee. Weekly overtime pay is daily rate divided by eight multiplied by total hours.';

commit;
