-- Run after tafi_summary_stock_record.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_summary_stock_record') is null
    or to_regprocedure('public.tafi_admin_list_summary_stock_records(uuid, date)') is null then
    raise exception 'Install tafi_summary_stock_record.sql first.';
  end if;
end;
$$;

alter table public.tafi_summary_stock_record
  add column if not exists ending_inventory_quantity numeric
  generated always as (stock_in_quantity - stock_out_quantity) stored;

alter table public.tafi_summary_stock_record
  add column if not exists ending_inventory_total numeric
  generated always as (stock_in_total - stock_out_total) stored;

drop function public.tafi_admin_list_summary_stock_records(uuid, date);
create function public.tafi_admin_list_summary_stock_records(
  p_session_token uuid,
  p_month date
)
returns table (
  stock_no text,
  item_description text,
  unit_of_measure text,
  stock_in_quantity numeric,
  stock_in_total numeric,
  stock_out_quantity numeric,
  stock_out_total numeric,
  ending_inventory_quantity numeric,
  ending_inventory_total numeric
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
  select summary.stock_no,
         summary.item_description,
         summary.unit_of_measure,
         summary.stock_in_quantity,
         summary.stock_in_total,
         summary.stock_out_quantity,
         summary.stock_out_total,
         summary.ending_inventory_quantity,
         summary.ending_inventory_total
  from public.tafi_summary_stock_record as summary
  where p_month is null
     or summary.summary_month = date_trunc('month', p_month::timestamp)::date
  order by summary.stock_no;
end;
$$;

revoke all on function public.tafi_admin_list_summary_stock_records(uuid, date)
  from public, anon, authenticated;
grant execute on function public.tafi_admin_list_summary_stock_records(uuid, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
