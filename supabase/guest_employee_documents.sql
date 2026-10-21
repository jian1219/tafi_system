begin;

-- Run after super_admin_guest_accounts.sql and tafi_employee_documents.sql.
create or replace function public.guest_list_employee_documents(
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
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;

  if p_employee_id is null or not exists (
    select 1
    from public.employee as employee
    where employee.id = p_employee_id
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

create or replace function public.guest_get_employee_document(
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
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
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

revoke all on function public.guest_list_employee_documents(uuid, uuid) from public;
revoke all on function public.guest_get_employee_document(uuid, uuid) from public;

grant execute on function public.guest_list_employee_documents(uuid, uuid) to anon, authenticated;
grant execute on function public.guest_get_employee_document(uuid, uuid) to anon, authenticated;

commit;
