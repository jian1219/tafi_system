begin;

-- Run after tafi_complete_schema.sql. The RPCs provide branch-scoped employee,
-- attendance, contribution, cash advance, and HDMF loan access using short-lived session tokens.
create table if not exists public.branch_admin_session (
  session_token uuid primary key,
  branch_admin_id uuid not null references public.branch_admin(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now()
);

create index if not exists branch_admin_session_expiry_idx
  on public.branch_admin_session (expires_at);

alter table public.branch_admin_session enable row level security;
revoke all on table public.branch_admin_session from public, anon, authenticated;

alter table public.employee add column if not exists address text;
alter table public.employee add column if not exists gender text;
alter table public.employee add column if not exists birthday date;
alter table public.employee add column if not exists sss_number text;
alter table public.employee add column if not exists pagibig_number text;
alter table public.employee add column if not exists philhealth_number text;
alter table public.employee
  add column if not exists employment_classification text
  check (employment_classification in ('Regular', 'Probationary', 'Trainee'));

create table if not exists public.branch_employee_contribution (
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null check (nullif(trim(employee_code), '') is not null),
  sss numeric(12, 2) not null default 0 check (sss >= 0),
  philhealth numeric(12, 2) not null default 0 check (philhealth >= 0),
  pagibig numeric(12, 2) not null default 0 check (pagibig >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, employee_code)
);

alter table public.branch_employee_contribution enable row level security;
revoke all on table public.branch_employee_contribution from public, anon, authenticated;

create table if not exists public.branch_employee_cash_advance (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  advance_amount numeric(12, 2) not null check (advance_amount > 0),
  weekly_deduction numeric(12, 2) not null check (
    weekly_deduction > 0 and weekly_deduction <= advance_amount
  ),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  constraint branch_employee_cash_advance_period check (
    period_end >= period_start and period_end <= period_start + 6
  ),
  constraint branch_employee_cash_advance_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_cash_advance_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_cash_advance_period_idx
  on public.branch_employee_cash_advance (branch_id, period_start desc, employee_code);

alter table public.branch_employee_cash_advance enable row level security;
revoke all on table public.branch_employee_cash_advance from public, anon, authenticated;

create table if not exists public.branch_employee_cash_advance_loan (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  advance_date date not null,
  advance_amount numeric(12, 2) not null check (advance_amount > 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, branch_id, employee_code),
  constraint branch_employee_cash_advance_loan_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_cash_advance_loan_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create table if not exists public.branch_employee_cash_advance_payment (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  advance_id uuid not null,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (advance_id, period_start),
  constraint branch_employee_cash_advance_payment_period check (
    period_end >= period_start and period_end <= period_start + 6
  ),
  constraint branch_employee_cash_advance_payment_loan_fk
    foreign key (advance_id, branch_id, employee_code)
    references public.branch_employee_cash_advance_loan (id, branch_id, employee_code) on delete cascade,
  constraint branch_employee_cash_advance_payment_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_cash_advance_payment_period_idx
  on public.branch_employee_cash_advance_payment (branch_id, period_start desc, employee_code);

alter table public.branch_employee_cash_advance_loan enable row level security;
alter table public.branch_employee_cash_advance_payment enable row level security;
revoke all on table public.branch_employee_cash_advance_loan from public, anon, authenticated;
revoke all on table public.branch_employee_cash_advance_payment from public, anon, authenticated;

insert into public.branch_employee_cash_advance_loan (
  id, branch_id, employee_code, advance_date, advance_amount,
  created_by_branch_admin_id, created_at
)
select id, branch_id, employee_code, created_at::date, advance_amount,
  created_by_branch_admin_id, created_at
from public.branch_employee_cash_advance
on conflict (id) do nothing;

insert into public.branch_employee_cash_advance_payment (
  id, branch_id, advance_id, employee_code, period_start, period_end,
  amount, created_by_branch_admin_id, created_at, updated_at
)
select id, branch_id, id, employee_code, period_start, period_end,
  weekly_deduction, created_by_branch_admin_id, created_at, created_at
from public.branch_employee_cash_advance
on conflict (advance_id, period_start) do nothing;

create table if not exists public.branch_employee_hdmf_loan (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  loan_amount numeric(12, 2) not null check (loan_amount > 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, branch_id, employee_code),
  constraint branch_employee_hdmf_loan_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_hdmf_loan_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create table if not exists public.branch_employee_hdmf_payment (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  loan_id uuid not null,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  unique (loan_id, period_start),
  constraint branch_employee_hdmf_payment_period check (
    period_end >= period_start and period_end <= period_start + 6
  ),
  constraint branch_employee_hdmf_payment_loan_fk
    foreign key (loan_id, branch_id, employee_code)
    references public.branch_employee_hdmf_loan (id, branch_id, employee_code) on delete cascade,
  constraint branch_employee_hdmf_payment_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_hdmf_payment_period_idx
  on public.branch_employee_hdmf_payment (branch_id, period_start desc, employee_code);

create table if not exists public.branch_employee_undertime_deduction (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, employee_code, period_start),
  constraint branch_employee_undertime_deduction_period check (
    period_end >= period_start and period_end <= period_start + 6
  ),
  constraint branch_employee_undertime_deduction_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_undertime_deduction_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_undertime_deduction_period_idx
  on public.branch_employee_undertime_deduction (branch_id, period_start, employee_code);

create table if not exists public.branch_employee_payroll_addition (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  employee_code text not null,
  period_start date not null,
  period_end date not null,
  addition_type text not null check (
    addition_type in ('holiday_regular_pay', 'overtime_pay', 'special_nonworking_holiday')
  ),
  amount numeric(12, 2) not null check (amount >= 0),
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, employee_code, period_start, addition_type),
  constraint branch_employee_payroll_addition_period check (
    period_end >= period_start and period_end <= period_start + 6
  ),
  constraint branch_employee_payroll_addition_employee_fk
    foreign key (branch_id, employee_code)
    references public.employee (branch_id, employee_code) on delete restrict,
  constraint branch_employee_payroll_addition_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create index if not exists branch_employee_payroll_addition_period_idx
  on public.branch_employee_payroll_addition (branch_id, period_start, employee_code);

alter table public.branch_employee_hdmf_loan enable row level security;
alter table public.branch_employee_hdmf_payment enable row level security;
alter table public.branch_employee_undertime_deduction enable row level security;
alter table public.branch_employee_payroll_addition enable row level security;
revoke all on table public.branch_employee_hdmf_loan from public, anon, authenticated;
revoke all on table public.branch_employee_hdmf_payment from public, anon, authenticated;
revoke all on table public.branch_employee_undertime_deduction from public, anon, authenticated;
revoke all on table public.branch_employee_payroll_addition from public, anon, authenticated;

create table if not exists public.branch_weekly_payroll_snapshot (
  branch_id uuid not null references public.branch(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  created_by_branch_admin_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (branch_id, period_start),
  constraint branch_weekly_payroll_snapshot_dates check (
    period_end >= period_start and period_end <= period_start + 6
  ),
  constraint branch_weekly_payroll_snapshot_admin_fk
    foreign key (created_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create table if not exists public.branch_weekly_payroll_snapshot_item (
  branch_id uuid not null,
  period_start date not null,
  employee_code text not null,
  employee_name text not null,
  employee_position text not null,
  present_days integer not null default 0 check (present_days >= 0),
  late_days integer not null default 0 check (late_days >= 0),
  absent_days integer not null default 0 check (absent_days >= 0),
  weekly_gross numeric(12, 2) not null default 0 check (weekly_gross >= 0),
  sss numeric(12, 2) not null default 0 check (sss >= 0),
  philhealth numeric(12, 2) not null default 0 check (philhealth >= 0),
  pagibig numeric(12, 2) not null default 0 check (pagibig >= 0),
  cash_advance_deduction numeric(12, 2) not null default 0 check (cash_advance_deduction >= 0),
  hdmf_loan_deduction numeric(12, 2) not null default 0 check (hdmf_loan_deduction >= 0),
  undertime_deduction numeric(12, 2) not null default 0 check (undertime_deduction >= 0),
  holiday_regular_pay numeric(12, 2) not null default 0 check (holiday_regular_pay >= 0),
  overtime_pay numeric(12, 2) not null default 0 check (overtime_pay >= 0),
  special_nonworking_holiday_pay numeric(12, 2) not null default 0 check (special_nonworking_holiday_pay >= 0),
  net_pay numeric(12, 2) not null,
  primary key (branch_id, period_start, employee_code),
  constraint branch_weekly_payroll_snapshot_item_header_fk
    foreign key (branch_id, period_start)
    references public.branch_weekly_payroll_snapshot (branch_id, period_start) on delete cascade
);

alter table public.branch_weekly_payroll_snapshot_item
  add column if not exists cash_advance_deduction numeric(12, 2) not null default 0
  check (cash_advance_deduction >= 0);
alter table public.branch_weekly_payroll_snapshot_item
  add column if not exists hdmf_loan_deduction numeric(12, 2) not null default 0
  check (hdmf_loan_deduction >= 0);
alter table public.branch_weekly_payroll_snapshot_item
  add column if not exists undertime_deduction numeric(12, 2) not null default 0
  check (undertime_deduction >= 0);
alter table public.branch_weekly_payroll_snapshot_item
  add column if not exists holiday_regular_pay numeric(12, 2) not null default 0
  check (holiday_regular_pay >= 0);
alter table public.branch_weekly_payroll_snapshot_item
  add column if not exists overtime_pay numeric(12, 2) not null default 0
  check (overtime_pay >= 0);
alter table public.branch_weekly_payroll_snapshot_item
  add column if not exists special_nonworking_holiday_pay numeric(12, 2) not null default 0
  check (special_nonworking_holiday_pay >= 0);

alter table public.branch_weekly_payroll_snapshot enable row level security;
alter table public.branch_weekly_payroll_snapshot_item enable row level security;
revoke all on table public.branch_weekly_payroll_snapshot from public, anon, authenticated;
revoke all on table public.branch_weekly_payroll_snapshot_item from public, anon, authenticated;

drop function if exists public.branch_admin_login(text, text);

create function public.branch_admin_login(p_email text, p_password text)
returns table (
  admin_id uuid,
  admin_name text,
  branch_id uuid,
  branch_name text,
  branch_location text,
  admin_email text,
  session_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_session_token uuid;
begin
  select ba.id as admin_id, ba.name as admin_name, b.id as branch_id,
    b.name as branch_name, b.location as branch_location, ba.email as admin_email
  into v_admin
  from public.branch_admin as ba
  join public.branch as b on b.id = ba.branch_id
  where lower(ba.email) = lower(trim(p_email))
    and ba.password_hash = extensions.crypt(p_password, ba.password_hash)
  limit 1;

  if not found then
    return;
  end if;

  delete from public.branch_admin_session where expires_at <= now();

  v_session_token := gen_random_uuid();
  insert into public.branch_admin_session (session_token, branch_admin_id)
  values (v_session_token, v_admin.admin_id);

  return query
  select v_admin.admin_id, v_admin.admin_name, v_admin.branch_id,
    v_admin.branch_name, v_admin.branch_location, v_admin.admin_email,
    v_session_token;
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
  sss_number text,
  pagibig_number text,
  philhealth_number text,
  employment_classification text
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
    employee.birthday, employee.sss_number, employee.pagibig_number,
    employee.philhealth_number, employee.employment_classification
  from public.employee as employee
  left join public.employee_attendance as attendance
    on attendance.employee_id = employee.id
    and attendance.attendance_date = current_date
  where employee.branch_id = v_branch_id
    and employee.employment_status = 'active'
  order by employee.name;
end;
$$;

create or replace function public.branch_admin_update_employee_profile(
  p_session_token uuid,
  p_employee_code text,
  p_address text,
  p_gender text,
  p_birthday date,
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
    or p_employment_classification not in ('Regular', 'Probationary', 'Trainee')
    or (p_birthday is not null and p_birthday > current_date) then
    raise exception 'Enter a valid employee profile and employment status';
  end if;
  if p_gender is not null and p_gender not in ('Male', 'Female', 'Other', 'Prefer not to say') then
    raise exception 'Select a valid gender option';
  end if;

  update public.employee
  set address = nullif(trim(p_address), ''),
    gender = p_gender,
    birthday = p_birthday,
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

create or replace function public.branch_admin_create_employee(
  p_session_token uuid,
  p_name text,
  p_position text
)
returns table (employee_code text, name text, employee_position text, daily_rate numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_employee_code text;
begin
  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if nullif(trim(p_name), '') is null or nullif(trim(p_position), '') is null then
    raise exception 'Employee name and position are required';
  end if;

  v_employee_code := 'EMP-' || upper(replace(gen_random_uuid()::text, '-', ''));

  return query
  insert into public.employee as new_employee (branch_id, employee_code, name, position)
  values (v_branch_id, v_employee_code, trim(p_name), trim(p_position))
  returning new_employee.employee_code, new_employee.name,
    new_employee.position, new_employee.daily_rate;
end;
$$;

create or replace function public.branch_admin_update_employee_daily_rate(
  p_session_token uuid,
  p_employee_code text,
  p_daily_rate numeric
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
  if p_daily_rate is null or p_daily_rate < 0 then
    raise exception 'Daily rate must be zero or more';
  end if;

  update public.employee
  set daily_rate = p_daily_rate, updated_at = now()
  where branch_id = v_branch_id
    and employee_code = trim(p_employee_code)
    and employment_status = 'active';

  if not found then
    raise exception 'Employee was not found in this branch';
  end if;

  return true;
end;
$$;

create or replace function public.branch_admin_create_cash_advance(
  p_session_token uuid,
  p_employee_code text,
  p_period_start date,
  p_period_end date,
  p_advance_amount numeric,
  p_weekly_deduction numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_cash_advance_id uuid;
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
    or p_period_end > p_period_start + 6
    or p_advance_amount is null
    or p_advance_amount <= 0
    or p_weekly_deduction is null
    or p_weekly_deduction <= 0
    or p_weekly_deduction > p_advance_amount then
    raise exception 'Enter a valid employee, payroll week, advance amount, and weekly deduction';
  end if;

  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_cash_advance_loan (
    branch_id, employee_code, advance_date, advance_amount, created_by_branch_admin_id
  )
  values (
    v_branch_id, trim(p_employee_code), p_period_start, p_advance_amount, v_admin_id
  )
  returning id into v_cash_advance_id;

  insert into public.branch_employee_cash_advance_payment (
    branch_id, advance_id, employee_code, period_start, period_end,
    amount, created_by_branch_admin_id
  )
  values (
    v_branch_id, v_cash_advance_id, trim(p_employee_code), p_period_start,
    p_period_end, p_weekly_deduction, v_admin_id
  );

  return v_cash_advance_id;
end;
$$;

create or replace function public.branch_admin_list_cash_advances(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500,
  p_period_start date default null,
  p_period_end date default null
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  advance_amount numeric,
  weekly_deduction numeric,
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
    raise exception 'Cash advance history page offset and limit are invalid';
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
  select payment.id, payment.employee_code, employee.name,
    payment.period_start, payment.period_end, loan.advance_amount,
    payment.amount, payment.created_at
  from public.branch_employee_cash_advance_payment as payment
  join public.branch_employee_cash_advance_loan as loan
    on loan.id = payment.advance_id
    and loan.branch_id = payment.branch_id
    and loan.employee_code = payment.employee_code
  join public.employee as employee
    on employee.branch_id = payment.branch_id
    and employee.employee_code = payment.employee_code
  where payment.branch_id = v_branch_id
    and (p_period_start is null or payment.period_start >= p_period_start)
    and (p_period_end is null or payment.period_end <= p_period_end)
  order by payment.period_start desc, employee.name, payment.created_at desc, payment.id
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_create_cash_advance_loan(
  p_session_token uuid,
  p_employee_code text,
  p_advance_date date,
  p_advance_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_advance_id uuid;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if nullif(trim(p_employee_code), '') is null or p_advance_date is null
    or p_advance_amount is null or p_advance_amount <= 0 then
    raise exception 'Employee, cash advance date, and amount greater than zero are required';
  end if;
  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_cash_advance_loan (
    branch_id, employee_code, advance_date, advance_amount, created_by_branch_admin_id
  )
  values (v_branch_id, trim(p_employee_code), p_advance_date, p_advance_amount, v_admin_id)
  returning id into v_advance_id;

  return v_advance_id;
end;
$$;

create or replace function public.branch_admin_list_cash_advance_loans(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  advance_date date,
  advance_amount numeric,
  amount_paid numeric,
  balance numeric,
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
    raise exception 'Cash advance history page offset and limit are invalid';
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
  select loan.id, loan.employee_code, employee.name, loan.advance_date,
    loan.advance_amount, coalesce(payment_totals.amount_paid, 0),
    greatest(loan.advance_amount - coalesce(payment_totals.amount_paid, 0), 0),
    loan.created_at
  from public.branch_employee_cash_advance_loan as loan
  join public.employee as employee
    on employee.branch_id = loan.branch_id
    and employee.employee_code = loan.employee_code
  left join lateral (
    select sum(payment.amount) as amount_paid
    from public.branch_employee_cash_advance_payment as payment
    where payment.advance_id = loan.id
      and payment.branch_id = loan.branch_id
  ) as payment_totals on true
  where loan.branch_id = v_branch_id
  order by loan.advance_date desc, employee.name, loan.created_at desc, loan.id
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_list_cash_advance_payments(
  p_session_token uuid,
  p_period_start date default null,
  p_period_end date default null,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  advance_id uuid,
  employee_code text,
  period_start date,
  period_end date,
  amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Cash advance payment page offset and limit are invalid';
  end if;
  if (p_period_start is null) <> (p_period_end is null)
    or (p_period_start is not null and p_period_end < p_period_start) then
    raise exception 'Both cash advance period dates must be provided and valid';
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
  select payment.id, payment.advance_id, payment.employee_code,
    payment.period_start, payment.period_end, payment.amount
  from public.branch_employee_cash_advance_payment as payment
  where payment.branch_id = v_branch_id
    and (p_period_start is null or payment.period_start >= p_period_start)
    and (p_period_end is null or payment.period_end <= p_period_end)
  order by payment.period_start, payment.employee_code, payment.advance_id
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_save_cash_advance_weekly_deductions(
  p_session_token uuid,
  p_advance_id uuid,
  p_payments jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_advance public.branch_employee_cash_advance_loan%rowtype;
  v_payment jsonb;
  v_period_start date;
  v_period_end date;
  v_amount numeric;
  v_period_starts date[] := array[]::date[];
  v_total_paid numeric;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_advance_id is null or jsonb_typeof(p_payments) is distinct from 'array' then
    raise exception 'A cash advance and weekly deduction array are required';
  end if;
  if jsonb_array_length(p_payments) < 1 or jsonb_array_length(p_payments) > 6 then
    raise exception 'A cash advance and one to six weekly deduction entries are required';
  end if;

  select loan.* into v_advance
  from public.branch_employee_cash_advance_loan as loan
  where loan.id = p_advance_id and loan.branch_id = v_branch_id
  for update;
  if not found then
    raise exception 'Cash advance was not found in this branch';
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    if jsonb_typeof(v_payment) is distinct from 'object'
      or nullif(v_payment->>'period_start', '') is null
      or nullif(v_payment->>'period_end', '') is null
      or nullif(v_payment->>'amount', '') is null then
      raise exception 'Each weekly deduction must include dates and an amount';
    end if;

    v_period_start := (v_payment->>'period_start')::date;
    v_period_end := (v_payment->>'period_end')::date;
    v_amount := (v_payment->>'amount')::numeric;
    if v_period_end < v_period_start or v_period_end > v_period_start + 6
      or v_amount < 0 then
      raise exception 'Weekly deduction dates or amount are invalid';
    end if;
    if v_period_start = any(v_period_starts) then
      raise exception 'A payroll week may only be listed once';
    end if;
    v_period_starts := array_append(v_period_starts, v_period_start);

    if v_amount = 0 then
      delete from public.branch_employee_cash_advance_payment
      where advance_id = v_advance.id
        and branch_id = v_branch_id
        and period_start = v_period_start;
    else
      insert into public.branch_employee_cash_advance_payment (
        branch_id, advance_id, employee_code, period_start, period_end,
        amount, created_by_branch_admin_id
      )
      values (
        v_branch_id, v_advance.id, v_advance.employee_code,
        v_period_start, v_period_end, v_amount, v_admin_id
      )
      on conflict (advance_id, period_start) do update
      set period_end = excluded.period_end,
        amount = excluded.amount,
        created_by_branch_admin_id = excluded.created_by_branch_admin_id,
        updated_at = now();
    end if;
  end loop;

  select coalesce(sum(payment.amount), 0) into v_total_paid
  from public.branch_employee_cash_advance_payment as payment
  where payment.advance_id = v_advance.id
    and payment.branch_id = v_branch_id;
  if v_total_paid > v_advance.advance_amount then
    raise exception 'Weekly deductions cannot exceed the remaining cash advance balance';
  end if;

  return true;
end;
$$;

create or replace function public.branch_admin_list_attendance(
  p_session_token uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  employee_code text,
  attendance_date date,
  status text,
  late_minutes integer
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
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid attendance date range is required';
  end if;

  return query
  select employee.employee_code, attendance.attendance_date,
    attendance.status, attendance.late_minutes
  from public.employee_attendance as attendance
  join public.employee as employee on employee.id = attendance.employee_id
  where employee.branch_id = v_branch_id
    and attendance.attendance_date between p_start_date and p_end_date
  order by employee.employee_code, attendance.attendance_date;
end;
$$;

create or replace function public.branch_admin_list_attendance_history(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  employee_code text,
  employee_name text,
  employee_position text,
  attendance_date date,
  status text,
  late_minutes integer,
  daily_rate_snapshot numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'History page offset and limit are invalid';
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
  select employee.employee_code, employee.name, employee.position,
    attendance.attendance_date, attendance.status, attendance.late_minutes,
    attendance.daily_rate_snapshot
  from public.employee_attendance as attendance
  join public.employee as employee on employee.id = attendance.employee_id
  where employee.branch_id = v_branch_id
  order by attendance.attendance_date desc, employee.name, employee.employee_code
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_create_hdmf_loan(
  p_session_token uuid,
  p_employee_code text,
  p_loan_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_loan_id uuid;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if nullif(trim(p_employee_code), '') is null or p_loan_amount is null or p_loan_amount <= 0 then
    raise exception 'Employee code and an HDMF loan amount greater than zero are required';
  end if;
  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_hdmf_loan (
    branch_id, employee_code, loan_amount, created_by_branch_admin_id
  )
  values (v_branch_id, trim(p_employee_code), p_loan_amount, v_admin_id)
  returning id into v_loan_id;

  return v_loan_id;
end;
$$;

create or replace function public.branch_admin_list_hdmf_loans(p_session_token uuid)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  loan_amount numeric,
  amount_paid numeric,
  balance numeric,
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
  select loan.id, loan.employee_code, employee.name, loan.loan_amount,
    coalesce(payments.amount_paid, 0),
    greatest(loan.loan_amount - coalesce(payments.amount_paid, 0), 0),
    loan.created_at
  from public.branch_employee_hdmf_loan as loan
  join public.employee as employee
    on employee.branch_id = loan.branch_id
    and employee.employee_code = loan.employee_code
  left join lateral (
    select sum(payment.amount) as amount_paid
    from public.branch_employee_hdmf_payment as payment
    where payment.loan_id = loan.id
      and payment.branch_id = loan.branch_id
  ) as payments on true
  where loan.branch_id = v_branch_id
  order by loan.created_at desc, employee.name, loan.id;
end;
$$;

create or replace function public.branch_admin_create_hdmf_payment(
  p_session_token uuid,
  p_loan_id uuid,
  p_period_start date,
  p_period_end date,
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
  v_loan public.branch_employee_hdmf_loan%rowtype;
  v_amount_paid numeric;
  v_payment_id uuid;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_loan_id is null or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid HDMF loan, payroll week, and repayment amount';
  end if;

  select loan.* into v_loan
  from public.branch_employee_hdmf_loan as loan
  where loan.id = p_loan_id and loan.branch_id = v_branch_id
  for update;
  if not found then
    raise exception 'HDMF loan was not found in this branch';
  end if;

  select coalesce(sum(payment.amount), 0) into v_amount_paid
  from public.branch_employee_hdmf_payment as payment
  where payment.loan_id = v_loan.id and payment.branch_id = v_branch_id;

  if p_amount > v_loan.loan_amount - v_amount_paid then
    raise exception 'Repayment cannot exceed the remaining HDMF loan balance';
  end if;

  insert into public.branch_employee_hdmf_payment (
    branch_id, loan_id, employee_code, period_start, period_end,
    amount, created_by_branch_admin_id
  )
  values (
    v_branch_id, v_loan.id, v_loan.employee_code, p_period_start, p_period_end,
    p_amount, v_admin_id
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.branch_admin_list_hdmf_payments(
  p_session_token uuid,
  p_period_start date default null,
  p_period_end date default null
)
returns table (
  id uuid,
  loan_id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
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
  select ba.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if (p_period_start is null) <> (p_period_end is null)
    or (p_period_start is not null and p_period_end < p_period_start) then
    raise exception 'Both repayment period dates must be provided and valid';
  end if;

  return query
  select payment.id, payment.loan_id, payment.employee_code, employee.name,
    payment.period_start, payment.period_end, payment.amount, payment.created_at
  from public.branch_employee_hdmf_payment as payment
  join public.employee as employee
    on employee.branch_id = payment.branch_id
    and employee.employee_code = payment.employee_code
  where payment.branch_id = v_branch_id
    and (p_period_start is null or payment.period_start >= p_period_start)
    and (p_period_end is null or payment.period_end <= p_period_end)
  order by payment.period_start desc, employee.name, payment.created_at desc;
end;
$$;

create or replace function public.branch_admin_list_undertime_deductions(
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
  amount numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Undertime deduction page offset and limit are invalid';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid undertime payroll date range is required';
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
  select deduction.id, deduction.employee_code, employee.name,
    deduction.period_start, deduction.period_end, deduction.amount, deduction.updated_at
  from public.branch_employee_undertime_deduction as deduction
  join public.employee as employee
    on employee.branch_id = deduction.branch_id
    and employee.employee_code = deduction.employee_code
  where deduction.branch_id = v_branch_id
    and deduction.period_start >= p_period_start
    and deduction.period_end <= p_period_end
  order by deduction.period_start, employee.name, deduction.employee_code
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_save_undertime_deduction(
  p_session_token uuid,
  p_employee_code text,
  p_period_start date,
  p_period_end date,
  p_amount numeric
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
  if nullif(trim(p_employee_code), '') is null
    or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or p_amount is null or p_amount < 0 then
    raise exception 'Enter an employee, valid payroll week, and non-negative undertime amount';
  end if;
  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_undertime_deduction (
    branch_id, employee_code, period_start, period_end,
    amount, created_by_branch_admin_id
  )
  values (
    v_branch_id, trim(p_employee_code), p_period_start, p_period_end,
    p_amount, v_admin_id
  )
  on conflict (branch_id, employee_code, period_start) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    created_by_branch_admin_id = excluded.created_by_branch_admin_id,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.branch_admin_list_payroll_additions(
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
  addition_type text,
  amount numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Payroll addition page offset and limit are invalid';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'A valid payroll addition date range is required';
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
  select addition.id, addition.employee_code, employee.name,
    addition.period_start, addition.period_end, addition.addition_type,
    addition.amount, addition.updated_at
  from public.branch_employee_payroll_addition as addition
  join public.employee as employee
    on employee.branch_id = addition.branch_id
    and employee.employee_code = addition.employee_code
  where addition.branch_id = v_branch_id
    and addition.period_start >= p_period_start
    and addition.period_end <= p_period_end
  order by addition.period_start, employee.name, addition.addition_type
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_save_payroll_addition(
  p_session_token uuid,
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
  if nullif(trim(p_employee_code), '') is null
    or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or p_amount is null or p_amount < 0 or p_addition_type is null
    or p_addition_type not in (
      'holiday_regular_pay', 'overtime_pay', 'special_nonworking_holiday'
    ) then
    raise exception 'Enter a valid employee, payroll week, addition type, and non-negative amount';
  end if;
  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_payroll_addition (
    branch_id, employee_code, period_start, period_end, addition_type,
    amount, created_by_branch_admin_id
  )
  values (
    v_branch_id, trim(p_employee_code), p_period_start, p_period_end,
    p_addition_type, p_amount, v_admin_id
  )
  on conflict (branch_id, employee_code, period_start, addition_type) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    created_by_branch_admin_id = excluded.created_by_branch_admin_id,
    updated_at = now();

  return true;
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
    undertime_deduction, holiday_regular_pay, overtime_pay,
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
      end), 2)),
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
    additions.holiday_regular_pay, additions.overtime_pay,
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
      + item.hdmf_loan_deduction + item.undertime_deduction
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

create or replace function public.branch_admin_save_attendance(
  p_session_token uuid,
  p_attendance_date date,
  p_records jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
  v_record jsonb;
  v_employee_id uuid;
  v_status text;
  v_late_minutes integer;
  v_daily_rate numeric;
begin
  select ba.id, ba.branch_id into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as ba on ba.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_attendance_date is null or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Attendance date and an array of employee records are required';
  end if;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    select employee.id, employee.daily_rate
    into v_employee_id, v_daily_rate
    from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(v_record->>'employee_code')
      and employee.employment_status = 'active';

    if not found then
      raise exception 'Employee % was not found in this branch', v_record->>'employee_code';
    end if;

    v_status := v_record->>'status';
    v_late_minutes := coalesce((v_record->>'late_minutes')::integer, 0);

    if v_status is null or v_status not in (
      'not_marked', 'present', 'present_late', 'absent',
      'maternity_leave', 'paternity_leave', 'authorized_leave',
      'birthday_leave', 'vl_with_pay', 'vl_without_pay', 'day_off'
    ) then
      raise exception 'Invalid attendance status for employee %', v_record->>'employee_code';
    end if;
    if (v_status = 'present_late' and v_late_minutes < 1)
      or (v_status <> 'present_late' and v_late_minutes <> 0) then
      raise exception 'Late minutes do not match attendance status for employee %', v_record->>'employee_code';
    end if;

    insert into public.employee_attendance (
      employee_id, attendance_date, status, late_minutes,
      daily_rate_snapshot, submitted_by, updated_at
    )
    values (
      v_employee_id, p_attendance_date, v_status, v_late_minutes,
      v_daily_rate, v_admin_id, now()
    )
    on conflict (employee_id, attendance_date) do update
    set status = excluded.status,
      late_minutes = excluded.late_minutes,
      daily_rate_snapshot = excluded.daily_rate_snapshot,
      submitted_by = excluded.submitted_by,
      updated_at = now();
  end loop;

  return true;
end;
$$;

create or replace function public.branch_admin_list_employee_contributions(
  p_session_token uuid
)
returns table (
  employee_code text,
  sss numeric,
  philhealth numeric,
  pagibig numeric
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
  select contribution.employee_code, contribution.sss,
    contribution.philhealth, contribution.pagibig
  from public.branch_employee_contribution as contribution
  where contribution.branch_id = v_branch_id
  order by contribution.employee_code;
end;
$$;

create or replace function public.branch_admin_save_employee_contribution(
  p_session_token uuid,
  p_employee_code text,
  p_sss numeric,
  p_philhealth numeric,
  p_pagibig numeric
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
    or p_sss is null or p_sss < 0
    or p_philhealth is null or p_philhealth < 0
    or p_pagibig is null or p_pagibig < 0 then
    raise exception 'Employee code and non-negative contribution amounts are required';
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

  insert into public.branch_employee_contribution (
    branch_id, employee_code, sss, philhealth, pagibig, updated_at
  )
  values (
    v_branch_id, trim(p_employee_code), p_sss, p_philhealth, p_pagibig, now()
  )
  on conflict (branch_id, employee_code) do update
  set sss = excluded.sss,
    philhealth = excluded.philhealth,
    pagibig = excluded.pagibig,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.branch_admin_logout(p_session_token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with revoked as (
    delete from public.branch_admin_session
    where session_token = p_session_token
    returning 1
  )
  select exists (select 1 from revoked);
$$;

revoke all on function public.branch_admin_login(text, text) from public;
revoke all on function public.branch_admin_list_employees(uuid) from public;
revoke all on function public.branch_admin_create_employee(uuid, text, text) from public;
revoke all on function public.branch_admin_update_employee_profile(uuid, text, text, text, date, text, text, text, text) from public;
revoke all on function public.branch_admin_update_employee_daily_rate(uuid, text, numeric) from public;
revoke all on function public.branch_admin_create_cash_advance(uuid, text, date, date, numeric, numeric) from public;
revoke all on function public.branch_admin_list_cash_advances(uuid, integer, integer, date, date) from public;
revoke all on function public.branch_admin_create_cash_advance_loan(uuid, text, date, numeric) from public;
revoke all on function public.branch_admin_list_cash_advance_loans(uuid, integer, integer) from public;
revoke all on function public.branch_admin_list_cash_advance_payments(uuid, date, date, integer, integer) from public;
revoke all on function public.branch_admin_save_cash_advance_weekly_deductions(uuid, uuid, jsonb) from public;
revoke all on function public.branch_admin_create_hdmf_loan(uuid, text, numeric) from public;
revoke all on function public.branch_admin_list_hdmf_loans(uuid) from public;
revoke all on function public.branch_admin_create_hdmf_payment(uuid, uuid, date, date, numeric) from public;
revoke all on function public.branch_admin_list_hdmf_payments(uuid, date, date) from public;
revoke all on function public.branch_admin_list_undertime_deductions(uuid, date, date, integer, integer) from public;
revoke all on function public.branch_admin_save_undertime_deduction(uuid, text, date, date, numeric) from public;
revoke all on function public.branch_admin_list_payroll_additions(uuid, date, date, integer, integer) from public;
revoke all on function public.branch_admin_save_payroll_addition(uuid, text, date, date, text, numeric) from public;
revoke all on function public.branch_admin_list_attendance(uuid, date, date) from public;
revoke all on function public.branch_admin_list_attendance_history(uuid, integer, integer) from public;
revoke all on function public.branch_admin_save_weekly_payroll_snapshot(uuid, date, date) from public;
revoke all on function public.branch_admin_list_weekly_payroll_snapshots(uuid, integer, integer) from public;
revoke all on function public.branch_admin_save_attendance(uuid, date, jsonb) from public;
revoke all on function public.branch_admin_list_employee_contributions(uuid) from public;
revoke all on function public.branch_admin_save_employee_contribution(uuid, text, numeric, numeric, numeric) from public;
revoke all on function public.branch_admin_logout(uuid) from public;

grant execute on function public.branch_admin_login(text, text) to anon, authenticated;
grant execute on function public.branch_admin_list_employees(uuid) to anon, authenticated;
grant execute on function public.branch_admin_create_employee(uuid, text, text) to anon, authenticated;
grant execute on function public.branch_admin_update_employee_profile(uuid, text, text, text, date, text, text, text, text) to anon, authenticated;
grant execute on function public.branch_admin_update_employee_daily_rate(uuid, text, numeric) to anon, authenticated;
grant execute on function public.branch_admin_create_cash_advance(uuid, text, date, date, numeric, numeric) to anon, authenticated;
grant execute on function public.branch_admin_list_cash_advances(uuid, integer, integer, date, date) to anon, authenticated;
grant execute on function public.branch_admin_create_cash_advance_loan(uuid, text, date, numeric) to anon, authenticated;
grant execute on function public.branch_admin_list_cash_advance_loans(uuid, integer, integer) to anon, authenticated;
grant execute on function public.branch_admin_list_cash_advance_payments(uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.branch_admin_save_cash_advance_weekly_deductions(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.branch_admin_create_hdmf_loan(uuid, text, numeric) to anon, authenticated;
grant execute on function public.branch_admin_list_hdmf_loans(uuid) to anon, authenticated;
grant execute on function public.branch_admin_create_hdmf_payment(uuid, uuid, date, date, numeric) to anon, authenticated;
grant execute on function public.branch_admin_list_hdmf_payments(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_list_undertime_deductions(uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.branch_admin_save_undertime_deduction(uuid, text, date, date, numeric) to anon, authenticated;
grant execute on function public.branch_admin_list_payroll_additions(uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.branch_admin_save_payroll_addition(uuid, text, date, date, text, numeric) to anon, authenticated;
grant execute on function public.branch_admin_list_attendance(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_list_attendance_history(uuid, integer, integer) to anon, authenticated;
grant execute on function public.branch_admin_save_weekly_payroll_snapshot(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_list_weekly_payroll_snapshots(uuid, integer, integer) to anon, authenticated;
grant execute on function public.branch_admin_save_attendance(uuid, date, jsonb) to anon, authenticated;
grant execute on function public.branch_admin_list_employee_contributions(uuid) to anon, authenticated;
grant execute on function public.branch_admin_save_employee_contribution(uuid, text, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.branch_admin_logout(uuid) to anon, authenticated;

comment on table public.branch_employee_contribution is
  'Weekly SSS, PhilHealth, and Pag-IBIG deduction amounts, scoped to a branch and employee code.';
comment on table public.branch_weekly_payroll_snapshot is
  'Immutable payroll period headers for saved weekly payroll history.';
comment on table public.branch_weekly_payroll_snapshot_item is
  'Immutable per-employee weekly payroll values captured with a payroll snapshot.';
comment on table public.branch_employee_cash_advance is
  'Legacy branch-scoped cash advances retained for migration and historical compatibility.';
comment on table public.branch_employee_cash_advance_loan is
  'Branch-scoped cash advance principals for employees with outstanding balance monitoring.';
comment on table public.branch_employee_cash_advance_payment is
  'Branch-scoped weekly cash advance repayments deducted from the assigned payroll week.';
comment on table public.branch_employee_hdmf_loan is
  'Branch-scoped HDMF loan principals for employees.';
comment on table public.branch_employee_hdmf_payment is
  'Partial or full HDMF repayments assigned to a specific weekly payroll period.';
comment on table public.branch_employee_undertime_deduction is
  'Admin-entered weekly undertime amounts; when present, these override the automatic late-minute calculation for that employee and week.';
comment on table public.branch_employee_payroll_addition is
  'Branch-scoped holiday and overtime additions assigned to a specific weekly payroll period.';

notify pgrst, 'reload schema';

commit;
