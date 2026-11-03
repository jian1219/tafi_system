-- Run after tafi_stock_request_preparation.sql and tafi_stock_records_total_price.sql.
begin;

do $$
begin
  if to_regclass('public.stock_out_records') is null
    or to_regprocedure('public.tafi_admin_complete_stock_request_preparation(uuid, uuid)') is null
    or to_regprocedure('public.tafi_admin_list_stock_out_records(uuid, date, date)') is null
    or to_regprocedure('public.accountant_list_tafi_stock_out_records(uuid, date, date)') is null then
    raise exception 'Install TAFI stock-out, stock-request preparation, and stock-record price migrations first.';
  end if;
end;
$$;

alter table public.stock_out_records
  add column if not exists branch text not null default '';

alter table public.stock_out_records
  drop constraint if exists stock_out_records_pkey;
alter table public.stock_out_records
  add constraint stock_out_records_pkey primary key (barcode, date, branch);

create or replace function public.tafi_admin_complete_stock_request_preparation(
  p_session_token uuid,
  p_preparation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tafi_admin_id uuid;
  v_preparation public.tafi_stock_request_preparations%rowtype;
  v_item record;
  v_request_count integer;
  v_branch_name text;
  v_delivery_date date := (now() at time zone 'Asia/Manila')::date;
begin
  select admin_session.tafi_admin_id
  into v_tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  select preparation.*
  into v_preparation
  from public.tafi_stock_request_preparations as preparation
  where preparation.id = p_preparation_id
  for update;

  if not found or v_preparation.status <> 'preparing' then
    raise exception 'This stock request is no longer being prepared.';
  end if;

  select branch.name
  into v_branch_name
  from public.branch as branch
  where branch.id = v_preparation.branch_id;

  if not found or nullif(btrim(v_branch_name), '') is null then
    raise exception 'The requesting branch could not be found.';
  end if;

  perform request.id
  from public.branch_stock_requests as request
  where request.preparation_id = p_preparation_id
  order by request.stock_inventory_id, request.id
  for update;

  select count(*)::integer
  into v_request_count
  from public.branch_stock_requests as request
  where request.preparation_id = p_preparation_id
    and request.status = 'preparing';

  if v_request_count = 0 then
    raise exception 'There are no pending requests in this preparation.';
  end if;

  if exists (
    select 1
    from (
      select request.stock_inventory_id,
             sum(request.quantity_requested) as requested_quantity
      from public.branch_stock_requests as request
      where request.preparation_id = p_preparation_id
      group by request.stock_inventory_id
    ) as requested
    full join (
      select item.stock_inventory_id,
             sum(item.quantity) as prepared_quantity
      from public.tafi_stock_request_preparation_items as item
      where item.preparation_id = p_preparation_id
      group by item.stock_inventory_id
    ) as prepared
      on prepared.stock_inventory_id = requested.stock_inventory_id
    where coalesce(requested.requested_quantity, 0)
      <> coalesce(prepared.prepared_quantity, 0)
  ) then
    raise exception 'Prepared quantities must exactly match all requested quantities.';
  end if;

  for v_item in
    select item.barcode,
           item.stock_inventory_id,
           item.stock_no,
           item.item_description,
           item.unit_of_measure,
           item.quantity
    from public.tafi_stock_request_preparation_items as item
    where item.preparation_id = p_preparation_id
    order by item.barcode
    for update
  loop
    update public.tafi_admin_stock_in_scans as saved
    set scan_count = saved.scan_count - v_item.quantity,
        updated_at = now()
    where saved.barcode = v_item.barcode
      and saved.stock_no = v_item.stock_no
      and saved.scan_count >= v_item.quantity;

    if not found then
      raise exception 'Barcode % no longer has the prepared quantity available.', v_item.barcode;
    end if;

    insert into public.stock_out_records as saved (
      barcode,
      stock_no,
      item_description,
      unit_of_measure,
      stock_out_count,
      date,
      branch
    )
    values (
      v_item.barcode,
      v_item.stock_no,
      v_item.item_description,
      v_item.unit_of_measure,
      v_item.quantity,
      v_delivery_date,
      btrim(v_branch_name)
    )
    on conflict on constraint stock_out_records_pkey do update
    set stock_no = excluded.stock_no,
        item_description = excluded.item_description,
        unit_of_measure = excluded.unit_of_measure,
        stock_out_count = saved.stock_out_count + excluded.stock_out_count;
  end loop;

  update public.branch_stock_requests as request
  set status = 'delivered',
      quantity_delivered = request.quantity_requested,
      delivered_at = now(),
      delivered_by_tafi_admin_id = v_tafi_admin_id
  where request.preparation_id = p_preparation_id
    and request.status = 'preparing';

  update public.tafi_stock_request_preparations
  set status = 'delivered',
      updated_at = now(),
      delivered_at = now()
  where id = p_preparation_id;

  return v_request_count;
end;
$$;

drop function public.tafi_admin_list_stock_out_records(uuid, date, date);
create function public.tafi_admin_list_stock_out_records(
  p_session_token uuid,
  p_month date default null,
  p_date date default null
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  branch text,
  stock_out_count bigint,
  price numeric,
  total_price numeric,
  date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  return query
  select saved.barcode,
         saved.stock_no,
         saved.item_description,
         saved.unit_of_measure,
         saved.branch,
         saved.stock_out_count,
         saved.price,
         saved.total_price,
         saved.date
  from public.stock_out_records as saved
  where (p_date is not null and saved.date = p_date)
    or (
      p_date is null
      and (
        p_month is null
        or (
          saved.date >= date_trunc('month', p_month::timestamp)::date
          and saved.date < (
            date_trunc('month', p_month::timestamp) + interval '1 month'
          )::date
        )
      )
    )
  order by saved.date desc, saved.stock_no, saved.barcode, saved.branch;
end;
$$;

drop function public.accountant_list_tafi_stock_out_records(uuid, date, date);
create function public.accountant_list_tafi_stock_out_records(
  p_session_token uuid,
  p_month date default null,
  p_date date default null
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  branch text,
  stock_out_count bigint,
  price numeric,
  total_price numeric,
  date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select saved.barcode,
         saved.stock_no,
         saved.item_description,
         saved.unit_of_measure,
         saved.branch,
         saved.stock_out_count,
         saved.price,
         saved.total_price,
         saved.date
  from public.stock_out_records as saved
  where (p_date is not null and saved.date = p_date)
    or (
      p_date is null
      and (
        p_month is null
        or (
          saved.date >= date_trunc('month', p_month::timestamp)::date
          and saved.date < (
            date_trunc('month', p_month::timestamp) + interval '1 month'
          )::date
        )
      )
    )
  order by saved.date desc, saved.stock_no, saved.barcode, saved.branch;
end;
$$;

revoke all on function public.tafi_admin_complete_stock_request_preparation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_complete_stock_request_preparation(uuid, uuid)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
