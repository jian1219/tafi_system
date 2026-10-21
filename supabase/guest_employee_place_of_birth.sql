-- Run after super_admin_guest_accounts.sql.
begin;

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

revoke all on function public.guest_list_employees(uuid) from public;
grant execute on function public.guest_list_employees(uuid) to anon, authenticated;

commit;
