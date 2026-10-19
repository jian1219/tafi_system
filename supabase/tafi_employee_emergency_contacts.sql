begin;

-- Run after tafi_admin_management.sql.
alter table public.employee
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_number text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists civil_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employee'::regclass
      and conname = 'employee_emergency_contact_relationship_check'
  ) then
    alter table public.employee
      add constraint employee_emergency_contact_relationship_check
      check (
        emergency_contact_relationship is null
        or emergency_contact_relationship in ('Parents', 'Guardian', 'Sibling', 'Relatives')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employee'::regclass
      and conname = 'employee_civil_status_check'
  ) then
    alter table public.employee
      add constraint employee_civil_status_check
      check (
        civil_status is null
        or civil_status in ('Single', 'Married', 'Widowed', 'Separated')
      );
  end if;
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
  emergency_contact_name text,
  emergency_contact_number text,
  emergency_contact_relationship text,
  address text,
  gender text,
  civil_status text,
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
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  return query
  select employee.id, employee.branch_id, branch.name, employee.employee_code,
    employee.name, employee.position, employee.employment_status, employee.email,
    employee.phone, employee.emergency_contact_name, employee.emergency_contact_number,
    employee.emergency_contact_relationship,
    employee.address, employee.gender, employee.civil_status, employee.birthday,
    employee.tin_number,
    employee.sss_number, employee.pagibig_number, employee.philhealth_number,
    employee.employment_classification, employee.daily_rate, employee.hire_date,
    employee.probationary_start_date, employee.regular_start_date
  from public.employee as employee
  join public.branch as branch on branch.id = employee.branch_id
  order by branch.name, employee.name;
end;
$$;

drop function if exists public.tafi_admin_update_employee_profile(
  uuid, uuid, text, text, date, text, text, date, date, date,
  text, text, text, text, text
);
drop function if exists public.tafi_admin_update_employee_profile(
  uuid, uuid, text, text, date, text, text, date, date, date,
  text, text, text, text, text, text, text
);
drop function if exists public.tafi_admin_update_employee_profile(
  uuid, uuid, text, text, date, text, text, date, date, date,
  text, text, text, text, text, text, text, text
);

create or replace function public.tafi_admin_update_employee_profile(
  p_session_token uuid,
  p_employee_id uuid,
  p_address text,
  p_gender text,
  p_civil_status text,
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
  p_employment_classification text,
  p_emergency_contact_name text,
  p_emergency_contact_number text,
  p_emergency_contact_relationship text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
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

  if p_civil_status is not null
    and p_civil_status not in ('Single', 'Married', 'Widowed', 'Separated') then
    raise exception 'Select a valid civil status';
  end if;

  if p_emergency_contact_relationship is not null
    and p_emergency_contact_relationship not in ('Parents', 'Guardian', 'Sibling', 'Relatives') then
    raise exception 'Select a valid emergency contact relationship';
  end if;

  update public.employee
  set address = nullif(trim(p_address), ''),
    gender = p_gender,
    civil_status = p_civil_status,
    birthday = p_birthday,
    email = nullif(trim(p_email), ''),
    phone = nullif(trim(p_phone), ''),
    emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
    emergency_contact_number = nullif(trim(p_emergency_contact_number), ''),
    emergency_contact_relationship = nullif(trim(p_emergency_contact_relationship), ''),
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

revoke all on function public.tafi_admin_list_employees(uuid) from public;
revoke all on function public.tafi_admin_update_employee_profile(
  uuid, uuid, text, text, text, date, text, text, date, date, date,
  text, text, text, text, text, text, text, text
) from public;

grant execute on function public.tafi_admin_list_employees(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_update_employee_profile(
  uuid, uuid, text, text, text, date, text, text, date, date, date,
  text, text, text, text, text, text, text, text
) to anon, authenticated;

commit;
