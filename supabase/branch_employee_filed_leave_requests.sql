begin;

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
    'sick_leave',
    'emergency_leave',
    'vl_with_pay',
    'vl_without_pay',
    'day_off'
  ));

alter table public.branch_employee_leave_request
  add column if not exists leave_type text not null default 'vl_with_pay';
alter table public.branch_employee_leave_request
  add column if not exists requested_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict;
alter table public.branch_employee_leave_request
  alter column requested_by_branch_admin_id drop not null;
alter table public.branch_employee_leave_request
  drop constraint if exists branch_employee_leave_request_requester_check;
alter table public.branch_employee_leave_request
  add constraint branch_employee_leave_request_requester_check
  check (
    (requested_by_branch_admin_id is not null)
    <> (requested_by_tafi_admin_id is not null)
  );

alter table public.employee_attendance
  add column if not exists submitted_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete set null;

alter table public.branch_employee_leave_request
  drop constraint if exists branch_employee_leave_request_credit_days_check;
alter table public.branch_employee_leave_request
  add constraint branch_employee_leave_request_credit_days_check
  check (credit_days >= 0);

alter table public.branch_employee_leave_request
  drop constraint if exists branch_employee_leave_request_leave_type_check;
alter table public.branch_employee_leave_request
  add constraint branch_employee_leave_request_leave_type_check
  check (leave_type in (
    'vl_with_pay',
    'vl_without_pay',
    'maternity_leave',
    'paternity_leave',
    'birthday_leave',
    'authorized_leave',
    'sick_leave',
    'emergency_leave'
  ));

create table if not exists public.branch_employee_leave_request_attachment (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.branch_employee_leave_request(id) on delete cascade,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  content_type text not null default 'application/pdf'
    check (content_type = 'application/pdf'),
  file_data bytea not null check (octet_length(file_data) between 1 and 20971520),
  uploaded_by_branch_admin_id uuid references public.branch_admin(id) on delete restrict,
  uploaded_by_tafi_admin_id uuid references public.tafi_admin(id) on delete restrict,
  constraint branch_employee_leave_request_attachment_uploader_check
    check (
      (uploaded_by_branch_admin_id is not null)
      <> (uploaded_by_tafi_admin_id is not null)
    ),
  created_at timestamptz not null default now()
);

alter table public.branch_employee_leave_request_attachment
  add column if not exists uploaded_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict;
alter table public.branch_employee_leave_request_attachment
  alter column uploaded_by_branch_admin_id drop not null;
alter table public.branch_employee_leave_request_attachment
  drop constraint if exists branch_employee_leave_request_attachment_uploader_check;
alter table public.branch_employee_leave_request_attachment
  add constraint branch_employee_leave_request_attachment_uploader_check
  check (
    (uploaded_by_branch_admin_id is not null)
    <> (uploaded_by_tafi_admin_id is not null)
  );

create index if not exists branch_employee_leave_request_attachment_request_idx
  on public.branch_employee_leave_request_attachment(leave_request_id, created_at, id);

alter table public.branch_employee_leave_request_attachment enable row level security;
revoke all on table public.branch_employee_leave_request_attachment from public, anon, authenticated;

drop function if exists public.branch_admin_list_employee_leave_requests(uuid);

create function public.branch_admin_list_employee_leave_requests(p_session_token uuid)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  employee_position text,
  start_date date,
  end_date date,
  leave_type text,
  credit_days numeric,
  reason text,
  status text,
  created_at timestamptz,
  attachments jsonb
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
  select leave_request.id,
    leave_request.employee_code,
    employee.name,
    employee.position,
    leave_request.start_date,
    leave_request.end_date,
    leave_request.leave_type,
    leave_request.credit_days,
    leave_request.reason,
    leave_request.status,
    leave_request.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attachment.id,
        'file_name', attachment.file_name
      ) order by attachment.created_at, attachment.id)
      from public.branch_employee_leave_request_attachment as attachment
      where attachment.leave_request_id = leave_request.id
    ), '[]'::jsonb)
  from public.branch_employee_leave_request as leave_request
  join public.employee as employee
    on employee.branch_id = leave_request.branch_id
    and employee.employee_code = leave_request.employee_code
  where leave_request.branch_id = v_branch_id
  order by leave_request.created_at desc, leave_request.id;
