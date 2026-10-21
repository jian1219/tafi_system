begin;

-- Run after super_admin_login.sql, tafi_employee_emergency_contacts.sql, and tafi_employee_documents.sql.
create table if not exists public.guest_account (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists guest_account_email_lower_idx
  on public.guest_account (lower(email));

alter table public.guest_account enable row level security;
revoke all on table public.guest_account from public, anon, authenticated;

create table if not exists public.guest_session (
  session_token uuid primary key default gen_random_uuid(),
  guest_account_id uuid not null references public.guest_account(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

alter table public.guest_session enable row level security;
revoke all on table public.guest_session from public, anon, authenticated;

create or replace function public.super_admin_list_guest_accounts(
  p_super_admin_email text,
  p_super_admin_password text
)
returns table (
  guest_account_id uuid,
  guest_name text,
  guest_email text,
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
  select guest.id, guest.name, guest.email, guest.created_at
  from public.guest_account as guest
  order by guest.created_at desc;
end;
$$;

create or replace function public.super_admin_create_guest_account(
  p_super_admin_email text,
  p_super_admin_password text,
  p_guest_name text,
  p_guest_email text,
  p_guest_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_guest_account_id uuid;
begin
  if not exists (
    select 1
    from public.super_admin as account
    where lower(account.email) = lower(trim(p_super_admin_email))
      and account.password_hash = extensions.crypt(p_super_admin_password, account.password_hash)
  ) then
    raise exception 'Invalid Super Admin credentials' using errcode = '28000';
  end if;

  if nullif(trim(p_guest_name), '') is null
    or nullif(trim(p_guest_email), '') is null
    or nullif(p_guest_password, '') is null then
    raise exception 'Guest name, email, and password are required';
  end if;

  if length(p_guest_password) < 8 then
    raise exception 'Guest password must be at least 8 characters';
  end if;

  if exists (
    select 1
    from public.guest_account
    where lower(email) = lower(trim(p_guest_email))
  ) then
    raise exception 'A Guest account with this email already exists';
  end if;

  insert into public.guest_account (name, email, password_hash)
  values (
    trim(p_guest_name),
    lower(trim(p_guest_email)),
    extensions.crypt(p_guest_password, extensions.gen_salt('bf'))
  )
  returning id into new_guest_account_id;

  return new_guest_account_id;
end;
$$;

create or replace function public.guest_login(
  p_email text,
  p_password text
)
returns table (
  session_token uuid,
  guest_account_id uuid,
  guest_name text,
  guest_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest_account_id uuid;
  v_guest_name text;
  v_guest_email text;
  v_session_token uuid;
begin
  select guest.id, guest.name, guest.email
  into v_guest_account_id, v_guest_name, v_guest_email
  from public.guest_account as guest
  where lower(guest.email) = lower(trim(p_email))
    and guest.password_hash = extensions.crypt(p_password, guest.password_hash)
  limit 1;

  if not found then
    raise exception 'Invalid Guest email or password' using errcode = '28000';
  end if;

  insert into public.guest_session as created_session (guest_account_id)
  values (v_guest_account_id)
  returning created_session.session_token into v_session_token;

  return query
  select v_session_token, v_guest_account_id, v_guest_name, v_guest_email;
end;
$$;

create or replace function public.guest_logout(p_session_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.guest_session
  where session_token = p_session_token;
$$;

create or replace function public.guest_list_employee_branches(p_session_token uuid)
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
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  return query
  select branch.id, branch.name, branch.location
  from public.branch as branch
  order by branch.name;
end;
$$;

drop function if exists public.guest_list_employees(uuid);

create function public.guest_list_employees(p_session_token uuid)
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
  place_of_birth text,
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
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  return query
  select employee.id, employee.branch_id, branch.name, employee.employee_code,
    employee.name, employee.position, employee.employment_status, employee.email,
    employee.phone, employee.emergency_contact_name, employee.emergency_contact_number,
    employee.emergency_contact_relationship, employee.address, employee.gender,
    employee.civil_status, employee.birthday, employee.place_of_birth,
    employee.tin_number, employee.sss_number, employee.pagibig_number,
    employee.philhealth_number, employee.employment_classification,
    employee.daily_rate, employee.hire_date, employee.probationary_start_date,
    employee.regular_start_date
  from public.employee as employee
  join public.branch as branch on branch.id = employee.branch_id
  order by branch.name, employee.name;
end;
$$;

create or replace function public.guest_list_employee_rankings(
  p_session_token uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  employee_id uuid,
  employee_name text,
  branch_name text,
  late_count integer,
  absent_count integer,
  incident_report_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid ranking date range is required';
  end if;

  return query
  with attendance_totals as (
    select attendance.employee_id,
      count(*) filter (where attendance.status = 'present_late')::integer as late_count,
      count(*) filter (where attendance.status = 'absent')::integer as absent_count
    from public.employee_attendance as attendance
    where attendance.attendance_date between p_start_date and p_end_date
    group by attendance.employee_id
  ),
  incident_totals as (
    select record.employee_id, count(*)::integer as incident_report_count
    from public.tafi_employee_document_record as record
    where record.document_type = 'incident_report'
      and record.uploaded_at >= (p_start_date::timestamp at time zone 'Asia/Manila')
      and record.uploaded_at < ((p_end_date + 1)::timestamp at time zone 'Asia/Manila')
    group by record.employee_id
  )
  select employee.id,
    employee.name,
    branch.name,
    coalesce(attendance.late_count, 0),
    coalesce(attendance.absent_count, 0),
    coalesce(incident.incident_report_count, 0)
  from public.employee as employee
  join public.branch as branch on branch.id = employee.branch_id
  left join attendance_totals as attendance on attendance.employee_id = employee.id
  left join incident_totals as incident on incident.employee_id = employee.id
  order by employee.name, employee.id;
end;
$$;

create or replace function public.guest_list_employee_documents(
  p_session_token uuid,
  p_employee_id uuid
)
returns table (
  document_id uuid,
  document_type text,
  file_name text,
  content_type text,
  file_size_bytes integer,
  uploaded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_employee_id is null or not exists (
    select 1
    from public.employee as employee
    where employee.id = p_employee_id
  ) then
    raise exception 'Employee was not found';
  end if;

  return query
  select record.id, record.document_type, record.file_name, record.content_type,
    octet_length(record.file_data), record.uploaded_at
  from public.tafi_employee_document_record as record
  where record.employee_id = p_employee_id
  order by record.uploaded_at desc, record.id;
end;
$$;

create or replace function public.guest_get_employee_document(
  p_session_token uuid,
  p_document_id uuid
)
returns table (
  file_name text,
  content_type text,
  file_base64 text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_document_id is null or not exists (
    select 1
    from public.tafi_employee_document_record as record
    where record.id = p_document_id
  ) then
    raise exception 'Employee document was not found';
  end if;

  return query
  select record.file_name, record.content_type,
    replace(encode(record.file_data, 'base64'), E'\n', '')
  from public.tafi_employee_document_record as record
  where record.id = p_document_id;
end;
$$;

create or replace function public.guest_get_employee_photo(
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
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_employee_id is null or not exists (
    select 1
    from public.employee as employee
    where employee.id = p_employee_id
  ) then
    raise exception 'Employee was not found';
  end if;

  return query
  select photo.content_type, replace(encode(photo.image_data, 'base64'), E'\n', '')
  from public.employee_profile_photo as photo
  where photo.employee_id = p_employee_id;
end;
$$;

create or replace function public.guest_list_employee_attendance(
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
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date then
    raise exception 'A valid branch and attendance date range are required';
  end if;

  if not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
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

create or replace function public.guest_list_overtime_hours(
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
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'A valid branch and overtime date range are required';
  end if;

  if not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
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

create or replace function public.guest_list_undertime_deductions(
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
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_branch_id is null
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'A valid branch and undertime date range are required';
  end if;

  if not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
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

create or replace function public.guest_list_employee_contributions(
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
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_branch_id is null or not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
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

revoke all on function public.super_admin_list_guest_accounts(text, text) from public;
revoke all on function public.super_admin_create_guest_account(text, text, text, text, text) from public;
revoke all on function public.guest_login(text, text) from public;
revoke all on function public.guest_logout(uuid) from public;
revoke all on function public.guest_list_employee_branches(uuid) from public;
revoke all on function public.guest_list_employees(uuid) from public;
revoke all on function public.guest_list_employee_rankings(uuid, date, date) from public;
revoke all on function public.guest_list_employee_documents(uuid, uuid) from public;
revoke all on function public.guest_get_employee_document(uuid, uuid) from public;
revoke all on function public.guest_get_employee_photo(uuid, uuid) from public;
revoke all on function public.guest_list_employee_attendance(uuid, uuid, date, date) from public;
revoke all on function public.guest_list_overtime_hours(uuid, uuid, date, date) from public;
revoke all on function public.guest_list_undertime_deductions(uuid, uuid, date, date) from public;
revoke all on function public.guest_list_employee_contributions(uuid, uuid) from public;

grant execute on function public.super_admin_list_guest_accounts(text, text) to anon, authenticated;
grant execute on function public.super_admin_create_guest_account(text, text, text, text, text) to anon, authenticated;
grant execute on function public.guest_login(text, text) to anon, authenticated;
grant execute on function public.guest_logout(uuid) to anon, authenticated;
grant execute on function public.guest_list_employee_branches(uuid) to anon, authenticated;
grant execute on function public.guest_list_employees(uuid) to anon, authenticated;
grant execute on function public.guest_list_employee_rankings(uuid, date, date) to anon, authenticated;
grant execute on function public.guest_list_employee_documents(uuid, uuid) to anon, authenticated;
grant execute on function public.guest_get_employee_document(uuid, uuid) to anon, authenticated;
grant execute on function public.guest_get_employee_photo(uuid, uuid) to anon, authenticated;
grant execute on function public.guest_list_employee_attendance(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.guest_list_overtime_hours(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.guest_list_undertime_deductions(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.guest_list_employee_contributions(uuid, uuid) to anon, authenticated;

commit;
