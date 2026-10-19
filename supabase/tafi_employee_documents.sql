begin;

-- Run after tafi_admin_management.sql.
create table if not exists public.tafi_employee_document_record (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee(id) on delete cascade,
  document_type text not null check (document_type in (
    'incident_report',
    'employee_contract',
    'employee_evaluation'
  )),
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  )),
  file_data bytea not null check (octet_length(file_data) between 1 and 5242880),
  uploaded_by_tafi_admin_id uuid references public.tafi_admin(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists tafi_employee_document_record_employee_type_idx
  on public.tafi_employee_document_record (employee_id, document_type, uploaded_at desc);

alter table public.tafi_employee_document_record enable row level security;
revoke all on table public.tafi_employee_document_record from public, anon, authenticated;

create or replace function public.tafi_admin_list_employee_documents(
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
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;

  if p_employee_id is null or not exists (
    select 1 from public.employee as employee where employee.id = p_employee_id
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
    or length(p_file_base64) > 6990508 then
    raise exception 'Employee documents must be no larger than 5 MB';
  end if;

  v_file_data := decode(p_file_base64, 'base64');
  if octet_length(v_file_data) = 0 or octet_length(v_file_data) > 5242880 then
    raise exception 'Employee documents must be no larger than 5 MB';
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

create or replace function public.tafi_admin_get_employee_document(
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
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
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

revoke all on function public.tafi_admin_list_employee_documents(uuid, uuid) from public;
revoke all on function public.tafi_admin_upload_employee_document(uuid, uuid, text, text, text, text) from public;
revoke all on function public.tafi_admin_get_employee_document(uuid, uuid) from public;

grant execute on function public.tafi_admin_list_employee_documents(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_upload_employee_document(uuid, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.tafi_admin_get_employee_document(uuid, uuid) to anon, authenticated;

commit;
