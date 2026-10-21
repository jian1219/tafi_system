begin;

-- Run after branch_employee_contributions.sql.
drop function if exists public.branch_admin_list_attendance_history(uuid, integer, integer);

create function public.branch_admin_list_attendance_history(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  employee_code text,
  employee_name text,
  employee_position text,
  attendance_date date,
  shift text,
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
         attendance.attendance_date,
         attendance.shift,
         attendance.status,
         attendance.late_minutes,
         attendance.daily_rate_snapshot
  from public.employee_attendance as attendance
  join public.employee as employee
    on employee.id = attendance.employee_id
  where employee.branch_id = v_branch_id
  order by attendance.attendance_date desc, employee.name, employee.employee_code
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.branch_admin_list_attendance_history(uuid, integer, integer) from public;
grant execute on function public.branch_admin_list_attendance_history(uuid, integer, integer) to anon, authenticated;

commit;
