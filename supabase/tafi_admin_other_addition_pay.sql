begin;

-- Run after tafi_admin_management.sql, branch_employee_contributions.sql,
-- branch_employee_overtime_hours.sql, and branch_employee_holiday_pay.sql.
-- Then rerun the updated three branch feature SQL files to refresh their
-- upserts so they correctly switch the creator back to a Branch Admin.

alter table public.branch_employee_payroll_addition
  alter column created_by_branch_admin_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict;

alter table public.branch_employee_overtime_hours
  alter column created_by_branch_admin_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict;

alter table public.branch_employee_holiday_pay
  alter column created_by_branch_admin_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict;

alter table public.branch_employee_holiday_pay_rule
  alter column updated_by_branch_admin_id drop not null,
  add column if not exists updated_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_employee_payroll_addition_one_creator'
      and conrelid = 'public.branch_employee_payroll_addition'::regclass
  ) then
    alter table public.branch_employee_payroll_addition
      add constraint branch_employee_payroll_addition_one_creator
      check (
        (case when created_by_branch_admin_id is null then 0 else 1 end)
        + (case when created_by_tafi_admin_id is null then 0 else 1 end) = 1
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_employee_overtime_hours_one_creator'
      and conrelid = 'public.branch_employee_overtime_hours'::regclass
  ) then
    alter table public.branch_employee_overtime_hours
      add constraint branch_employee_overtime_hours_one_creator
      check (
        (case when created_by_branch_admin_id is null then 0 else 1 end)
        + (case when created_by_tafi_admin_id is null then 0 else 1 end) = 1
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_employee_holiday_pay_one_creator'
      and conrelid = 'public.branch_employee_holiday_pay'::regclass
  ) then
    alter table public.branch_employee_holiday_pay
      add constraint branch_employee_holiday_pay_one_creator
      check (
        (case when created_by_branch_admin_id is null then 0 else 1 end)
        + (case when created_by_tafi_admin_id is null then 0 else 1 end) = 1
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_employee_holiday_pay_rule_one_updater'
      and conrelid = 'public.branch_employee_holiday_pay_rule'::regclass
  ) then
    alter table public.branch_employee_holiday_pay_rule
      add constraint branch_employee_holiday_pay_rule_one_updater
      check (
        (case when updated_by_branch_admin_id is null then 0 else 1 end)
        + (case when updated_by_tafi_admin_id is null then 0 else 1 end) = 1
      );
  end if;
end;
$$;

