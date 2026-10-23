begin;

-- Run after branch_management.sql and tafi_employee_documents.sql.
alter table public.tafi_employee_document_record
  add column if not exists uploaded_by_branch_admin_id uuid
  references public.branch_admin(id) on delete set null;

create or replace function public.branch_admin_list_employee_documents(
  p_session_token uuid,
  p_employee_code text
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

  if not exists (
    select 1
    from public.employee as employee
    where employee.branch_id = v_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Employee was not found in this branch';
  end if;

  return query
  select record.id,
    record.document_type,
    record.file_name,
    record.content_type,
    octet_length(record.file_data),
    record.uploaded_at
  from public.tafi_employee_document_record as record
  join public.employee as employee
    on employee.id = record.employee_id
  where employee.branch_id = v_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active'
  order by record.uploaded_at desc, record.id;
end;
$$;

create or replace function public.branch_admin_upload_employee_document(
  p_session_token uuid,
  p_employee_code text,
  p_document_type text,
  p_file_name text,
  p_content_type text,
  p_file_base64 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_branch_admin_id uuid;
  v_branch_id uuid;
  v_employee_id uuid;
  v_file_data bytea;
  v_document_id uuid;
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

  select employee.id
  into v_employee_id
  from public.employee as employee
  where employee.branch_id = v_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active';

  if not found then
    raise exception 'Employee was not found in this branch';
  end if;

  if p_document_type is null or p_document_type not in (
    'incident_report',
    'investigation_report',
    'employee_contract',
    'employee_evaluation'
  ) then
    raise exception 'Select a valid employee document category';
  end if;

  if nullif(trim(p_file_name), '') is null or length(trim(p_file_name)) > 255 then
    raise exception 'File name must be between 1 and 255 characters';
  end if;

  if p_content_type is null or p_content_type not in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ) then
    raise exception 'Upload a PDF, Word document, JPEG, PNG, or WebP image';
  end if;

  if p_file_base64 is null
    or length(p_file_base64) = 0
    or length(p_file_base64) > 27962028 then
    raise exception 'Employee records must be no larger than 20 MB';
  end if;

  v_file_data := decode(p_file_base64, 'base64');
  if octet_length(v_file_data) = 0 or octet_length(v_file_data) > 20971520 then
    raise exception 'Employee records must be no larger than 20 MB';
  end if;

  insert into public.tafi_employee_document_record (
    employee_id,
    document_type,
    file_name,
    content_type,
    file_data,
    uploaded_by_branch_admin_id
  )
  values (
    v_employee_id,
    p_document_type,
    trim(p_file_name),
    p_content_type,
    v_file_data,
    v_branch_admin_id
  )
  returning id into v_document_id;

  return v_document_id;
end;
$$;

create or replace function public.branch_admin_get_employee_document(
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

  if p_document_id is null or not exists (
    select 1
    from public.tafi_employee_document_record as record
    join public.employee as employee
      on employee.id = record.employee_id
    where record.id = p_document_id
      and employee.branch_id = v_branch_id
      and employee.employment_status = 'active'
  ) then
    raise exception 'Employee record was not found in this branch';
  end if;

  return query
  select record.file_name,
    record.content_type,
    replace(encode(record.file_data, 'base64'), E'\n', '')
  from public.tafi_employee_document_record as record
  join public.employee as employee
    on employee.id = record.employee_id
  where record.id = p_document_id
    and employee.branch_id = v_branch_id
    and employee.employment_status = 'active';
end;
$$;

revoke all on function public.branch_admin_list_employee_documents(uuid, text) from public;
revoke all on function public.branch_admin_upload_employee_document(uuid, text, text, text, text, text) from public;
revoke all on function public.branch_admin_get_employee_document(uuid, uuid) from public;

grant execute on function public.branch_admin_list_employee_documents(uuid, text) to anon, authenticated;
grant execute on function public.branch_admin_upload_employee_document(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.branch_admin_get_employee_document(uuid, uuid) to anon, authenticated;

commit;
