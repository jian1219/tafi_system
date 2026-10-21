begin;

-- Run after tafi_employee_documents.sql.
create or replace function public.tafi_admin_delete_employee_document(
  p_session_token uuid,
  p_document_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
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

  delete from public.tafi_employee_document_record as record
  where record.id = p_document_id;

  if not found then
    raise exception 'Employee document was not found';
  end if;

  return true;
end;
$$;

revoke all on function public.tafi_admin_delete_employee_document(uuid, uuid) from public;
grant execute on function public.tafi_admin_delete_employee_document(uuid, uuid) to anon, authenticated;

commit;
