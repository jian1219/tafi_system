begin;

-- Run after tafi_employee_documents.sql.
alter table public.tafi_employee_document_record
  drop constraint if exists tafi_employee_document_record_file_data_check;

alter table public.tafi_employee_document_record
  add constraint tafi_employee_document_record_file_data_check
  check (octet_length(file_data) between 1 and 20971520);

create or replace function public.tafi_admin_upload_employee_document(
  p_session_token uuid,
  p_employee_id uuid,
  p_document_type text,
  p_file_name text,
  p_content_type text,
  p_file_base64 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_file_data bytea;
  v_document_id uuid;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_employee_id is null or not exists (
    select 1 from public.employee as employee where employee.id = p_employee_id
  ) then
    raise exception 'Employee was not found';
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
    raise exception 'Employee documents must be no larger than 20 MB';
  end if;

  v_file_data := decode(p_file_base64, 'base64');
  if octet_length(v_file_data) = 0 or octet_length(v_file_data) > 20971520 then
    raise exception 'Employee documents must be no larger than 20 MB';
  end if;

  insert into public.tafi_employee_document_record (
    employee_id,
    document_type,
    file_name,
    content_type,
    file_data,
    uploaded_by_tafi_admin_id
  )
  values (
    p_employee_id,
    p_document_type,
    trim(p_file_name),
    p_content_type,
    v_file_data,
    v_tafi_admin_id
  )
  returning id into v_document_id;

  return v_document_id;
end;
$$;

revoke all on function public.tafi_admin_upload_employee_document(uuid, uuid, text, text, text, text) from public;
grant execute on function public.tafi_admin_upload_employee_document(uuid, uuid, text, text, text, text) to anon, authenticated;

commit;
