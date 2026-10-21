begin;

-- Run after branch_employee_leave_credits.sql and tafi_employee_emergency_contacts.sql.
alter table public.employee
  add column if not exists place_of_birth text,
  add column if not exists civil_status text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_number text,
  add column if not exists emergency_contact_relationship text;

drop function if exists public.branch_admin_list_employees(uuid);

create function public.branch_admin_list_employees(p_session_token uuid)
returns table (
  employee_code text,
  name text,
  employee_position text,
  daily_rate numeric,
  today_status text,
  address text,
  place_of_birth text,
  gender text,
  civil_status text,
  birthday date,
  email text,
  phone text,
  emergency_contact_name text,
  emergency_contact_number text,
  emergency_contact_relationship text,
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
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select employee.employee_code,
         employee.name,
         employee.position,
         employee.daily_rate,
         coalesce(attendance.status, 'not_marked'),
         employee.address,
         employee.place_of_birth,
         employee.gender,
         employee.civil_status,
         employee.birthday,
         employee.email,
         employee.phone,
         employee.emergency_contact_name,
         employee.emergency_contact_number,
         employee.emergency_contact_relationship,
         employee.tin_number,
         employee.sss_number,
         employee.pagibig_number,
         employee.philhealth_number,
         employee.employment_classification,
         employee.hire_date,
         employee.probationary_start_date,
         employee.regular_start_date
  from public.employee as employee
  left join public.employee_attendance as attendance
    on attendance.employee_id = employee.id
    and attendance.attendance_date = current_date
  where employee.branch_id = v_branch_id
    and employee.employment_status = 'active'
  order by employee.name;
end;
$$;

revoke all on function public.branch_admin_list_employees(uuid) from public;
grant execute on function public.branch_admin_list_employees(uuid) to anon, authenticated;

commit;
