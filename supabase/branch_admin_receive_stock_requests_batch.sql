-- Run after branch_stock_in_records.sql.
-- Adds atomic receipt confirmation for all delivered items from one Manila request date.
begin;

do $$
begin
  if to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.branch_admin_session') is null
    or to_regprocedure('public.branch_admin_receive_stock_request(uuid, uuid, numeric)') is null then
    raise exception 'Install the Branch Admin stock request and receipt migrations first.';
  end if;
end;
$$;

create or replace function public.branch_admin_receive_stock_requests_batch(
  p_session_token uuid,
  p_request_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_request record;
  v_request_date date;
  v_received_count integer := 0;
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

  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    raise exception 'Select at least one delivered stock request';
  end if;

  for v_request in
    select request.id,
           request.branch_id,
           request.status,
           request.created_at,
           request.quantity_delivered
    from public.branch_stock_requests as request
    where request.id = any(p_request_ids)
    order by request.id
    for update
  loop
    if v_request.branch_id <> v_branch_id then
      raise exception 'All selected stock requests must belong to this branch';
    end if;
    if v_request.status <> 'delivered' then
      raise exception 'All selected stock requests must still be delivered';
    end if;

    if v_request_date is null then
      v_request_date := (v_request.created_at at time zone 'Asia/Manila')::date;
    elsif v_request_date <> (v_request.created_at at time zone 'Asia/Manila')::date then
      raise exception 'All selected stock requests must be from the same Manila date';
    end if;

    perform public.branch_admin_receive_stock_request(
      p_session_token,
      v_request.id,
      v_request.quantity_delivered
    );
    v_received_count := v_received_count + 1;
  end loop;

  if v_received_count <> cardinality(p_request_ids) then
    raise exception 'One or more selected stock requests were missing or duplicated';
  end if;

  return v_received_count;
end;
$$;

revoke all on function public.branch_admin_receive_stock_requests_batch(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.branch_admin_receive_stock_requests_batch(uuid, uuid[])
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
