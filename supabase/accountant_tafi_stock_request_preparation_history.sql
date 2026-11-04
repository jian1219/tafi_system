-- Run after accountant_management.sql and tafi_stock_request_preparation.sql.
begin;

do $$
begin
  if to_regclass('public.accountant_session') is null
    or to_regclass('public.tafi_stock_request_preparations') is null
    or to_regclass('public.tafi_stock_request_preparation_items') is null
    or to_regclass('public.branch') is null then
    raise exception 'Install the Accountant and TAFI stock request preparation migrations first.';
  end if;
end;
$$;

create or replace function public.accountant_list_tafi_stock_request_preparation_history(
  p_session_token uuid
)
returns table (
  preparation_id uuid,
  branch_name text,
  request_date date,
  status text,
  stock_no text,
  category text,
  item_description text,
  unit_of_measure text,
  quantity bigint,
  unit_price numeric,
  barcode text,
  delivered_at timestamptz
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
  select preparation.id,
         branch.name,
         preparation.request_date,
         preparation.status,
         item.stock_no,
         item.category,
         item.item_description,
         item.unit_of_measure,
         item.quantity,
         item.unit_price,
         item.barcode,
         preparation.delivered_at
  from public.tafi_stock_request_preparations as preparation
  join public.branch as branch
    on branch.id = preparation.branch_id
  join public.tafi_stock_request_preparation_items as item
    on item.preparation_id = preparation.id
  where preparation.status = 'delivered'
  order by preparation.created_at desc, item.stock_no, item.barcode;
end;
$$;

revoke all on function public.accountant_list_tafi_stock_request_preparation_history(uuid) from public;
grant execute on function public.accountant_list_tafi_stock_request_preparation_history(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
