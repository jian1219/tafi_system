-- Run after branch_management.sql, tafi_complete_schema.sql,
-- branch_employee_contributions.sql, cash_receipts_journal.sql, deposit.sql,
-- branch_cdj.sql, and tafi_admin_management.sql.
begin;

create table if not exists public.branch_daily_no_operation (
  branch_id uuid not null references public.branch(id) on delete cascade,
  operation_date date not null,
  marked_by_branch_admin_id uuid references public.branch_admin(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (branch_id, operation_date)
);

alter table public.branch_daily_no_operation enable row level security;
revoke all on table public.branch_daily_no_operation from public, anon, authenticated;

create or replace function public.branch_admin_list_missing_daily_inputs(
  p_session_token uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  branch_id uuid,
  branch_name text,
  report_date date,
  missing_inputs text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_yesterday date := (now() at time zone 'Asia/Manila')::date - 1;
begin
  select branch_admin.branch_id, branch.name
  into v_branch_id, v_branch_name
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  join public.branch as branch
    on branch.id = branch_admin.branch_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date > v_yesterday
    or p_end_date - p_start_date > 90 then
    raise exception 'A valid completed-day date range of at most 91 days is required';
  end if;

  return query
  select v_branch_id,
         v_branch_name,
         calendar_day.day::date,
         missing.missing_inputs
  from generate_series(
         p_start_date::timestamp,
         p_end_date::timestamp,
         interval '1 day'
       ) as calendar_day(day)
  cross join lateral (
    select array_remove(array[
      case when not exists (
        select 1
        from public.employee_attendance as attendance
        join public.employee as employee
          on employee.id = attendance.employee_id
        where employee.branch_id = v_branch_id
          and attendance.attendance_date = calendar_day.day::date
      ) then 'Attendance'::text end,
      case when not exists (
        select 1
        from public.cash_receipts_journal as entry
        where entry.branch_id = v_branch_id
          and entry."date" = calendar_day.day::date
      ) then 'Cash Receipts Journal'::text end,
      case when not exists (
        select 1
        from public.deposit as entry
        where entry.branch_id = v_branch_id
          and entry.date_deposit = calendar_day.day::date
      ) then 'Deposit'::text end,
      case when not exists (
        select 1
        from public.branch_cdj as entry
        where entry.branch_id = v_branch_id
          and entry."date" = calendar_day.day::date
      ) then 'Cash Disbursement Journal'::text end
    ], null) as missing_inputs
  ) as missing
  where cardinality(missing.missing_inputs) > 0
    and not exists (
      select 1
      from public.branch_daily_no_operation as no_operation
      where no_operation.branch_id = v_branch_id
        and no_operation.operation_date = calendar_day.day::date
    )
  order by calendar_day.day desc;
end;
$$;

create or replace function public.tafi_admin_list_missing_daily_inputs(
  p_session_token uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  branch_id uuid,
  branch_name text,
  report_date date,
  missing_inputs text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yesterday date := (now() at time zone 'Asia/Manila')::date - 1;
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date > v_yesterday
    or p_end_date - p_start_date > 90 then
    raise exception 'A valid completed-day date range of at most 91 days is required';
  end if;

  return query
  select branch.id,
         branch.name,
         calendar_day.day::date,
         missing.missing_inputs
  from public.branch as branch
  cross join generate_series(
         p_start_date::timestamp,
         p_end_date::timestamp,
         interval '1 day'
       ) as calendar_day(day)
  cross join lateral (
    select array_remove(array[
      case when not exists (
        select 1
        from public.employee_attendance as attendance
        join public.employee as employee
          on employee.id = attendance.employee_id
        where employee.branch_id = branch.id
          and attendance.attendance_date = calendar_day.day::date
      ) then 'Attendance'::text end,
      case when not exists (
        select 1
        from public.cash_receipts_journal as entry
        where entry.branch_id = branch.id
          and entry."date" = calendar_day.day::date
      ) then 'Cash Receipts Journal'::text end,
      case when not exists (
        select 1
        from public.deposit as entry
        where entry.branch_id = branch.id
          and entry.date_deposit = calendar_day.day::date
      ) then 'Deposit'::text end,
      case when not exists (
        select 1
        from public.branch_cdj as entry
        where entry.branch_id = branch.id
          and entry."date" = calendar_day.day::date
      ) then 'Cash Disbursement Journal'::text end
    ], null) as missing_inputs
  ) as missing
  where cardinality(missing.missing_inputs) > 0
    and not exists (
      select 1
      from public.branch_daily_no_operation as no_operation
      where no_operation.branch_id = branch.id
        and no_operation.operation_date = calendar_day.day::date
    )
  order by branch.name, calendar_day.day desc;
end;
$$;

create or replace function public.branch_admin_mark_date_no_operation(
  p_session_token uuid,
  p_operation_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_branch_admin_id uuid;
begin
  select branch_admin.branch_id, branch_admin.id
  into v_branch_id, v_branch_admin_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_operation_date is null
    or p_operation_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'A valid current or past operation date is required';
  end if;

  insert into public.branch_daily_no_operation (
    branch_id,
    operation_date,
    marked_by_branch_admin_id,
    marked_at
  )
  values (
    v_branch_id,
    p_operation_date,
    v_branch_admin_id,
    now()
  )
  on conflict (branch_id, operation_date)
  do update set
    marked_by_branch_admin_id = excluded.marked_by_branch_admin_id,
    marked_at = excluded.marked_at;
end;
$$;

revoke all on function public.branch_admin_list_missing_daily_inputs(uuid, date, date) from public;
revoke all on function public.tafi_admin_list_missing_daily_inputs(uuid, date, date) from public;
revoke all on function public.branch_admin_mark_date_no_operation(uuid, date) from public;

grant execute on function public.branch_admin_list_missing_daily_inputs(uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_missing_daily_inputs(uuid, date, date) to anon, authenticated;
grant execute on function public.branch_admin_mark_date_no_operation(uuid, date) to anon, authenticated;

commit;
