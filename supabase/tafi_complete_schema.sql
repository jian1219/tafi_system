begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Custom Super Admin credentials for the current prototype login.
create table if not exists public.super_admin (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.super_admin enable row level security;
revoke all on table public.super_admin from public, anon, authenticated;

insert into public.super_admin (name, email, password_hash)
values (
  'SuperAdmin',
  'SuperAdmin@tafi.com',
  extensions.crypt('superadmin123', extensions.gen_salt('bf'))
)
on conflict (email) do nothing;

create or replace function public.super_admin_login(p_email text, p_password text)
returns table (user_id uuid, full_name text, user_email text)
language sql
security definer
set search_path = ''
as $$
  select account.id, account.name, account.email
  from public.super_admin as account
  where lower(account.email) = lower(trim(p_email))
    and account.password_hash = extensions.crypt(p_password, account.password_hash)
  limit 1;
$$;

create table if not exists public.branch (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.branch_admin (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists branch_admin_one_per_branch_idx
  on public.branch_admin (branch_id);
create unique index if not exists branch_admin_email_lower_idx
  on public.branch_admin (lower(email));
create unique index if not exists branch_admin_id_branch_idx
  on public.branch_admin (id, branch_id);

create table if not exists public.employee (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  employee_code text not null,
  name text not null,
  position text not null,
  email text,
  phone text,
  address text,
  gender text,
  birthday date,
  tin_number text,
  sss_number text,
  pagibig_number text,
  philhealth_number text,
  employment_classification text
    check (employment_classification in ('Regular', 'Probationary', 'Trainee')),
  daily_rate numeric(12, 2) not null default 0 check (daily_rate >= 0),
  employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive')),
  hire_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_branch_code_unique unique (branch_id, employee_code),
  constraint employee_id_branch_unique unique (id, branch_id)
);

create index if not exists employee_branch_name_idx
  on public.employee (branch_id, name);

create table if not exists public.employee_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee(id) on delete restrict,
  attendance_date date not null,
  status text not null check (status in (
    'not_marked',
    'present',
    'present_late',
    'absent',
    'maternity_leave',
    'paternity_leave',
    'authorized_leave',
    'birthday_leave',
    'vl_with_pay',
    'vl_without_pay',
    'day_off'
  )),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  daily_rate_snapshot numeric(12, 2) not null default 0 check (daily_rate_snapshot >= 0),
  late_deduction numeric(12, 2) generated always as (
    round((daily_rate_snapshot / 8 / 60) * late_minutes, 2)
  ) stored,
  submitted_by uuid references public.branch_admin(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_attendance_one_per_day unique (employee_id, attendance_date),
  constraint attendance_late_minutes_match_status check (
    (status = 'present_late' and late_minutes > 0)
    or (status <> 'present_late' and late_minutes = 0)
  )
);

create index if not exists employee_attendance_date_idx
  on public.employee_attendance (attendance_date, employee_id);

create table if not exists public.payroll_run (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  generated_by_branch_admin_id uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  constraint payroll_run_date_order check (period_end >= period_start),
  constraint payroll_run_period_unique unique (branch_id, period_start, period_end),
  constraint payroll_run_id_branch_unique unique (id, branch_id),
  constraint payroll_run_admin_branch_fk
    foreign key (generated_by_branch_admin_id, branch_id)
    references public.branch_admin (id, branch_id) on delete restrict
);

create table if not exists public.payroll_item (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null,
  branch_id uuid not null,
  employee_id uuid not null,
  days_present numeric(6, 2) not null default 0 check (days_present >= 0),
  days_absent numeric(6, 2) not null default 0 check (days_absent >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  regular_gross numeric(12, 2) not null default 0 check (regular_gross >= 0),
  late_deduction numeric(12, 2) not null default 0 check (late_deduction >= 0),
  other_earnings numeric(12, 2) not null default 0 check (other_earnings >= 0),
  other_deductions numeric(12, 2) not null default 0 check (other_deductions >= 0),
  net_pay numeric(12, 2) generated always as (
    round(regular_gross - late_deduction + other_earnings - other_deductions, 2)
  ) stored,
  created_at timestamptz not null default now(),
  constraint payroll_item_employee_per_run unique (payroll_run_id, employee_id),
  constraint payroll_item_run_branch_fk
    foreign key (payroll_run_id, branch_id)
    references public.payroll_run (id, branch_id) on delete cascade,
  constraint payroll_item_employee_branch_fk
    foreign key (employee_id, branch_id)
    references public.employee (id, branch_id) on delete restrict
);

create index if not exists payroll_run_branch_period_idx
  on public.payroll_run (branch_id, period_start desc);
create index if not exists payroll_item_employee_idx
  on public.payroll_item (employee_id, payroll_run_id);

alter table public.branch enable row level security;
alter table public.branch_admin enable row level security;
alter table public.employee enable row level security;
alter table public.employee_attendance enable row level security;
alter table public.payroll_run enable row level security;
alter table public.payroll_item enable row level security;

revoke all on table public.branch from public, anon, authenticated;
revoke all on table public.branch_admin from public, anon, authenticated;
revoke all on table public.employee from public, anon, authenticated;
revoke all on table public.employee_attendance from public, anon, authenticated;
revoke all on table public.payroll_run from public, anon, authenticated;
revoke all on table public.payroll_item from public, anon, authenticated;

create or replace function public.super_admin_list_branches(
  p_super_admin_email text,
  p_super_admin_password text
)
returns table (
  branch_id uuid,
  branch_name text,
  branch_location text,
  created_at timestamptz,
  admin_name text,
  admin_email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  return query
  select b.id, b.name, b.location, b.created_at, ba.name, ba.email
  from public.branch as b
  left join public.branch_admin as ba on ba.branch_id = b.id
  order by b.created_at desc;
end;
$$;

create or replace function public.super_admin_create_branch(
  p_super_admin_email text,
  p_super_admin_password text,
  p_branch_name text,
  p_branch_location text,
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
  new_branch_id uuid;
begin
  if not exists (
    select 1 from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  if nullif(trim(p_branch_name), '') is null
    or nullif(trim(p_admin_name), '') is null
    or nullif(trim(p_admin_email), '') is null
    or nullif(p_admin_password, '') is null then
    raise exception 'Branch name, branch admin name, email, and password are required';
  end if;

  if length(p_admin_password) < 8 then
    raise exception 'Branch admin password must be at least 8 characters';
  end if;

  insert into public.branch (name, location)
  values (trim(p_branch_name), coalesce(trim(p_branch_location), ''))
  returning id into new_branch_id;

  insert into public.branch_admin (branch_id, name, email, password_hash)
  values (
    new_branch_id,
    trim(p_admin_name),
    lower(trim(p_admin_email)),
    extensions.crypt(p_admin_password, extensions.gen_salt('bf'))
  );

  return new_branch_id;
end;
$$;

drop function if exists public.branch_admin_login(text, text);

create function public.branch_admin_login(p_email text, p_password text)
returns table (
  admin_id uuid,
  admin_name text,
  branch_id uuid,
  branch_name text,
  branch_location text,
  admin_email text
)
language sql
security definer
set search_path = ''
as $$
  select ba.id, ba.name, b.id, b.name, b.location, ba.email
  from public.branch_admin as ba
  join public.branch as b on b.id = ba.branch_id
  where lower(ba.email) = lower(trim(p_email))
    and ba.password_hash = extensions.crypt(p_password, ba.password_hash)
  limit 1;
$$;

revoke all on function public.super_admin_login(text, text) from public;
revoke all on function public.super_admin_list_branches(text, text) from public;
revoke all on function public.super_admin_create_branch(text, text, text, text, text, text, text) from public;
revoke all on function public.branch_admin_login(text, text) from public;
grant execute on function public.super_admin_login(text, text) to anon, authenticated;
grant execute on function public.super_admin_list_branches(text, text) to anon, authenticated;
grant execute on function public.super_admin_create_branch(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.branch_admin_login(text, text) to anon, authenticated;

comment on table public.super_admin is 'Temporary custom-login records; migrate to Supabase Auth before production.';
comment on table public.branch_admin is 'One custom-login Branch Admin per branch; passwords are bcrypt hashes.';
comment on table public.employee_attendance is 'Daily attendance. Late deduction is daily rate / 8 / 60 multiplied by late minutes.';

commit;