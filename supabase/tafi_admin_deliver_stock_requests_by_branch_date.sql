-- Run after stock_request_delivery_receipt.sql and branch_stock_request_batches.sql.
-- Delivers all selected pending requests for one branch and Manila request date
-- in a single transaction. If any line cannot be fulfilled, all changes roll back.
begin;

drop function if exists public.tafi_admin_list_stock_requests(uuid);
create function public.tafi_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
  request_group_id uuid,
  branch_id uuid,
  branch_name text,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
  current_available numeric,
  status text,
  quantity_delivered numeric,
  quantity_received numeric,
  received_at timestamptz,
  created_at timestamptz
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
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select request.id,
         request.request_group_id,
         request.branch_id,
         branch.name,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         request.quantity_requested,
         stock.available,
         request.status,
         request.quantity_delivered,
         request.quantity_received,
         request.received_at,
         request.created_at
  from public.branch_stock_requests as request
  join public.branch as branch
    on branch.id = request.branch_id
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  order by request.created_at desc, request.request_group_id;
end;
$$;

revoke all on function public.tafi_admin_list_stock_requests(uuid) from public;
grant execute on function public.tafi_admin_list_stock_requests(uuid) to anon, authenticated;

create or replace function public.tafi_admin_deliver_stock_requests(
  p_session_token uuid,
  p_request_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_request record;
  v_request_count integer;
  v_branch_count integer;
  v_request_date_count integer;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    raise exception 'At least one stock request is required';
  end if;

  select count(*)::integer,
    count(distinct request.branch_id)::integer,
    count(distinct (request.created_at at time zone 'Asia/Manila')::date)::integer
  into v_request_count, v_branch_count, v_request_date_count
  from public.branch_stock_requests as request
  where request.id = any(p_request_ids);

  if v_request_count <> cardinality(p_request_ids) then
    raise exception 'One or more stock requests are missing or duplicated';
  end if;
  if v_branch_count <> 1 or v_request_date_count <> 1 then
    raise exception 'Requests must belong to the same branch and request date';
  end if;

  for v_request in
    select request.id, request.stock_inventory_id,
      request.quantity_requested, request.status
    from public.branch_stock_requests as request
    where request.id = any(p_request_ids)
    order by request.stock_inventory_id, request.id
    for update
  loop
    if v_request.status <> 'pending' then
      raise exception 'Only pending stock requests can be marked delivered';
    end if;
    if v_request.quantity_requested is null or v_request.quantity_requested <= 0 then
      raise exception 'Requested quantity must be greater than zero';
    end if;

    update public.tafi_stock_inventory
    set onhand = onhand - v_request.quantity_requested
    where id = v_request.stock_inventory_id
      and available >= v_request.quantity_requested;

    if not found then
      raise exception 'Not enough TAFI stock to fulfill every request for this branch and date';
    end if;

    update public.branch_stock_requests
    set status = 'delivered',
        quantity_delivered = v_request.quantity_requested,
        delivered_at = now(),
        delivered_by_tafi_admin_id = v_tafi_admin_id
    where id = v_request.id;
  end loop;

  return v_request_count;
end;
$$;

revoke all on function public.tafi_admin_deliver_stock_requests(uuid, uuid[]) from public;
grant execute on function public.tafi_admin_deliver_stock_requests(uuid, uuid[]) to anon, authenticated;

commit;
