-- Run after tafi_summary_stock_record_ending_inventory.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_summary_stock_record') is null
    or to_regprocedure('public.tafi_admin_list_summary_stock_records(uuid, date)') is null then
    raise exception 'Install TAFI Summary Stock Record migrations first.';
  end if;
end;
$$;

drop function public.tafi_admin_list_summary_stock_records(uuid, date);

alter table public.tafi_summary_stock_record
  add column if not exists beginning_inventory_quantity numeric not null default 0;
alter table public.tafi_summary_stock_record
  add column if not exists beginning_inventory_total numeric default 0;

alter table public.tafi_summary_stock_record
  drop column if exists ending_inventory_quantity;
alter table public.tafi_summary_stock_record
  drop column if exists ending_inventory_total;

alter table public.tafi_summary_stock_record
  add column ending_inventory_quantity numeric not null default 0;
alter table public.tafi_summary_stock_record
  add column ending_inventory_total numeric;

do $$
declare
  v_stock_number text;
  v_row record;
  v_beginning_quantity numeric;
  v_beginning_total numeric;
  v_ending_total numeric;
begin
  for v_stock_number in
    select distinct summary.stock_no
    from public.tafi_summary_stock_record as summary
    order by summary.stock_no
  loop
    v_beginning_quantity := 0;
    v_beginning_total := 0;

    for v_row in
      select summary.summary_month,
             summary.stock_in_quantity,
             summary.stock_in_total,
             summary.stock_out_quantity,
             summary.stock_out_total
      from public.tafi_summary_stock_record as summary
      where summary.stock_no = v_stock_number
      order by summary.summary_month
    loop
      if v_beginning_total is null
        or v_row.stock_in_total is null
        or v_row.stock_out_total is null then
        v_ending_total := null;
      else
        v_ending_total := v_beginning_total
          + v_row.stock_in_total
          - v_row.stock_out_total;
      end if;

      update public.tafi_summary_stock_record as summary
      set beginning_inventory_quantity = v_beginning_quantity,
          beginning_inventory_total = v_beginning_total,
          ending_inventory_quantity = v_beginning_quantity
            + v_row.stock_in_quantity
            - v_row.stock_out_quantity,
          ending_inventory_total = v_ending_total
      where summary.stock_no = v_stock_number
        and summary.summary_month = v_row.summary_month;

      v_beginning_quantity := v_beginning_quantity
        + v_row.stock_in_quantity
        - v_row.stock_out_quantity;
      v_beginning_total := v_ending_total;
    end loop;
  end loop;
end;
$$;

create or replace function public.tafi_rebuild_summary_stock_record_row(
  p_stock_no text,
  p_summary_month date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_summary_month::timestamp)::date;
  v_item_description text;
  v_unit_of_measure text;
  v_stock_in_rows bigint;
  v_stock_in_quantity numeric;
  v_stock_in_total numeric;
  v_stock_out_rows bigint;
  v_stock_out_quantity numeric;
  v_stock_out_total numeric;
  v_beginning_quantity numeric := 0;
  v_beginning_total numeric := 0;
  v_ending_total numeric;
