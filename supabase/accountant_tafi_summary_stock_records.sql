-- Run after the Accountant session and TAFI summary stock record migrations,
-- including tafi_summary_stock_record_beginning_inventory.sql.
begin;

do $$
begin
  if to_regclass('public.accountant_session') is null
    or to_regclass('public.tafi_summary_stock_record') is null then
    raise exception 'Install Accountant sessions and TAFI summary stock record migrations first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tafi_summary_stock_record'
      and column_name = 'beginning_inventory_quantity'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tafi_summary_stock_record'
      and column_name = 'ending_inventory_quantity'
  ) then
    raise exception 'Run tafi_summary_stock_record_beginning_inventory.sql first.';
  end if;
end;
$$;

create or replace function public.accountant_list_tafi_summary_stock_records(
  p_session_token uuid,
  p_month date default null
)
returns table (
  stock_no text,
  item_description text,
  unit_of_measure text,
  beginning_inventory_quantity numeric,
  beginning_inventory_total numeric,
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
declare
  v_month date := date_trunc('month', coalesce(p_month, current_date)::timestamp)::date;
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
  with current_summary as (
    select summary.*
    from public.tafi_summary_stock_record as summary
    where summary.summary_month = v_month
  ),
  prior_summary as (
    select distinct on (summary.stock_no)
           summary.stock_no,
           summary.item_description,
           summary.unit_of_measure,
           summary.ending_inventory_quantity,
           summary.ending_inventory_total
    from public.tafi_summary_stock_record as summary
    where summary.summary_month < v_month
    order by summary.stock_no, summary.summary_month desc
  )
  select coalesce(current_month.stock_no, prior_month.stock_no),
         coalesce(current_month.item_description, prior_month.item_description),
         coalesce(current_month.unit_of_measure, prior_month.unit_of_measure),
         case
           when prior_month.stock_no is null then 0
           else prior_month.ending_inventory_quantity
         end,
         case
           when prior_month.stock_no is null then 0
           else prior_month.ending_inventory_total
         end,
         case when current_month.stock_no is null then 0 else current_month.stock_in_quantity end,
         case when current_month.stock_no is null then 0 else current_month.stock_in_total end,
         case when current_month.stock_no is null then 0 else current_month.stock_out_quantity end,
         case when current_month.stock_no is null then 0 else current_month.stock_out_total end,
         case
           when current_month.stock_no is null then
             case
               when prior_month.stock_no is null then 0
               else prior_month.ending_inventory_quantity
             end
           else current_month.ending_inventory_quantity
         end,
         case
           when current_month.stock_no is null then
             case
               when prior_month.stock_no is null then 0
               else prior_month.ending_inventory_total
             end
           else current_month.ending_inventory_total
         end
  from current_summary as current_month
  full outer join prior_summary as prior_month
    on prior_month.stock_no = current_month.stock_no
  order by coalesce(current_month.stock_no, prior_month.stock_no);
end;
$$;

revoke all on function public.accountant_list_tafi_summary_stock_records(uuid, date)
  from public, anon, authenticated;
grant execute on function public.accountant_list_tafi_summary_stock_records(uuid, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