create or replace function public.tafi_admin_list_other_additions(
  p_session_token uuid,
  p_branch_id uuid,
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
  addition_type text,
  amount numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or p_period_start is null or p_period_end is null or p_period_end < p_period_start
    or p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'A valid branch, date range, offset, and page size are required';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select addition.id, addition.employee_code, employee.name,
    addition.period_start, addition.period_end, addition.addition_type,
    addition.amount, addition.updated_at
  from public.branch_employee_payroll_addition as addition
  join public.employee as employee
    on employee.branch_id = addition.branch_id
    and employee.employee_code = addition.employee_code
  where addition.branch_id = p_branch_id
    and addition.period_start >= p_period_start
    and addition.period_end <= p_period_end
  order by addition.period_start, employee.name, addition.addition_type
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_save_other_addition(
  p_session_token uuid,
  p_branch_id uuid,
  p_employee_code text,
  p_period_start date,
  p_period_end date,
  p_addition_type text,
  p_amount numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();
  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or nullif(trim(p_employee_code), '') is null
    or p_addition_type is null or p_addition_type not in (
      'holiday_regular_pay', 'overtime_pay', 'special_nonworking_holiday'
    )
    or p_amount is null or p_amount < 0 then
    raise exception 'Enter a valid employee, branch, payroll week, addition type, and amount';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;
  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = p_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in the selected branch';
  end if;

  insert into public.branch_employee_payroll_addition (
    branch_id, employee_code, period_start, period_end, addition_type,
    amount, created_by_branch_admin_id, created_by_tafi_admin_id
  )
  values (
    p_branch_id, trim(p_employee_code), p_period_start, p_period_end,
    p_addition_type, p_amount, null, v_admin_id
  )
  on conflict (branch_id, employee_code, period_start, addition_type) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    created_by_branch_admin_id = null,
    created_by_tafi_admin_id = excluded.created_by_tafi_admin_id,
    updated_at = now();
  return true;
end;
$$;

create or replace function public.tafi_admin_list_other_overtime_hours(
  p_session_token uuid,
  p_branch_id uuid,
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_period_start is null
    or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid branch and overtime date range are required';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select overtime.id, overtime.employee_code, employee.name,
    overtime.overtime_date, overtime.hours
  from public.branch_employee_overtime_hours as overtime
  join public.employee as employee
    on employee.branch_id = overtime.branch_id
    and employee.employee_code = overtime.employee_code
  where overtime.branch_id = p_branch_id
    and overtime.overtime_date between p_period_start and p_period_end
  order by overtime.overtime_date desc, employee.name;
end;
$$;

create or replace function public.tafi_admin_save_other_overtime_hours(
  p_session_token uuid,
  p_branch_id uuid,
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
  v_daily_rate numeric;
  v_overtime_pay numeric;
  v_day jsonb;
  v_date date;
  v_hours numeric;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();
  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or nullif(trim(p_employee_code), '') is null
    or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or jsonb_typeof(p_daily_hours) is distinct from 'array'
    or jsonb_array_length(p_daily_hours) < 1 or jsonb_array_length(p_daily_hours) > 7 then
    raise exception 'Choose a valid branch, employee, payroll week, and daily overtime hours';
  end if;

  select employee.daily_rate into v_daily_rate
  from public.employee as employee
  where employee.branch_id = p_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active'
  for update;
  if not found then
    raise exception 'Active employee was not found in the selected branch';
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
      branch_id, employee_code, overtime_date, hours,
      created_by_branch_admin_id, created_by_tafi_admin_id, updated_at
    )
    values (
      p_branch_id, trim(p_employee_code), v_date, v_hours,
      null, v_admin_id, now()
    )
    on conflict (branch_id, employee_code, overtime_date) do update
    set hours = excluded.hours,
      created_by_branch_admin_id = null,
      created_by_tafi_admin_id = excluded.created_by_tafi_admin_id,
      updated_at = now();
  end loop;

  select round(v_daily_rate / 8 * coalesce(sum(overtime.hours), 0), 2)
  into v_overtime_pay
  from public.branch_employee_overtime_hours as overtime
  where overtime.branch_id = p_branch_id
    and overtime.employee_code = trim(p_employee_code)
    and overtime.overtime_date between p_period_start and p_period_end;

  insert into public.branch_employee_payroll_addition (
    branch_id, employee_code, period_start, period_end, addition_type,
    amount, created_by_branch_admin_id, created_by_tafi_admin_id
  )
  values (
    p_branch_id, trim(p_employee_code), p_period_start, p_period_end,
    'overtime_pay', v_overtime_pay, null, v_admin_id
  )
  on conflict (branch_id, employee_code, period_start, addition_type) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    created_by_branch_admin_id = null,
    created_by_tafi_admin_id = excluded.created_by_tafi_admin_id,
    updated_at = now();
  return v_overtime_pay;
end;
$$;

create or replace function public.tafi_admin_list_other_holiday_pay(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  holiday_date date,
  addition_type text,
  percentage numeric,
  daily_rate numeric,
  amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_period_start is null
    or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid branch and holiday pay date range are required';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select holiday.id, holiday.employee_code, employee.name,
    holiday.period_start, holiday.period_end, holiday.holiday_date,
    holiday.addition_type, holiday.percentage, holiday.daily_rate, holiday.amount
  from public.branch_employee_holiday_pay as holiday
  join public.employee as employee
    on employee.branch_id = holiday.branch_id
    and employee.employee_code = holiday.employee_code
  where holiday.branch_id = p_branch_id
    and holiday.holiday_date between p_period_start and p_period_end
  order by holiday.holiday_date desc, holiday.addition_type, employee.name;
end;
$$;

create or replace function public.tafi_admin_list_other_holiday_pay_rules(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  period_start date,
  period_end date,
  holiday_date date,
  addition_type text,
  percentage numeric,
  eligible_classifications text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_period_start is null
    or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid branch and holiday rule date range are required';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select rule.period_start, rule.period_end, rule.holiday_date,
    rule.addition_type, rule.percentage, rule.eligible_classifications
  from public.branch_employee_holiday_pay_rule as rule
  where rule.branch_id = p_branch_id
    and rule.holiday_date between p_period_start and p_period_end
  order by rule.holiday_date desc, rule.addition_type;
end;
$$;

create or replace function public.tafi_admin_save_other_holiday_pay(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date,
  p_holiday_date date,
  p_addition_type text,
  p_percentage numeric,
  p_eligible_classifications text[]
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_employee_count integer;
  v_total_amount numeric;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();
  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch as branch where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
  if p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or p_holiday_date is null
    or p_holiday_date < p_period_start or p_holiday_date > p_period_end then
    raise exception 'Choose a holiday date within a valid payroll week';
  end if;
  if p_addition_type is null or p_addition_type not in (
    'holiday_regular_pay', 'special_nonworking_holiday'
  ) then
    raise exception 'Choose a valid holiday pay type';
  end if;
  if p_percentage is null or p_percentage < 0 or p_percentage > 1000 then
    raise exception 'Enter a holiday pay percentage between 0 and 1000';
  end if;
  if p_eligible_classifications is null
    or cardinality(p_eligible_classifications) = 0
    or array_position(p_eligible_classifications, null) is not null
    or not (p_eligible_classifications <@ array['Regular', 'Probationary', 'Trainee']::text[]) then
    raise exception 'Select at least one valid employee classification';
  end if;

  insert into public.branch_employee_holiday_pay_rule (
    branch_id, period_start, period_end, holiday_date, addition_type,
    percentage, eligible_classifications,
    updated_by_branch_admin_id, updated_by_tafi_admin_id, updated_at
  )
  values (
    p_branch_id, p_period_start, p_period_end, p_holiday_date, p_addition_type,
    p_percentage, p_eligible_classifications, null, v_admin_id, now()
  )
  on conflict (branch_id, holiday_date, addition_type) do update
  set period_start = excluded.period_start,
    period_end = excluded.period_end,
    percentage = excluded.percentage,
    eligible_classifications = excluded.eligible_classifications,
    updated_by_branch_admin_id = null,
    updated_by_tafi_admin_id = excluded.updated_by_tafi_admin_id,
    updated_at = now();

  insert into public.branch_employee_holiday_pay_base (
    branch_id, employee_code, period_start, period_end, addition_type, amount
  )
  select p_branch_id, employee.employee_code, p_period_start, p_period_end,
    p_addition_type, coalesce(existing_addition.amount, 0)
  from public.employee as employee
  left join public.branch_employee_payroll_addition as existing_addition
    on existing_addition.branch_id = p_branch_id
    and existing_addition.employee_code = employee.employee_code
    and existing_addition.period_start = p_period_start
    and existing_addition.period_end = p_period_end
    and existing_addition.addition_type = p_addition_type
  where employee.branch_id = p_branch_id
    and employee.employment_status = 'active'
  on conflict (branch_id, employee_code, period_start, addition_type) do nothing;

  delete from public.branch_employee_holiday_pay as holiday
  using public.employee as employee
  where holiday.branch_id = p_branch_id
    and holiday.holiday_date = p_holiday_date
    and holiday.addition_type = p_addition_type
    and employee.branch_id = holiday.branch_id
    and employee.employee_code = holiday.employee_code
    and (
      employee.employment_status <> 'active'
      or not (employee.employment_classification = any(p_eligible_classifications))
    );

  insert into public.branch_employee_holiday_pay (
    branch_id, employee_code, period_start, period_end, holiday_date,
    addition_type, percentage, daily_rate, amount,
    created_by_branch_admin_id, created_by_tafi_admin_id
  )
  select p_branch_id, employee.employee_code, p_period_start, p_period_end,
    p_holiday_date, p_addition_type, p_percentage, employee.daily_rate,
    round(employee.daily_rate * p_percentage / 100, 2), null, v_admin_id
  from public.employee as employee
  where employee.branch_id = p_branch_id
    and employee.employment_status = 'active'
    and employee.employment_classification = any(p_eligible_classifications)
  on conflict (branch_id, employee_code, holiday_date, addition_type) do update
  set period_start = excluded.period_start,
    period_end = excluded.period_end,
    percentage = excluded.percentage,
    daily_rate = excluded.daily_rate,
    amount = excluded.amount,
    created_by_branch_admin_id = null,
    created_by_tafi_admin_id = excluded.created_by_tafi_admin_id,
    updated_at = now();

  get diagnostics v_employee_count = row_count;
  if v_employee_count = 0 then
    raise exception 'No active employees match the selected classifications';
  end if;

  insert into public.branch_employee_payroll_addition (
    branch_id, employee_code, period_start, period_end, addition_type,
    amount, created_by_branch_admin_id, created_by_tafi_admin_id
  )
  select p_branch_id, employee.employee_code, p_period_start, p_period_end,
    p_addition_type, base.amount + coalesce(holiday_totals.amount, 0), null, v_admin_id
  from public.branch_employee_holiday_pay_base as base
  join public.employee as employee
    on employee.branch_id = base.branch_id
    and employee.employee_code = base.employee_code
  left join lateral (
    select sum(holiday.amount) as amount
    from public.branch_employee_holiday_pay as holiday
    where holiday.branch_id = p_branch_id
      and holiday.employee_code = base.employee_code
      and holiday.period_start = p_period_start
      and holiday.addition_type = p_addition_type
  ) as holiday_totals on true
  where base.branch_id = p_branch_id
    and base.period_start = p_period_start
    and base.addition_type = p_addition_type
  on conflict (branch_id, employee_code, period_start, addition_type) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    created_by_branch_admin_id = null,
    created_by_tafi_admin_id = excluded.created_by_tafi_admin_id,
    updated_at = now();

  select coalesce(sum(holiday.amount), 0)
  into v_total_amount
  from public.branch_employee_holiday_pay as holiday
  where holiday.branch_id = p_branch_id
    and holiday.period_start = p_period_start
    and holiday.holiday_date = p_holiday_date
    and holiday.addition_type = p_addition_type;
  return v_total_amount;
end;
$$;

revoke all on function public.tafi_admin_list_other_additions(uuid, uuid, date, date, integer, integer) from public;
revoke all on function public.tafi_admin_save_other_addition(uuid, uuid, text, date, date, text, numeric) from public;
revoke all on function public.tafi_admin_list_other_overtime_hours(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_save_other_overtime_hours(uuid, uuid, text, date, date, jsonb) from public;
revoke all on function public.tafi_admin_list_other_holiday_pay(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_list_other_holiday_pay_rules(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_save_other_holiday_pay(uuid, uuid, date, date, date, text, numeric, text[]) from public;
grant execute on function public.tafi_admin_list_other_additions(uuid, uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.tafi_admin_save_other_addition(uuid, uuid, text, date, date, text, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_other_overtime_hours(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_save_other_overtime_hours(uuid, uuid, text, date, date, jsonb) to anon, authenticated;
grant execute on function public.tafi_admin_list_other_holiday_pay(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_other_holiday_pay_rules(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_save_other_holiday_pay(uuid, uuid, date, date, date, text, numeric, text[]) to anon, authenticated;

commit;
