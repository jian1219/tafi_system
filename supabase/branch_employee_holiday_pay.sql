begin;

-- Run after tafi_complete_schema.sql, branch_employee_contributions.sql,
-- and branch_employee_overtime_hours.sql.
create table if not exists public.branch_employee_holiday_pay (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  holiday_date date not null,
  addition_type text not null check (
    addition_type in ('holiday_regular_pay', 'special_nonworking_holiday')
  ),
  percentage numeric(7, 2) not null check (percentage >= 0 and percentage <= 1000),
  daily_rate numeric(12, 2) not null check (daily_rate >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, employee_code, holiday_date, addition_type),
  constraint branch_employee_holiday_pay_week check (
    period_end >= period_start
    and period_end <= period_start + 6
    and holiday_date between period_start and period_end
  ),
  constraint branch_employee_holiday_pay_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_holiday_pay_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_holiday_pay_period_idx
  on public.branch_employee_holiday_pay (branch_id, period_start, addition_type, employee_code);

create table if not exists public.branch_employee_holiday_pay_base (
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  addition_type text not null check (
    addition_type in ('holiday_regular_pay', 'special_nonworking_holiday')
  ),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  primary key (branch_id, employee_code, period_start, addition_type),
  constraint branch_employee_holiday_pay_base_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict
);

create table if not exists public.branch_employee_holiday_pay_rule (
  branch_id uuid not null references public.branch(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  holiday_date date not null,
  addition_type text not null check (
    addition_type in ('holiday_regular_pay', 'special_nonworking_holiday')
  ),
  percentage numeric(7, 2) not null check (percentage >= 0 and percentage <= 1000),
  eligible_classifications text[] not null check (
    cardinality(eligible_classifications) > 0
    and array_position(eligible_classifications, null) is null
    and eligible_classifications <@ array['Regular', 'Probationary', 'Trainee']::text[]
  ),
  updated_by_branch_admin_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (branch_id, holiday_date, addition_type),
  constraint branch_employee_holiday_pay_rule_week check (
    period_end >= period_start
    and period_end <= period_start + 6
    and holiday_date between period_start and period_end
  ),
  constraint branch_employee_holiday_pay_rule_admin_fk
    foreign key (updated_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

insert into public.branch_employee_holiday_pay_rule (
  branch_id, period_start, period_end, holiday_date, addition_type,
  percentage, eligible_classifications, updated_by_branch_admin_id
)
select
  holiday.branch_id,
  min(holiday.period_start),
  max(holiday.period_end),
  holiday.holiday_date,
  holiday.addition_type,
  max(holiday.percentage),
  array_agg(distinct employee.employment_classification)
    filter (where employee.employment_classification in ('Regular', 'Probationary', 'Trainee')),
  (array_agg(holiday.created_by_branch_admin_id))[1]
from public.branch_employee_holiday_pay as holiday
join public.employee as employee
  on employee.branch_id = holiday.branch_id
  and employee.employee_code = holiday.employee_code
group by holiday.branch_id, holiday.holiday_date, holiday.addition_type
having count(*) filter (
  where employee.employment_classification in ('Regular', 'Probationary', 'Trainee')
) > 0
on conflict (branch_id, holiday_date, addition_type) do nothing;

alter table public.branch_employee_holiday_pay enable row level security;
alter table public.branch_employee_holiday_pay_base enable row level security;
alter table public.branch_employee_holiday_pay_rule enable row level security;
revoke all on table public.branch_employee_holiday_pay from public, anon, authenticated;
revoke all on table public.branch_employee_holiday_pay_base from public, anon, authenticated;
revoke all on table public.branch_employee_holiday_pay_rule from public, anon, authenticated;

create or replace function public.branch_admin_list_holiday_pay(
  p_session_token uuid,
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
declare
  v_branch_id uuid;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid holiday pay date range is required';
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
  select holiday.id, holiday.employee_code, employee.name,
    holiday.period_start, holiday.period_end, holiday.holiday_date,
    holiday.addition_type, holiday.percentage, holiday.daily_rate, holiday.amount
  from public.branch_employee_holiday_pay as holiday
  join public.employee as employee
    on employee.branch_id = holiday.branch_id
    and employee.employee_code = holiday.employee_code
  where holiday.branch_id = v_branch_id
    and holiday.holiday_date between p_period_start and p_period_end
  order by holiday.holiday_date desc, holiday.addition_type, employee.name;
end;
$$;

create or replace function public.branch_admin_list_holiday_pay_rules(
  p_session_token uuid,
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
declare
  v_branch_id uuid;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid holiday rule date range is required';
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
  select rule.period_start, rule.period_end, rule.holiday_date,
    rule.addition_type, rule.percentage, rule.eligible_classifications
  from public.branch_employee_holiday_pay_rule as rule
  where rule.branch_id = v_branch_id
    and rule.holiday_date between p_period_start and p_period_end
  order by rule.holiday_date desc, rule.addition_type;
end;
$$;

drop function if exists public.branch_admin_save_holiday_pay(uuid, date, date, date, text, numeric);

create or replace function public.branch_admin_save_holiday_pay(
  p_session_token uuid,
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
  v_branch_id uuid;
  v_employee_count integer;
  v_total_amount numeric;
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
    percentage, eligible_classifications, updated_by_branch_admin_id, updated_at
  )
  values (
    v_branch_id, p_period_start, p_period_end, p_holiday_date, p_addition_type,
    p_percentage, p_eligible_classifications, v_admin_id, now()
  )
  on conflict (branch_id, holiday_date, addition_type) do update
  set period_start = excluded.period_start,
    period_end = excluded.period_end,
    percentage = excluded.percentage,
    eligible_classifications = excluded.eligible_classifications,
    updated_by_branch_admin_id = excluded.updated_by_branch_admin_id,
    updated_at = now();

  insert into public.branch_employee_holiday_pay_base (
    branch_id, employee_code, period_start, period_end, addition_type, amount
  )
  select
    v_branch_id,
    employee.employee_code,
    p_period_start,
    p_period_end,
    p_addition_type,
    coalesce(existing_addition.amount, 0)
  from public.employee as employee
  left join public.branch_employee_payroll_addition as existing_addition
    on existing_addition.branch_id = v_branch_id
    and existing_addition.employee_code = employee.employee_code
    and existing_addition.period_start = p_period_start
    and existing_addition.period_end = p_period_end
    and existing_addition.addition_type = p_addition_type
  where employee.branch_id = v_branch_id
    and employee.employment_status = 'active'
  on conflict (branch_id, employee_code, period_start, addition_type) do nothing;

  delete from public.branch_employee_holiday_pay as holiday
  using public.employee as employee
  where holiday.branch_id = v_branch_id
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
    addition_type, percentage, daily_rate, amount, created_by_branch_admin_id
  )
  select
    v_branch_id,
    employee.employee_code,
    p_period_start,
    p_period_end,
    p_holiday_date,
    p_addition_type,
    p_percentage,
    employee.daily_rate,
    round(employee.daily_rate * p_percentage / 100, 2),
    v_admin_id
  from public.employee as employee
  where employee.branch_id = v_branch_id
    and employee.employment_status = 'active'
    and employee.employment_classification = any(p_eligible_classifications)
  on conflict (branch_id, employee_code, holiday_date, addition_type) do update
  set period_start = excluded.period_start,
    period_end = excluded.period_end,
    percentage = excluded.percentage,
    daily_rate = excluded.daily_rate,
    amount = excluded.amount,
    created_by_branch_admin_id = excluded.created_by_branch_admin_id,
    updated_at = now();

  get diagnostics v_employee_count = row_count;
  if v_employee_count = 0 then
    raise exception 'No active employees match the selected classifications';
  end if;

  insert into public.branch_employee_payroll_addition (
    branch_id, employee_code, period_start, period_end, addition_type,
    amount, created_by_branch_admin_id
  )
  select
    v_branch_id,
    employee.employee_code,
    p_period_start,
    p_period_end,
    p_addition_type,
    base.amount + coalesce(holiday_totals.amount, 0),
    v_admin_id
  from public.branch_employee_holiday_pay_base as base
  join public.employee as employee
    on employee.branch_id = base.branch_id
    and employee.employee_code = base.employee_code
  left join lateral (
    select sum(holiday.amount) as amount
    from public.branch_employee_holiday_pay as holiday
    where holiday.branch_id = v_branch_id
      and holiday.employee_code = base.employee_code
      and holiday.period_start = p_period_start
      and holiday.addition_type = p_addition_type
  ) as holiday_totals on true
  where base.branch_id = v_branch_id
    and base.period_start = p_period_start
    and base.addition_type = p_addition_type
  on conflict (branch_id, employee_code, period_start, addition_type) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    created_by_branch_admin_id = excluded.created_by_branch_admin_id,
    updated_at = now();

  select coalesce(sum(holiday.amount), 0)
  into v_total_amount
  from public.branch_employee_holiday_pay as holiday
  where holiday.branch_id = v_branch_id
    and holiday.period_start = p_period_start
    and holiday.holiday_date = p_holiday_date
    and holiday.addition_type = p_addition_type;

  return v_total_amount;
end;
$$;

revoke all on function public.branch_admin_list_holiday_pay(uuid, date, date) from public;
revoke all on function public.branch_admin_list_holiday_pay_rules(uuid, date, date) from public;
revoke all on function public.branch_admin_save_holiday_pay(uuid, date, date, date, text, numeric, text[]) from public;
grant execute on function public.branch_admin_list_holiday_pay(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_list_holiday_pay_rules(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_save_holiday_pay(uuid, date, date, date, text, numeric, text[]) to anon, authenticated;

comment on table public.branch_employee_holiday_pay is
  'Per-employee holiday pay calculated from a percentage of each eligible employee daily rate.';

commit;