end;
$$;

drop function if exists public.tafi_admin_list_employee_leave_requests(uuid, uuid);

create function public.tafi_admin_list_employee_leave_requests(
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
  leave_type text,
  credit_days numeric,
  reason text,
  status text,
  created_at timestamptz,
  attachments jsonb
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
  if p_branch_id is null or not exists (
    select 1 from public.branch where id = p_branch_id
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
    leave_request.leave_type,
    leave_request.credit_days,
    leave_request.reason,
    leave_request.status,
    leave_request.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attachment.id,
        'file_name', attachment.file_name
      ) order by attachment.created_at, attachment.id)
      from public.branch_employee_leave_request_attachment as attachment
      where attachment.leave_request_id = leave_request.id
    ), '[]'::jsonb)
  from public.branch_employee_leave_request as leave_request
  join public.employee as employee
    on employee.branch_id = leave_request.branch_id
    and employee.employee_code = leave_request.employee_code
  where leave_request.branch_id = p_branch_id
  order by leave_request.created_at desc, leave_request.id;
end;
$$;

create or replace function public.file_employee_leave_request_internal(
  p_branch_id uuid,
  p_requested_by_branch_admin_id uuid,
  p_requested_by_tafi_admin_id uuid,
  p_employee_code text,
  p_start_date date,
  p_end_date date,
  p_leave_type text,
  p_reason text,
  p_attachments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_branch_id uuid;
  v_employee_id uuid;
  v_employee_classification text;
  v_daily_rate numeric;
  v_day_count integer;
  v_credit_days numeric := 0;
  v_earned numeric := 0;
  v_manual numeric := 0;
  v_used numeric := 0;
  v_pending numeric := 0;
  v_balance numeric := 0;
  v_attachment jsonb;
  v_file_name text;
  v_file_base64 text;
  v_file_data bytea;
  v_total_file_size integer := 0;
  v_request_id uuid;
  v_day_offset integer;
  v_saved_count bigint;
begin
  v_branch_id := p_branch_id;
  if (p_requested_by_branch_admin_id is not null)
    = (p_requested_by_tafi_admin_id is not null) then
    raise exception 'Exactly one authorized leave requester is required';
  end if;
  if v_branch_id is null
    or not exists (select 1 from public.branch where id = v_branch_id) then
    raise exception 'The selected branch was not found';
  end if;
  if p_requested_by_branch_admin_id is not null
    and not exists (
      select 1
      from public.branch_admin as branch_admin
      where branch_admin.id = p_requested_by_branch_admin_id
        and branch_admin.branch_id = v_branch_id
    ) then
    raise exception 'The Branch Admin does not belong to the selected branch';
  end if;
  if p_requested_by_tafi_admin_id is not null
    and not exists (
      select 1
      from public.tafi_admin
      where id = p_requested_by_tafi_admin_id
    ) then
    raise exception 'The TAFI Admin was not found';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid leave start and end date are required';
  end if;
  if p_leave_type is null or p_leave_type not in (
    'vl_with_pay',
    'vl_without_pay',
    'maternity_leave',
    'paternity_leave',
    'birthday_leave',
    'authorized_leave',
    'sick_leave',
    'emergency_leave'
  ) then
    raise exception 'Select a valid leave type';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'A reason of 1 to 500 characters is required';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' then
    raise exception 'Attach at least one PDF leave form';
  end if;
  if jsonb_array_length(p_attachments) < 1 then
    raise exception 'Attach at least one PDF leave form';
  end if;

  for v_attachment in select value from jsonb_array_elements(p_attachments)
  loop
    v_file_name := nullif(trim(v_attachment->>'file_name'), '');
    v_file_base64 := v_attachment->>'file_base64';

    if v_file_name is null or length(v_file_name) > 255
      or lower(v_file_name) not like '%.pdf' then
      raise exception 'Every leave attachment must be a PDF with a valid file name';
    end if;
    if v_file_base64 is null or length(v_file_base64) = 0
      or length(v_file_base64) > 27962028 then
      raise exception 'Each attached PDF must be no larger than 20 MB';
    end if;

    v_file_data := decode(v_file_base64, 'base64');
    if octet_length(v_file_data) = 0
      or octet_length(v_file_data) > 20971520
      or substring(v_file_data from 1 for 5) <> decode('255044462D', 'hex') then
      raise exception 'Each attachment must be a valid PDF no larger than 20 MB';
    end if;

    v_total_file_size := v_total_file_size + octet_length(v_file_data);
    if v_total_file_size > 20971520 then
      raise exception 'The combined size of attached PDFs must not exceed 20 MB';
    end if;
  end loop;

  v_day_count := p_end_date - p_start_date + 1;
  if p_leave_type = 'vl_with_pay' then
    v_credit_days := v_day_count;
  end if;

  select employee.id, employee.employment_classification, employee.daily_rate
  into v_employee_id, v_employee_classification, v_daily_rate
  from public.employee as employee
  where employee.branch_id = v_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active'
  for update;

  if not found then
    raise exception 'The employee is not active in this branch';
  end if;

  if p_leave_type = 'vl_with_pay' then
    if v_employee_classification <> 'Regular' then
      raise exception 'Only Regular employees with leave credits can file Vacation Leave with Pay';
    end if;

    select count(*)::numeric * 1.25
    into v_earned
    from (
      select date_trunc('month', attendance.attendance_date)::date as attendance_month
      from public.employee_attendance as attendance
      where attendance.employee_id = v_employee_id
        and attendance.status in ('present', 'present_late')
      group by date_trunc('month', attendance.attendance_date)::date
      having count(distinct attendance.attendance_date) >=
        case when extract(month from min(attendance.attendance_date)) = 2
          then 24 else 26 end
    ) as qualifying_months;

    select coalesce(sum(adjustment.credit_days), 0)
    into v_manual
    from public.branch_employee_leave_credit_adjustment as adjustment
    where adjustment.branch_id = v_branch_id
      and adjustment.employee_code = trim(p_employee_code);

    select
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'approved'), 0),
      coalesce(sum(leave_request.credit_days) filter (where leave_request.status = 'pending'), 0)
    into v_used, v_pending
    from public.branch_employee_leave_request as leave_request
    where leave_request.branch_id = v_branch_id
      and leave_request.employee_code = trim(p_employee_code);

    v_balance := v_earned + v_manual - v_used - v_pending;
    if v_credit_days > v_balance then
      raise exception 'Insufficient leave credits: % days are available; file Vacation Leave without Pay or another leave type',
        greatest(v_balance, 0);
    end if;
  end if;

  if exists (
    select 1
    from public.branch_employee_leave_request as leave_request
    where leave_request.branch_id = v_branch_id
      and leave_request.employee_code = trim(p_employee_code)
      and leave_request.status in ('approved', 'pending')
      and leave_request.start_date <= p_end_date
      and leave_request.end_date >= p_start_date
  ) then
    raise exception 'These dates overlap another filed or pending leave request';
  end if;

  if exists (
    select 1
    from public.employee_attendance as attendance
    where attendance.employee_id = v_employee_id
      and attendance.attendance_date between p_start_date and p_end_date
      and attendance.status not in ('absent', 'not_marked')
  ) then
    raise exception 'One or more leave dates already have an attendance record';
  end if;

  insert into public.branch_employee_leave_request (
    branch_id,
    employee_code,
    start_date,
    end_date,
    leave_type,
    credit_days,
    reason,
    status,
    requested_by_branch_admin_id,
    requested_by_tafi_admin_id
  )
  values (
    v_branch_id,
    trim(p_employee_code),
    p_start_date,
    p_end_date,
    p_leave_type,
    v_credit_days,
    trim(p_reason),
    'approved',
    p_requested_by_branch_admin_id,
    p_requested_by_tafi_admin_id
  )
  returning id into v_request_id;

  for v_attachment in select value from jsonb_array_elements(p_attachments)
  loop
    insert into public.branch_employee_leave_request_attachment (
      leave_request_id,
      file_name,
      file_data,
      uploaded_by_branch_admin_id,
      uploaded_by_tafi_admin_id
    )
    values (
      v_request_id,
      trim(v_attachment->>'file_name'),
      decode(v_attachment->>'file_base64', 'base64'),
      p_requested_by_branch_admin_id,
      p_requested_by_tafi_admin_id
    );
  end loop;

  for v_day_offset in 0..(v_day_count - 1)
  loop
    insert into public.employee_attendance as current_attendance (
      employee_id,
      attendance_date,
      status,
      late_minutes,
      daily_rate_snapshot,
      submitted_by,
      submitted_by_tafi_admin_id,
      updated_at
    )
    values (
      v_employee_id,
      p_start_date + v_day_offset,
      p_leave_type,
      0,
      v_daily_rate,
      p_requested_by_branch_admin_id,
      p_requested_by_tafi_admin_id,
      now()
    )
    on conflict (employee_id, attendance_date) do update
    set status = excluded.status,
      late_minutes = 0,
      daily_rate_snapshot = excluded.daily_rate_snapshot,
      submitted_by = excluded.submitted_by,
      submitted_by_tafi_admin_id = excluded.submitted_by_tafi_admin_id,
      updated_at = now()
    where current_attendance.status in ('absent', 'not_marked');

    get diagnostics v_saved_count = row_count;
    if v_saved_count <> 1 then
      raise exception 'Could not record leave attendance for %', p_start_date + v_day_offset;
    end if;
  end loop;

  return v_request_id;
