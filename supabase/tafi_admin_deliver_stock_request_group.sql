-- Run after stock_request_delivery_receipt.sql and branch_stock_request_batches.sql.
-- Delivers every item in an order together; if any item cannot be fulfilled,
-- the database rolls back the whole order.
begin;

create or replace function public.tafi_admin_deliver_stock_request_group(
  p_session_token uuid,
  p_request_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_request record;
  v_found_request boolean := false;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_request_group_id is null then
    raise exception 'A stock request group is required';
  end if;

  for v_request in
    select request.id, request.stock_inventory_id,
      request.quantity_requested, request.status
    from public.branch_stock_requests as request
    where request.request_group_id = p_request_group_id
    order by request.stock_inventory_id, request.id
    for update
  loop
    v_found_request := true;

    if v_request.status <> 'pending' then
      raise exception 'Only orders with pending items can be marked delivered';
    end if;
    if v_request.quantity_requested is null or v_request.quantity_requested <= 0 then
      raise exception 'Requested quantity must be greater than zero';
    end if;

    update public.tafi_stock_inventory
    set onhand = onhand - v_request.quantity_requested
    where id = v_request.stock_inventory_id
      and available >= v_request.quantity_requested;

    if not found then
      raise exception 'Not enough TAFI stock to fulfill every item in this order';
    end if;

    update public.branch_stock_requests
    set status = 'delivered',
        quantity_delivered = v_request.quantity_requested,
        delivered_at = now(),
        delivered_by_tafi_admin_id = v_tafi_admin_id
    where id = v_request.id;
  end loop;

  if not v_found_request then
    raise exception 'Stock request order was not found';
  end if;

  return p_request_group_id;
end;
$$;

revoke all on function public.tafi_admin_deliver_stock_request_group(uuid, uuid) from public;
grant execute on function public.tafi_admin_deliver_stock_request_group(uuid, uuid) to anon, authenticated;

commit;
