begin;

-- Run after tafi_admin_management.sql and tafi_employee_documents.sql.
drop function if exists public.tafi_admin_list_employee_ranking_photos(uuid, uuid[]);
drop function if exists public.tafi_admin_list_employee_rankings(uuid, date, date);

create function public.tafi_admin_list_employee_rankings(
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
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
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

revoke all on function public.tafi_admin_list_employee_rankings(uuid, date, date) from public;
grant execute on function public.tafi_admin_list_employee_rankings(uuid, date, date) to anon, authenticated;

commit;