end;
$$;

create or replace function public.branch_admin_file_employee_leave_request(
  p_session_token uuid,
  p_employee_code text,
  p_start_date date,
  p_end_date date,
  p_leave_type text,
  p_reason text,
  p_attachments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_admin_id uuid;
  v_branch_id uuid;
begin
  select branch_admin.id, branch_admin.branch_id
  into v_admin_id, v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return public.file_employee_leave_request_internal(
    v_branch_id,
    v_admin_id,
    null,
    p_employee_code,
    p_start_date,
    p_end_date,
    p_leave_type,
    p_reason,
    p_attachments
  );
end;
$$;

create or replace function public.tafi_admin_file_employee_leave_request(
  p_session_token uuid,
  p_branch_id uuid,
  p_employee_code text,
  p_start_date date,
  p_end_date date,
  p_leave_type text,
  p_reason text,
  p_attachments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_admin_id uuid;
begin
  select admin_session.tafi_admin_id
  into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  return public.file_employee_leave_request_internal(
    p_branch_id,
    null,
    v_admin_id,
    p_employee_code,
    p_start_date,
    p_end_date,
    p_leave_type,
    p_reason,
    p_attachments
  );
end;
$$;

create or replace function public.branch_admin_get_employee_leave_request_attachment(
  p_session_token uuid,
  p_attachment_id uuid
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

  if p_attachment_id is null or not exists (
    select 1
    from public.branch_employee_leave_request_attachment as attachment
    join public.branch_employee_leave_request as leave_request
      on leave_request.id = attachment.leave_request_id
    where attachment.id = p_attachment_id
      and leave_request.branch_id = v_branch_id
  ) then
    raise exception 'The leave attachment was not found in this branch';
  end if;

  return query
  select attachment.file_name,
    attachment.content_type,
    replace(encode(attachment.file_data, 'base64'), E'\n', '')
  from public.branch_employee_leave_request_attachment as attachment
  join public.branch_employee_leave_request as leave_request
    on leave_request.id = attachment.leave_request_id
  where attachment.id = p_attachment_id
    and leave_request.branch_id = v_branch_id;
end;
$$;

create or replace function public.tafi_admin_get_employee_leave_request_attachment(
  p_session_token uuid,
  p_attachment_id uuid
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
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_attachment_id is null then
    raise exception 'The leave attachment was not found';
  end if;

  return query
  select attachment.file_name,
    attachment.content_type,
    replace(encode(attachment.file_data, 'base64'), E'\n', '')
  from public.branch_employee_leave_request_attachment as attachment
  where attachment.id = p_attachment_id;

  if not found then
    raise exception 'The leave attachment was not found';
  end if;
end;
$$;

do $$
declare
  v_definition text;
  v_old_statuses constant text :=
    '''birthday_leave'', ''vl_with_pay'', ''vl_without_pay'', ''day_off''';
  v_new_statuses constant text :=
    '''birthday_leave'', ''sick_leave'', ''emergency_leave'', ''vl_with_pay'', ''vl_without_pay'', ''day_off''';
  v_old_start constant text := 'if v_status <> ''vl_with_pay'' and exists (';
  v_new_start constant text := 'if exists (';
  v_old_range constant text :=
    'and p_attendance_date between leave_request.start_date and leave_request.end_date';
  v_new_range constant text :=
    E'and p_attendance_date between leave_request.start_date and leave_request.end_date\n        and leave_request.leave_type <> v_status';
begin
  v_definition := pg_get_functiondef(
    'public.branch_admin_save_attendance(uuid,date,jsonb)'::regprocedure
  );
  if position('''sick_leave''' in v_definition) = 0 then
    if position(v_old_statuses in v_definition) = 0 then
      raise exception 'Branch attendance status validation is not in the expected format';
    end if;
    v_definition := replace(v_definition, v_old_statuses, v_new_statuses);
  end if;
  if position('''emergency_leave''' in v_definition) = 0 then
    raise exception 'Branch attendance status validation is not in the expected format';
  end if;

  if position(v_old_start in v_definition) > 0
    and position(v_old_range in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_start, v_new_start);
    v_definition := replace(v_definition, v_old_range, v_new_range);
    v_definition := replace(
      v_definition,
      'Attendance date is covered by an approved Leave with Pay request',
      'Attendance date is covered by a filed leave request'
    );
    execute v_definition;
  elsif position('and leave_request.leave_type <> v_status' in v_definition) = 0 then
    raise exception 'Branch attendance save validation is not in the expected format';
  else
    execute v_definition;
  end if;
end;
$$;

do $$
declare
  v_definition text;
  v_old_start constant text := 'if v_status <> ''vl_with_pay'' and exists (';
  v_new_start constant text := 'if exists (';
  v_old_range constant text :=
    'and p_attendance_date between leave_request.start_date and leave_request.end_date';
  v_new_range constant text :=
    E'and p_attendance_date between leave_request.start_date and leave_request.end_date\n        and leave_request.leave_type <> v_status';
begin
  v_definition := pg_get_functiondef(
    'public.tafi_admin_save_attendance(uuid,uuid,date,jsonb)'::regprocedure
  );
  if position(v_old_start in v_definition) > 0
    and position(v_old_range in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_start, v_new_start);
    v_definition := replace(v_definition, v_old_range, v_new_range);
    v_definition := replace(
      v_definition,
      'Attendance date is covered by an approved Leave with Pay request',
      'Attendance date is covered by a filed leave request'
    );
    execute v_definition;
  elsif position('and leave_request.leave_type <> v_status' in v_definition) = 0 then
    raise exception 'TAFI Admin attendance save validation is not in the expected format';
  else
    execute v_definition;
  end if;
end;
$$;

revoke all on function public.branch_admin_list_employee_leave_requests(uuid) from public;
revoke all on function public.branch_admin_file_employee_leave_request(uuid, text, date, date, text, text, jsonb) from public;
revoke all on function public.branch_admin_get_employee_leave_request_attachment(uuid, uuid) from public;
revoke all on function public.tafi_admin_list_employee_leave_requests(uuid, uuid) from public;
revoke all on function public.tafi_admin_file_employee_leave_request(uuid, uuid, text, date, date, text, text, jsonb) from public;
revoke all on function public.tafi_admin_get_employee_leave_request_attachment(uuid, uuid) from public;
revoke all on function public.file_employee_leave_request_internal(uuid, uuid, uuid, text, date, date, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.branch_admin_list_employee_leave_requests(uuid) to anon, authenticated;
grant execute on function public.branch_admin_file_employee_leave_request(uuid, text, date, date, text, text, jsonb) to anon, authenticated;
grant execute on function public.branch_admin_get_employee_leave_request_attachment(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_list_employee_leave_requests(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_file_employee_leave_request(uuid, uuid, text, date, date, text, text, jsonb) to anon, authenticated;
grant execute on function public.tafi_admin_get_employee_leave_request_attachment(uuid, uuid) to anon, authenticated;

commit;
