-- Run after branch_stock_request_batches.sql and tafi_stock_request_preparation.sql.
begin;

do $$
begin
  if to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.branch_stock_receipt_history') is null
    or to_regclass('public.tafi_stock_request_preparation_items') is null
    or to_regclass('public.tafi_stock_inventory') is null
    or to_regclass('public.branch_admin_session') is null
    or to_regclass('public.branch_admin') is null
    or to_regprocedure('public.branch_admin_list_stock_requests(uuid)') is null
    or to_regprocedure('public.branch_admin_list_stock_receipt_history(uuid)') is null then
    raise exception 'Install branch request, receipt history, and stock preparation migrations first.';
  end if;
end;
$$;

drop function public.branch_admin_list_stock_requests(uuid);
create function public.branch_admin_list_stock_requests(
  p_session_token uuid
)
returns table (
  request_id uuid,
  request_group_id uuid,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
  status text,
  quantity_delivered numeric,
  unit_price numeric,
  total_price numeric,
  created_at timestamptz
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
  select request.id,
         request.request_group_id,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         request.quantity_requested,
         request.status,
         request.quantity_delivered,
         delivered_price.unit_price,
         delivered_price.total_price,
         request.created_at
  from public.branch_stock_requests as request
  join public.tafi_stock_inventory as stock
    on stock.id = request.stock_inventory_id
  left join lateral (
    select case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
               / nullif(sum(item.quantity), 0)
             else null::numeric
           end as unit_price,
           case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
             else null::numeric
           end as total_price
    from public.tafi_stock_request_preparation_items as item
    where item.preparation_id = request.preparation_id
      and item.stock_inventory_id = request.stock_inventory_id
  ) as delivered_price on true
  where request.branch_id = v_branch_id
  order by request.created_at desc, request.request_group_id;
end;
$$;

drop function public.branch_admin_list_stock_receipt_history(uuid);
create function public.branch_admin_list_stock_receipt_history(
  p_session_token uuid
)
returns table (
  receipt_id uuid,
  request_id uuid,
  request_group_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_requested numeric,
  quantity_delivered numeric,
  quantity_received numeric,
  unit_price numeric,
  total_price numeric,
  received_at timestamptz
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
  select history.id,
         history.request_id,
         request.request_group_id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         history.quantity_requested,
         history.quantity_delivered,
         history.quantity_received,
         delivered_price.unit_price,
         delivered_price.total_price,
         history.received_at
  from public.branch_stock_receipt_history as history
  join public.branch_stock_requests as request
    on request.id = history.request_id
  join public.tafi_stock_inventory as stock
    on stock.id = history.stock_inventory_id
  left join lateral (
    select case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
               / nullif(sum(item.quantity), 0)
             else null::numeric
           end as unit_price,
           case
             when count(item.id) > 0
               and count(item.unit_price) = count(item.id)
             then sum(item.quantity * item.unit_price)
             else null::numeric
           end as total_price
    from public.tafi_stock_request_preparation_items as item
    where item.preparation_id = request.preparation_id
      and item.stock_inventory_id = history.stock_inventory_id
  ) as delivered_price on true
  where history.branch_id = v_branch_id
  order by history.received_at desc;
end;
$$;

revoke all on function public.branch_admin_list_stock_requests(uuid)
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_stock_receipt_history(uuid)
  from public, anon, authenticated;

grant execute on function public.branch_admin_list_stock_requests(uuid)
  to anon, authenticated;
grant execute on function public.branch_admin_list_stock_receipt_history(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