begin
  if p_stock_no is null or p_summary_month is null then
    raise exception 'A stock number and summary month are required.';
  end if;

  select count(*),
         coalesce(sum(stock_record.stock_in_count), 0),
         case
           when count(*) filter (where stock_record.total_price is null) > 0 then null
           else coalesce(sum(stock_record.total_price), 0)
         end
  into v_stock_in_rows, v_stock_in_quantity, v_stock_in_total
  from public.stock_in_records as stock_record
  where stock_record.stock_no = p_stock_no
    and stock_record.date >= v_month
    and stock_record.date < (v_month + interval '1 month')::date;

  select count(*),
         coalesce(sum(stock_record.stock_out_count), 0),
         case
           when count(*) filter (where stock_record.total_price is null) > 0 then null
           else coalesce(sum(stock_record.total_price), 0)
         end
  into v_stock_out_rows, v_stock_out_quantity, v_stock_out_total
  from public.stock_out_records as stock_record
  where stock_record.stock_no = p_stock_no
    and stock_record.date >= v_month
    and stock_record.date < (v_month + interval '1 month')::date;

  if v_stock_in_rows = 0 and v_stock_out_rows = 0 then
    delete from public.tafi_summary_stock_record as summary
    where summary.summary_month = v_month
      and summary.stock_no = p_stock_no;
    return;
  end if;

  select max(records.item_description), max(records.unit_of_measure)
  into v_item_description, v_unit_of_measure
  from (
    select stock_record.item_description, stock_record.unit_of_measure
    from public.stock_in_records as stock_record
    where stock_record.stock_no = p_stock_no
      and stock_record.date >= v_month
      and stock_record.date < (v_month + interval '1 month')::date
    union all
    select stock_record.item_description, stock_record.unit_of_measure
    from public.stock_out_records as stock_record
    where stock_record.stock_no = p_stock_no
      and stock_record.date >= v_month
      and stock_record.date < (v_month + interval '1 month')::date
  ) as records;

  select summary.ending_inventory_quantity,
         summary.ending_inventory_total
  into v_beginning_quantity, v_beginning_total
  from public.tafi_summary_stock_record as summary
  where summary.stock_no = p_stock_no
    and summary.summary_month < v_month
  order by summary.summary_month desc
  limit 1;

  if not found then
    v_beginning_quantity := 0;
    v_beginning_total := 0;
  end if;

  if v_beginning_total is null
    or v_stock_in_total is null
    or v_stock_out_total is null then
    v_ending_total := null;
  else
    v_ending_total := v_beginning_total + v_stock_in_total - v_stock_out_total;
  end if;

  insert into public.tafi_summary_stock_record as summary (
    summary_month,
    stock_no,
    item_description,
    unit_of_measure,
    beginning_inventory_quantity,
    beginning_inventory_total,
    stock_in_quantity,
    stock_in_total,
    stock_out_quantity,
    stock_out_total,
    ending_inventory_quantity,
    ending_inventory_total
  )
  values (
    v_month,
    p_stock_no,
    v_item_description,
    v_unit_of_measure,
    v_beginning_quantity,
    v_beginning_total,
    v_stock_in_quantity,
    v_stock_in_total,
    v_stock_out_quantity,
    v_stock_out_total,
    v_beginning_quantity + v_stock_in_quantity - v_stock_out_quantity,
    v_ending_total
  )
  on conflict (summary_month, stock_no) do update
  set item_description = excluded.item_description,
      unit_of_measure = excluded.unit_of_measure,
      beginning_inventory_quantity = excluded.beginning_inventory_quantity,
      beginning_inventory_total = excluded.beginning_inventory_total,
      stock_in_quantity = excluded.stock_in_quantity,
      stock_in_total = excluded.stock_in_total,
      stock_out_quantity = excluded.stock_out_quantity,
      stock_out_total = excluded.stock_out_total,
      ending_inventory_quantity = excluded.ending_inventory_quantity,
      ending_inventory_total = excluded.ending_inventory_total;
end;
$$;

create or replace function public.tafi_refresh_summary_stock_record(
  p_stock_no text,
  p_summary_month date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_summary_month::timestamp)::date;
  v_future_month date;
begin
  if p_stock_no is null or p_summary_month is null then
    raise exception 'A stock number and summary month are required.';
  end if;

  perform public.tafi_rebuild_summary_stock_record_row(p_stock_no, v_month);

  for v_future_month in
    select summary.summary_month
    from public.tafi_summary_stock_record as summary
    where summary.stock_no = p_stock_no
      and summary.summary_month > v_month
    order by summary.summary_month
  loop
    perform public.tafi_rebuild_summary_stock_record_row(p_stock_no, v_future_month);
  end loop;
end;
$$;

create function public.tafi_admin_list_summary_stock_records(
  p_session_token uuid,
  p_month date
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
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

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

revoke all on function public.tafi_rebuild_summary_stock_record_row(text, date)
  from public, anon, authenticated;
revoke all on function public.tafi_refresh_summary_stock_record(text, date)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_summary_stock_records(uuid, date)
  from public, anon, authenticated;
grant execute on function public.tafi_admin_list_summary_stock_records(uuid, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
