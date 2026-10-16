-- Run after tafi_complete_schema.sql, branch_employee_contributions.sql, and
-- branch_employee_leave_credits.sql.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.tafi_admin (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tafi_admin_email_lower_idx
  on public.tafi_admin (lower(email));

alter table public.tafi_admin enable row level security;
revoke all on table public.tafi_admin from public, anon, authenticated;

create table if not exists public.tafi_admin_session (
  session_token uuid primary key default gen_random_uuid(),
  tafi_admin_id uuid not null references public.tafi_admin(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

alter table public.tafi_admin_session enable row level security;
revoke all on table public.tafi_admin_session from public, anon, authenticated;

alter table public.branch_employee_cash_advance_loan
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict,
  alter column created_by_branch_admin_id drop not null;

alter table public.branch_employee_cash_advance_payment
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict,
  alter column created_by_branch_admin_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_employee_cash_advance_loan_one_creator'
      and conrelid = 'public.branch_employee_cash_advance_loan'::regclass
  ) then
    alter table public.branch_employee_cash_advance_loan
      add constraint branch_employee_cash_advance_loan_one_creator
      check (
        (created_by_branch_admin_id is not null)
        <> (created_by_tafi_admin_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_employee_cash_advance_payment_one_creator'
      and conrelid = 'public.branch_employee_cash_advance_payment'::regclass
  ) then
    alter table public.branch_employee_cash_advance_payment
      add constraint branch_employee_cash_advance_payment_one_creator
      check (
        (created_by_branch_admin_id is not null)
        <> (created_by_tafi_admin_id is not null)
      );
  end if;
end;
$$;

create table if not exists public.tafi_admin_contribution_month_schedule (
  month_start date primary key check (
    month_start = date_trunc('month', month_start)::date
  ),
  enabled_period_starts date[] not null default '{}'::date[],
  updated_by_tafi_admin_id uuid references public.tafi_admin(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.tafi_admin_contribution_month_schedule enable row level security;
revoke all on table public.tafi_admin_contribution_month_schedule from public, anon, authenticated;

alter table public.employee_attendance
  add column if not exists submitted_by_tafi_admin_id uuid
  references public.tafi_admin(id) on delete set null;

alter table public.employee_attendance
  add column if not exists shift text
  check (shift is null or shift in (
    '9am-2pm | 6pm-9pm',
    '11am-4pm | 6pm-9pm',
    '1pm-9pm'
  ));

update public.employee_attendance
set shift = null
where status not in ('present', 'present_late', 'half_day')
  and shift is not null;

alter table public.employee_attendance
  drop constraint if exists employee_attendance_status_check;
alter table public.employee_attendance
  add constraint employee_attendance_status_check check (status in (
    'not_marked',
    'present',
    'present_late',
    'half_day',
    'absent',
    'maternity_leave',
    'paternity_leave',
    'authorized_leave',
    'birthday_leave',
    'vl_with_pay',
    'vl_without_pay',
    'day_off'
  ));

create table if not exists public.employee_profile_photo (
  employee_id uuid primary key references public.employee(id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  image_data bytea not null,
  updated_at timestamptz not null default now()
);

alter table public.employee_profile_photo enable row level security;
revoke all on table public.employee_profile_photo from public, anon, authenticated;

alter table public.employee_attendance
  add column if not exists submitted_by_tafi_admin_id uuid
  references public.tafi_admin(id) on delete set null;

create or replace function public.super_admin_list_tafi_admins(
  p_super_admin_email text,
  p_super_admin_password text
)
returns table (
  admin_id uuid,
  admin_name text,
  admin_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  return query
  select ta.id, ta.name, ta.email, ta.created_at
  from public.tafi_admin as ta
  order by ta.created_at desc;
end;
$$;

create or replace function public.super_admin_create_tafi_admin(
  p_super_admin_email text,
  p_super_admin_password text,
  p_admin_name text,
  p_admin_email text,
  p_admin_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_admin_id uuid;
begin
  if not exists (
    select 1
    from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  if nullif(trim(p_admin_name), '') is null
    or nullif(trim(p_admin_email), '') is null
    or nullif(p_admin_password, '') is null then
    raise exception 'TAFI Admin name, email, and password are required';
  end if;

  if length(p_admin_password) < 8 then
    raise exception 'TAFI Admin password must be at least 8 characters';
  end if;

  if exists (select 1 from public.tafi_admin where lower(email) = lower(trim(p_admin_email))) then
    raise exception 'A TAFI Admin with this email already exists';
  end if;

  insert into public.tafi_admin (name, email, password_hash)
  values (
    trim(p_admin_name),
    lower(trim(p_admin_email)),
    extensions.crypt(p_admin_password, extensions.gen_salt('bf'))
  )
  returning id into new_admin_id;

  return new_admin_id;
end;
$$;

drop function if exists public.tafi_admin_login(text, text);

create function public.tafi_admin_login(
  p_email text,
  p_password text
)
returns table (
  session_token uuid,
  admin_id uuid,
  admin_name text,
  admin_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_account public.tafi_admin%rowtype;
  new_session_token uuid;
begin
  select ta.* into admin_account
  from public.tafi_admin as ta
  where lower(ta.email) = lower(trim(p_email))
    and ta.password_hash = extensions.crypt(p_password, ta.password_hash)
  limit 1;

  if not found then
    return;
  end if;

  insert into public.tafi_admin_session as created_session (tafi_admin_id)
  values (admin_account.id)
  returning created_session.session_token into new_session_token;

  return query select new_session_token, admin_account.id, admin_account.name, admin_account.email;
end;
$$;

create or replace function public.tafi_admin_list_branches(p_session_token uuid)
returns table (
  branch_id uuid,
  branch_name text,
  branch_location text
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

  return query
  select b.id, b.name, b.location
  from public.branch as b
  order by b.name;
end;
$$;

create or replace function public.tafi_admin_list_employee_contributions(
  p_session_token uuid,
  p_branch_id uuid
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select contribution.employee_code, contribution.sss,
    contribution.philhealth, contribution.pagibig
  from public.branch_employee_contribution as contribution
  where contribution.branch_id = p_branch_id
  order by contribution.employee_code;
end;
$$;

create or replace function public.tafi_admin_save_employee_contribution(
  p_session_token uuid,
  p_branch_id uuid,
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  if nullif(trim(p_employee_code), '') is null
    or p_sss is null or p_sss < 0
    or p_philhealth is null or p_philhealth < 0
    or p_pagibig is null or p_pagibig < 0 then
    raise exception 'Employee code and non-negative contribution amounts are required';
  end if;

  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = p_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_contribution (
    branch_id, employee_code, sss, philhealth, pagibig, updated_at
  )
  values (
    p_branch_id, trim(p_employee_code), p_sss, p_philhealth, p_pagibig, now()
  )
  on conflict (branch_id, employee_code) do update
  set sss = excluded.sss,
    philhealth = excluded.philhealth,
    pagibig = excluded.pagibig,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.tafi_admin_get_contribution_period_settings(
  p_session_token uuid,
  p_month_start date
)
returns table (
  enabled_period_starts date[]
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

  if p_month_start is null
    or p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'Choose a valid month';
  end if;

  return query
  select schedule.enabled_period_starts
  from public.tafi_admin_contribution_month_schedule as schedule
  where schedule.month_start = p_month_start;
end;
$$;

create or replace function public.tafi_admin_save_contribution_period_settings(
  p_session_token uuid,
  p_month_start date,
  p_enabled_period_starts date[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now()
  limit 1;

  if v_tafi_admin_id is null then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_month_start is null
    or p_month_start <> date_trunc('month', p_month_start)::date
    or p_enabled_period_starts is null then
    raise exception 'Choose a valid month and contribution schedule';
  end if;

  if exists (
    select 1
    from unnest(p_enabled_period_starts) as enabled_period(period_start)
    where enabled_period.period_start is null
      or enabled_period.period_start < p_month_start
      or enabled_period.period_start >= (p_month_start + interval '1 month')::date
      or (
        enabled_period.period_start <> p_month_start
        and extract(dow from enabled_period.period_start) <> 0
      )
  ) then
    raise exception 'Contribution periods must start on the first of the month or a Sunday within that month';
  end if;

  if cardinality(p_enabled_period_starts) <> (
    select count(distinct enabled_period.period_start)::integer
    from unnest(p_enabled_period_starts) as enabled_period(period_start)
  ) then
    raise exception 'Contribution periods cannot be duplicated';
  end if;

  insert into public.tafi_admin_contribution_month_schedule (
    month_start, enabled_period_starts, updated_by_tafi_admin_id, updated_at
  )
  values (
    p_month_start, p_enabled_period_starts, v_tafi_admin_id, now()
  )
  on conflict (month_start) do update
  set enabled_period_starts = excluded.enabled_period_starts,
    updated_by_tafi_admin_id = excluded.updated_by_tafi_admin_id,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.branch_admin_is_contribution_period_enabled(
  p_session_token uuid,
  p_period_start date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_enabled boolean;
begin
  if not exists (
    select 1
    from public.branch_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_period_start is null then
    raise exception 'Choose a valid payroll period';
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
  into v_period_enabled;

  return v_period_enabled;
end;
$$;

create or replace function public.tafi_admin_save_employee_photo(
  p_session_token uuid,
  p_employee_id uuid,
  p_content_type text,
  p_photo_base64 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_image_data bytea;
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_employee_id is null or not exists (
    select 1 from public.employee as employee where employee.id = p_employee_id
  ) then
    raise exception 'Employee was not found';
  end if;
  if p_content_type is null or p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Employee photos must be JPEG, PNG, or WebP images';
  end if;
  if p_photo_base64 is null or length(p_photo_base64) = 0 or length(p_photo_base64) > 2796204 then
    raise exception 'Employee photos must be no larger than 2 MB';
  end if;

  v_image_data := decode(p_photo_base64, 'base64');
  if octet_length(v_image_data) = 0 or octet_length(v_image_data) > 2097152 then
    raise exception 'Employee photos must be no larger than 2 MB';
  end if;

  insert into public.employee_profile_photo (employee_id, content_type, image_data, updated_at)
  values (p_employee_id, p_content_type, v_image_data, now())
  on conflict (employee_id) do update
  set content_type = excluded.content_type,
    image_data = excluded.image_data,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.tafi_admin_get_employee_photo(
  p_session_token uuid,
  p_employee_id uuid
)
returns table (content_type text, photo_base64 text)
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
  if p_employee_id is null or not exists (
    select 1 from public.employee as employee where employee.id = p_employee_id
  ) then
    raise exception 'Employee was not found';
  end if;

  return query
  select photo.content_type, replace(encode(photo.image_data, 'base64'), E'\n', '')
  from public.employee_profile_photo as photo
  where photo.employee_id = p_employee_id;
end;
$$;

drop function if exists public.tafi_admin_list_employees(uuid);

create function public.tafi_admin_list_employees(p_session_token uuid)
returns table (
  employee_id uuid,
  branch_id uuid,
  branch_name text,
  employee_code text,
  employee_name text,
  employee_position text,
  employment_status text,
  email text,
  phone text,
  address text,
  gender text,
  birthday date,
  tin_number text,
  sss_number text,
  pagibig_number text,
  philhealth_number text,
  employment_classification text,
  daily_rate numeric,
  hire_date date,
  probationary_start_date date,
  regular_start_date date
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

  return query
  select e.id, e.branch_id, b.name, e.employee_code, e.name, e.position,
    e.employment_status, e.email, e.phone, e.address, e.gender, e.birthday,
    e.tin_number, e.sss_number, e.pagibig_number, e.philhealth_number,
    e.employment_classification, e.daily_rate, e.hire_date,
    e.probationary_start_date, e.regular_start_date
  from public.employee as e
  join public.branch as b on b.id = e.branch_id
  order by b.name, e.name;
end;
$$;

create or replace function public.tafi_admin_create_cash_advance_loan(
  p_session_token uuid,
  p_branch_id uuid,
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
  v_advance_id uuid;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch where id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
  if nullif(trim(p_employee_code), '') is null or p_advance_date is null
    or p_advance_amount is null or p_advance_amount <= 0 then
    raise exception 'Employee, cash advance date, and amount greater than zero are required';
  end if;
  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = p_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_cash_advance_loan (
    branch_id, employee_code, advance_date, advance_amount,
    created_by_branch_admin_id, created_by_tafi_admin_id
  )
  values (
    p_branch_id, trim(p_employee_code), p_advance_date, p_advance_amount,
    null, v_admin_id
  )
  returning id into v_advance_id;

  return v_advance_id;
end;
$$;

create or replace function public.tafi_admin_list_cash_advance_loans(
  p_session_token uuid,
  p_branch_id uuid,
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch as branch where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Cash advance history page offset and limit are invalid';
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
  where loan.branch_id = p_branch_id
  order by loan.advance_date desc, employee.name, loan.created_at desc, loan.id
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_list_cash_advance_payments(
  p_session_token uuid,
  p_branch_id uuid,
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch as branch where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Cash advance payment page offset and limit are invalid';
  end if;
  if (p_period_start is null) <> (p_period_end is null)
    or (p_period_start is not null and p_period_end < p_period_start) then
    raise exception 'Both cash advance period dates must be provided and valid';
  end if;

  return query
  select payment.id, payment.advance_id, payment.employee_code,
    payment.period_start, payment.period_end, payment.amount
  from public.branch_employee_cash_advance_payment as payment
  where payment.branch_id = p_branch_id
    and (p_period_start is null or payment.period_start >= p_period_start)
    and (p_period_end is null or payment.period_end <= p_period_end)
  order by payment.period_start, payment.employee_code, payment.advance_id
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_save_cash_advance_weekly_deductions(
  p_session_token uuid,
  p_branch_id uuid,
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
  v_advance public.branch_employee_cash_advance_loan%rowtype;
  v_payment jsonb;
  v_period_start date;
  v_period_end date;
  v_amount numeric;
  v_period_starts date[] := array[]::date[];
  v_total_paid numeric;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch where id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
  if p_advance_id is null or jsonb_typeof(p_payments) is distinct from 'array' then
    raise exception 'A cash advance and weekly deduction array are required';
  end if;
  if jsonb_array_length(p_payments) < 1 or jsonb_array_length(p_payments) > 6 then
    raise exception 'A cash advance and one to six weekly deduction entries are required';
  end if;

  select loan.* into v_advance
  from public.branch_employee_cash_advance_loan as loan
  where loan.id = p_advance_id and loan.branch_id = p_branch_id
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
        and branch_id = p_branch_id
        and period_start = v_period_start;
    else
      insert into public.branch_employee_cash_advance_payment (
        branch_id, advance_id, employee_code, period_start, period_end,
        amount, created_by_branch_admin_id, created_by_tafi_admin_id
      )
      values (
        p_branch_id, v_advance.id, v_advance.employee_code,
        v_period_start, v_period_end, v_amount, null, v_admin_id
      )
      on conflict (advance_id, period_start) do update
      set period_end = excluded.period_end,
        amount = excluded.amount,
        created_by_branch_admin_id = null,
        created_by_tafi_admin_id = excluded.created_by_tafi_admin_id,
        updated_at = now();
    end if;
  end loop;

  select coalesce(sum(payment.amount), 0) into v_total_paid
  from public.branch_employee_cash_advance_payment as payment
  where payment.advance_id = v_advance.id
    and payment.branch_id = p_branch_id;
  if v_total_paid > v_advance.advance_amount then
    raise exception 'Weekly deductions cannot exceed the remaining cash advance balance';
  end if;

  return true;
end;
$$;

drop function if exists public.tafi_admin_list_attendance(uuid, uuid, date, date);

create or replace function public.tafi_admin_list_attendance(
  p_session_token uuid,
  p_branch_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  employee_code text,
  attendance_date date,
  shift text,
  status text,
  late_minutes integer
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
    or p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date then
    raise exception 'A valid branch and attendance date range are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select employee.employee_code, attendance.attendance_date,
    attendance.shift, attendance.status, attendance.late_minutes
  from public.employee_attendance as attendance
  join public.employee as employee on employee.id = attendance.employee_id
  where employee.branch_id = p_branch_id
    and attendance.attendance_date between p_start_date and p_end_date
  order by employee.employee_code, attendance.attendance_date;
end;
$$;

drop function if exists public.tafi_admin_list_attendance_submission_history(uuid, integer, integer);

create function public.tafi_admin_list_attendance_submission_history(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 100
)
returns table (
  id bigint,
  branch_name text,
  submitted_by_role text,
  submitted_by_name text,
  attendance_date date,
  submitted_at timestamptz,
  employee_count integer
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
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Attendance history page offset and limit are invalid';
  end if;

  return query
  select submission.id, submission.branch_name,
    submission.submitted_by_role, submission.submitted_by_name,
    submission.attendance_date, submission.submitted_at, submission.employee_count
  from public.branch_employee_attendance_submission as submission
  order by submission.submitted_at desc, submission.id desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_list_employee_leave_credits(
  p_session_token uuid,
  p_branch_id uuid
)
returns table (
  employee_code text,
  pending_credits numeric,
  balance numeric
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
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  with qualifying_months as (
    select attendance.employee_id,
      date_trunc('month', attendance.attendance_date)::date as attendance_month
    from public.employee_attendance as attendance
    join public.employee as employee on employee.id = attendance.employee_id
    where employee.branch_id = p_branch_id
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
    select adjustment.employee_code, sum(adjustment.credit_days) as credits
    from public.branch_employee_leave_credit_adjustment as adjustment
    where adjustment.branch_id = p_branch_id
    group by adjustment.employee_code
  ),
  request_totals as (
    select leave_request.employee_code,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'approved'), 0) as used,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'pending'), 0) as pending
    from public.branch_employee_leave_request as leave_request
    where leave_request.branch_id = p_branch_id
    group by leave_request.employee_code
  )
  select employee.employee_code,
    coalesce(request_totals.pending, 0),
    case when employee.employment_classification = 'Regular'
      then coalesce(earned.credits, 0) + coalesce(manual_totals.credits, 0)
        - coalesce(request_totals.used, 0)
      else 0 end
  from public.employee as employee
  left join earned on earned.employee_id = employee.id
  left join manual_totals on manual_totals.employee_code = employee.employee_code
  left join request_totals on request_totals.employee_code = employee.employee_code
  where employee.branch_id = p_branch_id
  order by employee.name, employee.employee_code;
end;
$$;

create or replace function public.tafi_admin_list_overtime_hours(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  employee_code text,
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

  if p_branch_id is null
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'A valid branch and overtime date range are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select overtime.employee_code, overtime.overtime_date, overtime.hours
  from public.branch_employee_overtime_hours as overtime
  where overtime.branch_id = p_branch_id
    and overtime.overtime_date between p_period_start and p_period_end
  order by overtime.overtime_date desc, overtime.employee_code;
end;
$$;

create or replace function public.tafi_admin_list_undertime_deductions(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  employee_code text,
  undertime_minutes integer
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
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'A valid branch and undertime date range are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select deduction.employee_code, deduction.undertime_minutes
  from public.branch_employee_undertime_deduction as deduction
  where deduction.branch_id = p_branch_id
    and deduction.period_start >= p_period_start
    and deduction.period_end <= p_period_end
  order by deduction.period_start, deduction.employee_code;
end;
$$;

create or replace function public.tafi_admin_create_employee(
  p_session_token uuid,
  p_branch_id uuid,
  p_employee_code text,
  p_name text,
  p_position text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_employee_id uuid;
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or nullif(trim(p_employee_code), '') is null
    or nullif(trim(p_name), '') is null
    or nullif(trim(p_position), '') is null then
    raise exception 'Branch, employee code, name, and position are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  insert into public.employee (branch_id, employee_code, name, position)
  values (p_branch_id, trim(p_employee_code), trim(p_name), trim(p_position))
  returning id into new_employee_id;

  return new_employee_id;
end;
$$;

create or replace function public.tafi_admin_list_employee_leave_credit_summary(
  p_session_token uuid,
  p_branch_id uuid
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  with qualifying_months as (
    select attendance.employee_id,
      date_trunc('month', attendance.attendance_date)::date as attendance_month
    from public.employee_attendance as attendance
    join public.employee as employee on employee.id = attendance.employee_id
    where employee.branch_id = p_branch_id
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
    select adjustment.employee_code, sum(adjustment.credit_days) as credits
    from public.branch_employee_leave_credit_adjustment as adjustment
    where adjustment.branch_id = p_branch_id
    group by adjustment.employee_code
  ),
  request_totals as (
    select leave_request.employee_code,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'approved'), 0) as used,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'pending'), 0) as pending
    from public.branch_employee_leave_request as leave_request
    where leave_request.branch_id = p_branch_id
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
  where employee.branch_id = p_branch_id
  order by employee.name, employee.employee_code;
end;
$$;

create or replace function public.tafi_admin_add_employee_leave_credits(
  p_session_token uuid,
  p_branch_id uuid,
  p_employee_code text,
  p_credit_days numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_adjustment_id uuid;
begin
  select admin_session.tafi_admin_id into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;
  if nullif(trim(p_employee_code), '') is null then
    raise exception 'An employee is required';
  end if;
  if p_credit_days is null
    or p_credit_days <= 0
    or p_credit_days::text in ('NaN', 'Infinity', '-Infinity')
    or p_credit_days <> round(p_credit_days, 2) then
    raise exception 'Credits to add must be a positive amount with up to two decimal places';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'A reason of up to 500 characters is required';
  end if;

  perform 1
  from public.employee as employee
  where employee.branch_id = p_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active'
    and employee.employment_classification = 'Regular'
  for update;

  if not found then
    raise exception 'Credits can only be added to an active Regular employee in the selected branch';
  end if;

  insert into public.branch_employee_leave_credit_adjustment (
    branch_id,
    employee_code,
    credit_days,
    reason,
    created_by_tafi_admin_id
  )
  values (
    p_branch_id,
    trim(p_employee_code),
    p_credit_days,
    trim(p_reason),
    v_tafi_admin_id
  )
  returning id into v_adjustment_id;

  return v_adjustment_id;
end;
$$;

create or replace function public.tafi_admin_list_employee_leave_requests(
  p_session_token uuid,
  p_branch_id uuid
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or not exists (
      select 1
      from public.branch as branch
      where branch.id = p_branch_id
    ) then
    raise exception 'Selected branch was not found';
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
  where leave_request.branch_id = p_branch_id
  order by case when leave_request.status = 'pending' then 0 else 1 end,
    leave_request.created_at desc;
end;
$$;

create or replace function public.tafi_admin_update_employee_leave_request_status(
  p_session_token uuid,
  p_branch_id uuid,
  p_request_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_employee_id uuid;
  v_employee_code text;
  v_start_date date;
  v_end_date date;
  v_credit_days numeric;
  v_daily_rate numeric;
  v_day_offset integer;
  v_saved_count bigint;
begin
  select admin_session.tafi_admin_id into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'Request status must be approved or rejected';
  end if;

  select leave_request.employee_code, leave_request.start_date,
    leave_request.end_date, leave_request.credit_days
  into v_employee_code, v_start_date, v_end_date, v_credit_days
  from public.branch_employee_leave_request as leave_request
  where leave_request.id = p_request_id
    and leave_request.branch_id = p_branch_id
    and leave_request.status = 'pending'
  for update;

  if not found then
    raise exception 'Pending leave request was not found in the selected branch';
  end if;

  if p_status = 'approved' then
    if v_credit_days <> trunc(v_credit_days)
      or v_end_date - v_start_date + 1 <> v_credit_days then
      raise exception 'Leave credits must be whole days with one leave date for each credit day';
    end if;

    select employee.id, employee.daily_rate
    into v_employee_id, v_daily_rate
    from public.employee as employee
    where employee.branch_id = p_branch_id
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
      where other_request.branch_id = p_branch_id
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
        submitted_by_tafi_admin_id,
        updated_at
      )
      values (
        v_employee_id,
        v_start_date + v_day_offset,
        'vl_with_pay',
        0,
        v_daily_rate,
        v_tafi_admin_id,
        now()
      )
      on conflict (employee_id, attendance_date) do update
      set status = excluded.status,
        late_minutes = 0,
        daily_rate_snapshot = excluded.daily_rate_snapshot,
        submitted_by_tafi_admin_id = excluded.submitted_by_tafi_admin_id,
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
    and leave_request.branch_id = p_branch_id
    and leave_request.status = 'pending';

  return true;
end;
$$;

create or replace function public.tafi_admin_save_attendance(
  p_session_token uuid,
  p_branch_id uuid,
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
  v_record jsonb;
  v_employee_id uuid;
  v_status text;
  v_late_minutes integer;
  v_daily_rate numeric;
  v_employee_code text;
  v_shift text;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or p_attendance_date is null
    or p_attendance_date > current_date
    or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'A valid branch, attendance date, and array of employee records are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    v_employee_code := nullif(trim(v_record->>'employee_code'), '');
    if v_employee_code is null then
      raise exception 'Employee code is required for each attendance record';
    end if;

    select employee.id, employee.daily_rate
    into v_employee_id, v_daily_rate
    from public.employee as employee
    where employee.branch_id = p_branch_id
      and employee.employee_code = v_employee_code
      and employee.employment_status = 'active';

    if not found then
      raise exception 'Employee % was not found in the selected branch', v_employee_code;
    end if;

    v_status := v_record->>'status';
    v_shift := nullif(v_record->>'shift', '');
    v_late_minutes := coalesce((v_record->>'late_minutes')::integer, 0);

    if v_status is null or v_status not in (
      'not_marked', 'present', 'present_late', 'half_day', 'absent',
      'maternity_leave', 'paternity_leave', 'authorized_leave',
      'birthday_leave', 'vl_with_pay', 'vl_without_pay', 'day_off'
    ) then
      raise exception 'Invalid attendance status for employee %', v_employee_code;
    end if;
    if v_shift is not null and v_shift not in (
      '9am-2pm | 6pm-9pm',
      '11am-4pm | 6pm-9pm',
      '1pm-9pm'
    ) then
      raise exception 'Invalid shift for employee %', v_employee_code;
    end if;
    if v_status in ('present', 'present_late', 'half_day') and v_shift is null then
      raise exception 'A shift is required for employee %', v_employee_code;
    end if;
    if v_status not in ('present', 'present_late', 'half_day') and v_shift is not null then
      raise exception 'A shift is only allowed for Present, Present (Late), or Half Day attendance for employee %',
        v_employee_code;
    end if;
    if (v_status = 'present_late' and v_late_minutes < 1)
      or (v_status <> 'present_late' and v_late_minutes <> 0) then
      raise exception 'Late minutes do not match attendance status for employee %', v_employee_code;
    end if;

    if v_status <> 'vl_with_pay' and exists (
      select 1
      from public.branch_employee_leave_request as leave_request
      where leave_request.branch_id = p_branch_id
        and leave_request.employee_code = v_employee_code
        and leave_request.status = 'approved'
        and p_attendance_date between leave_request.start_date and leave_request.end_date
    ) then
      raise exception 'Attendance date is covered by an approved Leave with Pay request for employee %',
        v_employee_code;
    end if;

    insert into public.employee_attendance (
      employee_id, attendance_date, shift, status, late_minutes,
      daily_rate_snapshot, submitted_by, submitted_by_tafi_admin_id, updated_at
    )
    values (
      v_employee_id, p_attendance_date, v_shift, v_status, v_late_minutes,
      v_daily_rate, null, v_admin_id, now()
    )
    on conflict (employee_id, attendance_date) do update
    set shift = excluded.shift,
      status = excluded.status,
      late_minutes = excluded.late_minutes,
      daily_rate_snapshot = excluded.daily_rate_snapshot,
      submitted_by = null,
      submitted_by_tafi_admin_id = excluded.submitted_by_tafi_admin_id,
      updated_at = now();
  end loop;

  insert into public.branch_employee_attendance_submission (
    branch_id, branch_name, submitted_by_role, submitted_by_id,
    submitted_by_name, attendance_date, employee_count
  )
  select branch.id, branch.name, 'TAFI Admin', admin.id, admin.name,
    p_attendance_date, jsonb_array_length(p_records)
  from public.branch as branch
  join public.tafi_admin as admin on admin.id = v_admin_id
  where branch.id = p_branch_id;

  return true;
end;
$$;

create or replace function public.tafi_admin_update_employee_profile(
  p_session_token uuid,
  p_employee_id uuid,
  p_address text,
  p_gender text,
  p_birthday date,
  p_email text,
  p_phone text,
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
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_employee_id is null
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
    raise exception 'Enter a valid employee profile and employment stage dates in chronological order';
  end if;

  if p_gender is not null and p_gender not in ('Male', 'Female', 'Other', 'Prefer not to say') then
    raise exception 'Select a valid gender option';
  end if;

  update public.employee
  set address = nullif(trim(p_address), ''),
    gender = p_gender,
    birthday = p_birthday,
    email = nullif(trim(p_email), ''),
    phone = nullif(trim(p_phone), ''),
    hire_date = p_hire_date,
    probationary_start_date = p_probationary_start_date,
    regular_start_date = p_regular_start_date,
    tin_number = nullif(trim(p_tin_number), ''),
    sss_number = nullif(trim(p_sss_number), ''),
    pagibig_number = nullif(trim(p_pagibig_number), ''),
    philhealth_number = nullif(trim(p_philhealth_number), ''),
    employment_classification = p_employment_classification,
    updated_at = now()
  where id = p_employee_id;

  if not found then
    raise exception 'Employee was not found';
  end if;

  return true;
end;
$$;

create or replace function public.tafi_admin_list_attendance(
  p_session_token uuid,
  p_branch_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  employee_code text,
  attendance_date date,
  shift text,
  status text,
  late_minutes integer
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
    or p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date then
    raise exception 'A valid branch and attendance date range are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select employee.employee_code, attendance.attendance_date,
    attendance.shift, attendance.status, attendance.late_minutes
  from public.employee_attendance as attendance
  join public.employee as employee on employee.id = attendance.employee_id
  where employee.branch_id = p_branch_id
    and attendance.attendance_date between p_start_date and p_end_date
  order by employee.employee_code, attendance.attendance_date;
end;
$$;

create or replace function public.tafi_admin_list_employee_leave_credits(
  p_session_token uuid,
  p_branch_id uuid
)
returns table (
  employee_code text,
  pending_credits numeric,
  balance numeric
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
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  with qualifying_months as (
    select attendance.employee_id,
      date_trunc('month', attendance.attendance_date)::date as attendance_month
    from public.employee_attendance as attendance
    join public.employee as employee on employee.id = attendance.employee_id
    where employee.branch_id = p_branch_id
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
    select adjustment.employee_code, sum(adjustment.credit_days) as credits
    from public.branch_employee_leave_credit_adjustment as adjustment
    where adjustment.branch_id = p_branch_id
    group by adjustment.employee_code
  ),
  request_totals as (
    select leave_request.employee_code,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'approved'), 0) as used,
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'pending'), 0) as pending
    from public.branch_employee_leave_request as leave_request
    where leave_request.branch_id = p_branch_id
    group by leave_request.employee_code
  )
  select employee.employee_code,
    coalesce(request_totals.pending, 0),
    case when employee.employment_classification = 'Regular'
      then coalesce(earned.credits, 0) + coalesce(manual_totals.credits, 0)
        - coalesce(request_totals.used, 0)
      else 0 end
  from public.employee as employee
  left join earned on earned.employee_id = employee.id
  left join manual_totals on manual_totals.employee_code = employee.employee_code
  left join request_totals on request_totals.employee_code = employee.employee_code
  where employee.branch_id = p_branch_id
  order by employee.name, employee.employee_code;
end;
$$;

create or replace function public.tafi_admin_save_attendance(
  p_session_token uuid,
  p_branch_id uuid,
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
  v_record jsonb;
  v_employee_id uuid;
  v_status text;
  v_late_minutes integer;
  v_daily_rate numeric;
  v_employee_code text;
  v_shift text;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or p_attendance_date is null
    or p_attendance_date > current_date
    or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'A valid branch, attendance date, and array of employee records are required';
  end if;

  if not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    v_employee_code := nullif(trim(v_record->>'employee_code'), '');
    if v_employee_code is null then
      raise exception 'Employee code is required for each attendance record';
    end if;

    select employee.id, employee.daily_rate
    into v_employee_id, v_daily_rate
    from public.employee as employee
    where employee.branch_id = p_branch_id
      and employee.employee_code = v_employee_code
      and employee.employment_status = 'active';

    if not found then
      raise exception 'Employee % was not found in the selected branch', v_employee_code;
    end if;

    v_status := v_record->>'status';
    v_shift := nullif(v_record->>'shift', '');
    v_late_minutes := coalesce((v_record->>'late_minutes')::integer, 0);

    if v_status is null or v_status not in (
      'not_marked', 'present', 'present_late', 'half_day', 'absent',
      'maternity_leave', 'paternity_leave', 'authorized_leave',
      'birthday_leave', 'vl_with_pay', 'vl_without_pay', 'day_off'
    ) then
      raise exception 'Invalid attendance status for employee %', v_employee_code;
    end if;
    if v_shift is not null and v_shift not in (
      '9am-2pm | 6pm-9pm',
      '11am-4pm | 6pm-9pm',
      '1pm-9pm'
    ) then
      raise exception 'Invalid shift for employee %', v_employee_code;
    end if;
    if v_status in ('present', 'present_late', 'half_day') and v_shift is null then
      raise exception 'A shift is required for employee %', v_employee_code;
    end if;
    if v_status not in ('present', 'present_late', 'half_day') and v_shift is not null then
      raise exception 'A shift is only allowed for Present, Present (Late), or Half Day attendance for employee %',
        v_employee_code;
    end if;
    if (v_status = 'present_late' and v_late_minutes < 1)
      or (v_status <> 'present_late' and v_late_minutes <> 0) then
      raise exception 'Late minutes do not match attendance status for employee %', v_employee_code;
    end if;

    if v_status <> 'vl_with_pay' and exists (
      select 1
      from public.branch_employee_leave_request as leave_request
      where leave_request.branch_id = p_branch_id
        and leave_request.employee_code = v_employee_code
        and leave_request.status = 'approved'
        and p_attendance_date between leave_request.start_date and leave_request.end_date
    ) then
      raise exception 'Attendance date is covered by an approved Leave with Pay request for employee %',
        v_employee_code;
    end if;

    insert into public.employee_attendance (
      employee_id, attendance_date, shift, status, late_minutes,
      daily_rate_snapshot, submitted_by, submitted_by_tafi_admin_id, updated_at
    )
    values (
      v_employee_id, p_attendance_date, v_shift, v_status, v_late_minutes,
      v_daily_rate, null, v_admin_id, now()
    )
    on conflict (employee_id, attendance_date) do update
    set shift = excluded.shift,
      status = excluded.status,
      late_minutes = excluded.late_minutes,
      daily_rate_snapshot = excluded.daily_rate_snapshot,
      submitted_by = null,
      submitted_by_tafi_admin_id = excluded.submitted_by_tafi_admin_id,
      updated_at = now();
  end loop;

  insert into public.branch_employee_attendance_submission (
    branch_id, branch_name, submitted_by_role, submitted_by_id,
    submitted_by_name, attendance_date, employee_count
  )
  select branch.id, branch.name, 'TAFI Admin', admin.id, admin.name,
    p_attendance_date, jsonb_array_length(p_records)
  from public.branch as branch
  join public.tafi_admin as admin on admin.id = v_admin_id
  where branch.id = p_branch_id;

  return true;
end;
$$;

create or replace function public.tafi_admin_get_weekly_payroll_data(
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
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
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

create or replace function public.tafi_admin_update_employee_daily_rate(
  p_session_token uuid,
  p_employee_id uuid,
  p_daily_rate numeric
)
returns boolean
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

  if p_employee_id is null or p_daily_rate is null or p_daily_rate < 0 then
    raise exception 'Daily rate must be zero or more and an employee must be selected';
  end if;

  update public.employee
  set daily_rate = p_daily_rate,
    updated_at = now()
  where id = p_employee_id;

  if not found then
    raise exception 'Employee was not found';
  end if;

  return true;
end;
$$;

create or replace function public.tafi_admin_logout(p_session_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.tafi_admin_session
  where session_token = p_session_token;
$$;

revoke all on function public.tafi_admin_list_branches(uuid) from public;
revoke all on function public.tafi_admin_save_employee_photo(uuid, uuid, text, text) from public;
revoke all on function public.tafi_admin_get_employee_photo(uuid, uuid) from public;
revoke all on function public.tafi_admin_list_employee_contributions(uuid, uuid) from public;
revoke all on function public.tafi_admin_save_employee_contribution(uuid, uuid, text, numeric, numeric, numeric) from public;
revoke all on function public.tafi_admin_get_contribution_period_settings(uuid, date) from public;
revoke all on function public.tafi_admin_save_contribution_period_settings(uuid, date, date[]) from public;
revoke all on function public.branch_admin_is_contribution_period_enabled(uuid, date) from public;
revoke all on function public.tafi_admin_list_employees(uuid) from public;
revoke all on function public.tafi_admin_create_cash_advance_loan(uuid, uuid, text, date, numeric) from public;
revoke all on function public.tafi_admin_list_cash_advance_loans(uuid, uuid, integer, integer) from public;
revoke all on function public.tafi_admin_list_cash_advance_payments(uuid, uuid, date, date, integer, integer) from public;
revoke all on function public.tafi_admin_save_cash_advance_weekly_deductions(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.tafi_admin_list_attendance(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_list_attendance_submission_history(uuid, integer, integer) from public;
revoke all on function public.tafi_admin_list_employee_leave_credits(uuid, uuid) from public;
revoke all on function public.tafi_admin_list_overtime_hours(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_list_undertime_deductions(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_create_employee(uuid, uuid, text, text, text) from public;
revoke all on function public.tafi_admin_save_attendance(uuid, uuid, date, jsonb) from public;
revoke all on function public.tafi_admin_update_employee_profile(uuid, uuid, text, text, date, text, text, date, date, date, text, text, text, text, text) from public;
revoke all on function public.tafi_admin_get_weekly_payroll_data(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_update_employee_daily_rate(uuid, uuid, numeric) from public;
revoke all on function public.tafi_admin_list_attendance(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_list_employee_leave_credits(uuid, uuid) from public;
revoke all on function public.tafi_admin_list_employee_leave_credit_summary(uuid, uuid) from public;
revoke all on function public.tafi_admin_add_employee_leave_credits(uuid, uuid, text, numeric, text) from public;
revoke all on function public.tafi_admin_list_employee_leave_requests(uuid, uuid) from public;
revoke all on function public.tafi_admin_update_employee_leave_request_status(uuid, uuid, uuid, text) from public;
revoke all on function public.tafi_admin_save_attendance(uuid, uuid, date, jsonb) from public;
revoke all on function public.tafi_admin_logout(uuid) from public;
drop function if exists public.branch_admin_update_employee_daily_rate(uuid, text, numeric);
revoke all on function public.branch_admin_update_employee_profile(uuid, text, text, text, date, date, date, date, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.tafi_admin_list_branches(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_save_employee_photo(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.tafi_admin_get_employee_photo(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_employee_contributions(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_save_employee_contribution(uuid, uuid, text, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_get_contribution_period_settings(uuid, date) to anon, authenticated;
grant execute on function public.tafi_admin_save_contribution_period_settings(uuid, date, date[]) to anon, authenticated;
grant execute on function public.branch_admin_is_contribution_period_enabled(uuid, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_employees(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_create_cash_advance_loan(uuid, uuid, text, date, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_cash_advance_loans(uuid, uuid, integer, integer) to anon, authenticated;
grant execute on function public.tafi_admin_list_cash_advance_payments(uuid, uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.tafi_admin_save_cash_advance_weekly_deductions(uuid, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.tafi_admin_list_attendance(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_attendance_submission_history(uuid, integer, integer) to anon, authenticated;
grant execute on function public.tafi_admin_list_employee_leave_credits(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_overtime_hours(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_undertime_deductions(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_create_employee(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.tafi_admin_save_attendance(uuid, uuid, date, jsonb) to anon, authenticated;
grant execute on function public.tafi_admin_update_employee_profile(uuid, uuid, text, text, date, text, text, date, date, date, text, text, text, text, text) to anon, authenticated;
grant execute on function public.tafi_admin_get_weekly_payroll_data(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_update_employee_daily_rate(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_attendance(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_employee_leave_credits(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_employee_leave_credit_summary(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_add_employee_leave_credits(uuid, uuid, text, numeric, text) to anon, authenticated;
grant execute on function public.tafi_admin_list_employee_leave_requests(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_update_employee_leave_request_status(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.tafi_admin_save_attendance(uuid, uuid, date, jsonb) to anon, authenticated;
grant execute on function public.tafi_admin_logout(uuid) to anon, authenticated;

revoke all on function public.tafi_admin_login(text, text) from public;
grant execute on function public.tafi_admin_login(text, text) to anon, authenticated;

revoke all on function public.super_admin_list_tafi_admins(text, text) from public;
revoke all on function public.super_admin_create_tafi_admin(text, text, text, text, text) from public;
grant execute on function public.super_admin_list_tafi_admins(text, text) to anon, authenticated;
grant execute on function public.super_admin_create_tafi_admin(text, text, text, text, text) to anon, authenticated;
