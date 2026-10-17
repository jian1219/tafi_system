-- Run after attendance_period_controls.sql.
begin;

create table if not exists public.branch_attendance_period_access_mode (
  branch_id uuid primary key references public.branch(id) on delete cascade,
  access_mode text not null default 'weekly'
    check (access_mode in ('weekly', 'daily')),
  updated_by_tafi_admin_id uuid references public.tafi_admin(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.branch_attendance_period_access_mode enable row level security;
revoke all on table public.branch_attendance_period_access_mode from public, anon, authenticated;

alter table public.employee_attendance_period_control
  add column if not exists access_mode text not null default 'weekly'
  check (access_mode in ('weekly', 'daily'));

alter table public.employee_attendance_period_control
  drop constraint if exists employee_attendance_period_control_pkey;
alter table public.employee_attendance_period_control
  add constraint employee_attendance_period_control_pkey
  primary key (branch_id, period_start, access_mode);

alter table public.employee_attendance_period_unlock_request
  add column if not exists access_mode text not null default 'weekly'
  check (access_mode in ('weekly', 'daily'));

drop index if exists public.employee_attendance_period_unlock_request_pending_idx;
create unique index employee_attendance_period_unlock_request_pending_idx
  on public.employee_attendance_period_unlock_request (branch_id, period_start, access_mode)
  where status = 'pending';

create or replace function public.attendance_period_access_mode_for_branch(p_branch_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select setting.access_mode
      from public.branch_attendance_period_access_mode as setting
      where setting.branch_id = p_branch_id
    ),
    'weekly'
  );
$$;

create or replace function public.attendance_period_bounds_for_branch(
  p_attendance_date date,
  p_branch_id uuid
)
returns table (start_date date, end_date date)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_attendance_date is null or p_branch_id is null then
    raise exception 'Attendance date and branch are required';
  end if;

  if public.attendance_period_access_mode_for_branch(p_branch_id) = 'daily' then
    return query select p_attendance_date, p_attendance_date;
  else
    return query
    select bounds.start_date, bounds.end_date
    from public.attendance_period_bounds(p_attendance_date) as bounds;
  end if;
end;
$$;

create or replace function public.tafi_admin_get_attendance_period_access_mode(
  p_session_token uuid,
  p_branch_id uuid
)
returns text
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

  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'Choose a valid branch';
  end if;

  return public.attendance_period_access_mode_for_branch(p_branch_id);
end;
$$;

create or replace function public.tafi_admin_set_attendance_period_access_mode(
  p_session_token uuid,
  p_branch_id uuid,
  p_access_mode text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
begin
  select admin_session.tafi_admin_id
  into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if v_admin_id is null then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id)
    or p_access_mode is null
    or p_access_mode not in ('weekly', 'daily') then
    raise exception 'Choose a valid branch and attendance access mode';
  end if;

  insert into public.branch_attendance_period_access_mode (
    branch_id, access_mode, updated_by_tafi_admin_id, updated_at
  )
  values (p_branch_id, p_access_mode, v_admin_id, now())
  on conflict (branch_id) do update
  set access_mode = excluded.access_mode,
    updated_by_tafi_admin_id = excluded.updated_by_tafi_admin_id,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.attendance_period_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_access_mode text;
  v_period_start date;
  v_period_end date;
  v_manual_lock boolean;
begin
  if new.submitted_by is null then
    return new;
  end if;

  select employee.branch_id
  into v_branch_id
  from public.employee as employee
  where employee.id = new.employee_id;

  v_access_mode := public.attendance_period_access_mode_for_branch(v_branch_id);
  select bounds.start_date, bounds.end_date
  into v_period_start, v_period_end
  from public.attendance_period_bounds_for_branch(new.attendance_date, v_branch_id) as bounds;

  select control.is_locked
  into v_manual_lock
  from public.employee_attendance_period_control as control
  where control.branch_id = v_branch_id
    and control.period_start = v_period_start
    and control.access_mode = v_access_mode;

  if coalesce(v_manual_lock, v_period_end < timezone('Asia/Manila', now())::date) then
    raise exception 'This attendance period is locked. Request TAFI Admin to unlock it.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function public.branch_admin_get_attendance_period_control(
  p_session_token uuid,
  p_attendance_date date
)
returns table (
  period_start date,
  period_end date,
  is_locked boolean,
  is_automatic boolean,
  pending_request_id bigint,
  requested_by text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_access_mode text;
  v_period_start date;
  v_period_end date;
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

  v_access_mode := public.attendance_period_access_mode_for_branch(v_branch_id);
  select bounds.start_date, bounds.end_date
  into v_period_start, v_period_end
  from public.attendance_period_bounds_for_branch(p_attendance_date, v_branch_id) as bounds;

  return query
  select v_period_start,
    v_period_end,
    coalesce(control.is_locked, v_period_end < timezone('Asia/Manila', now())::date),
    control.branch_id is null,
    request.id,
    branch_admin.name,
    request.requested_at
  from (select 1) as anchor
  left join public.employee_attendance_period_control as control
    on control.branch_id = v_branch_id
    and control.period_start = v_period_start
    and control.access_mode = v_access_mode
  left join lateral (
    select unlock_request.id,
      unlock_request.requested_by_branch_admin_id,
      unlock_request.requested_at
    from public.employee_attendance_period_unlock_request as unlock_request
    where unlock_request.branch_id = v_branch_id
      and unlock_request.period_start = v_period_start
      and unlock_request.access_mode = v_access_mode
      and unlock_request.status = 'pending'
    order by unlock_request.requested_at desc
    limit 1
  ) as request on true
  left join public.branch_admin as branch_admin
    on branch_admin.id = request.requested_by_branch_admin_id;
end;
$$;

create or replace function public.branch_admin_request_attendance_period_unlock(
  p_session_token uuid,
  p_attendance_date date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_admin_id uuid;
  v_branch_id uuid;
  v_access_mode text;
  v_period_start date;
  v_period_end date;
  v_request_id bigint;
begin
  select branch_admin.id, branch_admin.branch_id
  into v_branch_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  v_access_mode := public.attendance_period_access_mode_for_branch(v_branch_id);
  select bounds.start_date, bounds.end_date
  into v_period_start, v_period_end
  from public.attendance_period_bounds_for_branch(p_attendance_date, v_branch_id) as bounds;

  if not coalesce((
    select control.is_locked
    from public.employee_attendance_period_control as control
    where control.branch_id = v_branch_id
      and control.period_start = v_period_start
      and control.access_mode = v_access_mode
  ), v_period_end < timezone('Asia/Manila', now())::date) then
    raise exception 'This attendance period is already unlocked';
  end if;

  insert into public.employee_attendance_period_unlock_request (
    branch_id, period_start, period_end, access_mode, requested_by_branch_admin_id
  )
  values (v_branch_id, v_period_start, v_period_end, v_access_mode, v_branch_admin_id)
  on conflict (branch_id, period_start, access_mode) where status = 'pending'
  do update set
    requested_by_branch_admin_id = excluded.requested_by_branch_admin_id,
    requested_at = now()
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.tafi_admin_list_attendance_period_controls(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_starts jsonb
)
returns table (
  period_start date,
  period_end date,
  is_locked boolean,
  is_automatic boolean,
  pending_request_id bigint,
  requested_by text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_start date;
  v_period_start date;
  v_period_end date;
  v_access_mode text;
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or not exists (select 1 from public.branch where id = p_branch_id)
    or jsonb_typeof(p_period_starts) is distinct from 'array' then
    raise exception 'A valid branch and array of attendance period starts are required';
  end if;

  v_access_mode := public.attendance_period_access_mode_for_branch(p_branch_id);

  for v_requested_start in
    select period_start.value::date
    from jsonb_array_elements_text(p_period_starts) as period_start(value)
  loop
    select bounds.start_date, bounds.end_date
    into v_period_start, v_period_end
    from public.attendance_period_bounds_for_branch(v_requested_start, p_branch_id) as bounds;

    if v_period_start <> v_requested_start then
      raise exception 'Invalid attendance period start date';
    end if;

    return query
    select v_period_start,
      v_period_end,
      coalesce(control.is_locked, v_period_end < timezone('Asia/Manila', now())::date),
      control.branch_id is null,
      request.id,
      branch_admin.name,
      request.requested_at
    from (select 1) as anchor
    left join public.employee_attendance_period_control as control
      on control.branch_id = p_branch_id
      and control.period_start = v_period_start
      and control.access_mode = v_access_mode
    left join lateral (
      select unlock_request.id,
        unlock_request.requested_by_branch_admin_id,
        unlock_request.requested_at
      from public.employee_attendance_period_unlock_request as unlock_request
      where unlock_request.branch_id = p_branch_id
        and unlock_request.period_start = v_period_start
        and unlock_request.access_mode = v_access_mode
        and unlock_request.status = 'pending'
      order by unlock_request.requested_at desc
      limit 1
    ) as request on true
    left join public.branch_admin as branch_admin
      on branch_admin.id = request.requested_by_branch_admin_id;
  end loop;
end;
$$;

create or replace function public.tafi_admin_set_attendance_period_lock(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date,
  p_is_locked boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_access_mode text;
  v_expected_start date;
  v_expected_end date;
begin
  select admin_session.tafi_admin_id
  into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if v_admin_id is null then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or p_period_start is null
    or p_period_end is null
    or p_is_locked is null
    or not exists (select 1 from public.branch where id = p_branch_id) then
    raise exception 'A valid branch, period, and lock status are required';
  end if;

  v_access_mode := public.attendance_period_access_mode_for_branch(p_branch_id);
  select bounds.start_date, bounds.end_date
  into v_expected_start, v_expected_end
  from public.attendance_period_bounds_for_branch(p_period_start, p_branch_id) as bounds;
  if v_expected_start <> p_period_start or v_expected_end <> p_period_end then
    raise exception 'Attendance period dates do not match the selected access mode';
  end if;

  insert into public.employee_attendance_period_control (
    branch_id, period_start, period_end, access_mode, is_locked,
    updated_by_tafi_admin_id, updated_at
  )
  values (
    p_branch_id, p_period_start, p_period_end, v_access_mode, p_is_locked,
    v_admin_id, now()
  )
  on conflict (branch_id, period_start, access_mode) do update
  set period_end = excluded.period_end,
    is_locked = excluded.is_locked,
    updated_by_tafi_admin_id = excluded.updated_by_tafi_admin_id,
    updated_at = now();

  update public.employee_attendance_period_unlock_request as request
  set status = case when p_is_locked then 'denied' else 'approved' end,
    resolved_by_tafi_admin_id = v_admin_id,
    resolved_at = now()
  where request.branch_id = p_branch_id
    and request.period_start = p_period_start
    and request.access_mode = v_access_mode
    and request.status = 'pending';

  return true;
end;
$$;

revoke all on function public.attendance_period_access_mode_for_branch(uuid) from public;
revoke all on function public.attendance_period_bounds_for_branch(date, uuid) from public;
revoke all on function public.tafi_admin_get_attendance_period_access_mode(uuid, uuid) from public;
revoke all on function public.tafi_admin_set_attendance_period_access_mode(uuid, uuid, text) from public;
revoke all on function public.attendance_period_lock_guard() from public;
revoke all on function public.branch_admin_get_attendance_period_control(uuid, date) from public;
revoke all on function public.branch_admin_request_attendance_period_unlock(uuid, date) from public;
revoke all on function public.tafi_admin_list_attendance_period_controls(uuid, uuid, jsonb) from public;
revoke all on function public.tafi_admin_set_attendance_period_lock(uuid, uuid, date, date, boolean) from public;

grant execute on function public.tafi_admin_get_attendance_period_access_mode(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_set_attendance_period_access_mode(uuid, uuid, text) to anon, authenticated;
grant execute on function public.branch_admin_get_attendance_period_control(uuid, date) to anon, authenticated;
grant execute on function public.branch_admin_request_attendance_period_unlock(uuid, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_attendance_period_controls(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.tafi_admin_set_attendance_period_lock(uuid, uuid, date, date, boolean) to anon, authenticated;

commit;
