-- Run after tafi_stock_records_total_price.sql.
begin;

do $$
begin
  if to_regclass('public.stock_in_records') is null
    or to_regclass('public.stock_out_records') is null
    or to_regprocedure('public.tafi_admin_list_inventory_information(uuid)') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('stock_in_records', 'stock_out_records')
        and column_name = 'total_price'
      having count(distinct table_name) = 2
    ) then
    raise exception 'Install TAFI Admin stock-record total-price migrations first.';
  end if;
end;
$$;

create table if not exists public.tafi_summary_stock_record (
  summary_month date not null check (extract(day from summary_month) = 1),
  stock_no text not null,
  item_description text not null,
  unit_of_measure text not null,
  stock_in_quantity numeric not null default 0 check (stock_in_quantity >= 0),
  stock_in_total numeric,
  stock_out_quantity numeric not null default 0 check (stock_out_quantity >= 0),
  stock_out_total numeric,
  ending_inventory_quantity numeric
    generated always as (stock_in_quantity - stock_out_quantity) stored,
  ending_inventory_total numeric
    generated always as (stock_in_total - stock_out_total) stored,
  primary key (summary_month, stock_no)
);

create index if not exists stock_in_records_summary_stock_date_idx
  on public.stock_in_records (stock_no, date);
create index if not exists stock_out_records_summary_stock_date_idx
  on public.stock_out_records (stock_no, date);

alter table public.tafi_summary_stock_record enable row level security;
revoke all on table public.tafi_summary_stock_record from public, anon, authenticated;

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
  v_item_description text;
  v_unit_of_measure text;
  v_stock_in_rows bigint;
  v_stock_in_quantity numeric;
  v_stock_in_total numeric;
  v_stock_out_rows bigint;
  v_stock_out_quantity numeric;
  v_stock_out_total numeric;
begin
  if p_stock_no is null or p_summary_month is null then
    raise exception 'A stock number and summary month are required.';
  end if;

  select count(*),
         coalesce(sum(record.stock_in_count), 0),
         case
           when count(*) filter (where record.total_price is null) > 0 then null
           else coalesce(sum(record.total_price), 0)
         end
  into v_stock_in_rows, v_stock_in_quantity, v_stock_in_total
  from public.stock_in_records as record
  where record.stock_no = p_stock_no
    and record.date >= v_month
    and record.date < (v_month + interval '1 month')::date;

  select count(*),
         coalesce(sum(record.stock_out_count), 0),
         case
           when count(*) filter (where record.total_price is null) > 0 then null
           else coalesce(sum(record.total_price), 0)
         end
  into v_stock_out_rows, v_stock_out_quantity, v_stock_out_total
  from public.stock_out_records as record
  where record.stock_no = p_stock_no
    and record.date >= v_month
    and record.date < (v_month + interval '1 month')::date;

  select max(records.item_description), max(records.unit_of_measure)
  into v_item_description, v_unit_of_measure
  from (
    select record.item_description, record.unit_of_measure
    from public.stock_in_records as record
    where record.stock_no = p_stock_no
      and record.date >= v_month
      and record.date < (v_month + interval '1 month')::date
    union all
    select record.item_description, record.unit_of_measure
    from public.stock_out_records as record
    where record.stock_no = p_stock_no
      and record.date >= v_month
      and record.date < (v_month + interval '1 month')::date
  ) as records;

  if v_stock_in_rows = 0 and v_stock_out_rows = 0 then
    delete from public.tafi_summary_stock_record as summary
    where summary.summary_month = v_month
      and summary.stock_no = p_stock_no;
    return;
  end if;

  insert into public.tafi_summary_stock_record as summary (
    summary_month,
    stock_no,
    item_description,
    unit_of_measure,
    stock_in_quantity,
    stock_in_total,
    stock_out_quantity,
    stock_out_total
  )
  values (
    v_month,
    p_stock_no,
    v_item_description,
    v_unit_of_measure,
    v_stock_in_quantity,
    v_stock_in_total,
    v_stock_out_quantity,
    v_stock_out_total
  )
  on conflict (summary_month, stock_no) do update
  set item_description = excluded.item_description,
      unit_of_measure = excluded.unit_of_measure,
      stock_in_quantity = excluded.stock_in_quantity,
      stock_in_total = excluded.stock_in_total,
      stock_out_quantity = excluded.stock_out_quantity,
      stock_out_total = excluded.stock_out_total;
end;
$$;

create or replace function public.tafi_sync_summary_stock_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_month date;
  v_new_month date;
begin
  if tg_op = 'INSERT' then
    perform public.tafi_refresh_summary_stock_record(
      new.stock_no,
      date_trunc('month', new.date::timestamp)::date
    );
    return new;
  elsif tg_op = 'DELETE' then
    perform public.tafi_refresh_summary_stock_record(
      old.stock_no,
      date_trunc('month', old.date::timestamp)::date
    );
    return old;
  end if;

  v_old_month := date_trunc('month', old.date::timestamp)::date;
  v_new_month := date_trunc('month', new.date::timestamp)::date;
  perform public.tafi_refresh_summary_stock_record(old.stock_no, v_old_month);

  if old.stock_no is distinct from new.stock_no or v_old_month is distinct from v_new_month then
    perform public.tafi_refresh_summary_stock_record(new.stock_no, v_new_month);
  end if;

  return new;
end;
$$;

drop trigger if exists stock_in_records_sync_summary on public.stock_in_records;
create trigger stock_in_records_sync_summary
after insert or update or delete on public.stock_in_records
for each row
execute function public.tafi_sync_summary_stock_record();

drop trigger if exists stock_out_records_sync_summary on public.stock_out_records;
create trigger stock_out_records_sync_summary
after insert or update or delete on public.stock_out_records
for each row
execute function public.tafi_sync_summary_stock_record();

delete from public.tafi_summary_stock_record;

with stock_in_summary as (
  select record.summary_month,
         record.stock_no,
         max(record.item_description) as item_description,
         max(record.unit_of_measure) as unit_of_measure,
         sum(record.stock_in_count) as stock_in_quantity,
         case
           when count(*) filter (where record.total_price is null) > 0 then null
           else coalesce(sum(record.total_price), 0)
         end as stock_in_total
  from (
    select date_trunc('month', saved.date::timestamp)::date as summary_month,
           saved.stock_no,
           saved.item_description,
           saved.unit_of_measure,
           saved.stock_in_count,
           saved.total_price
    from public.stock_in_records as saved
  ) as record
  group by record.summary_month, record.stock_no
),
stock_out_summary as (
  select record.summary_month,
         record.stock_no,
         max(record.item_description) as item_description,
         max(record.unit_of_measure) as unit_of_measure,
         sum(record.stock_out_count) as stock_out_quantity,
         case
           when count(*) filter (where record.total_price is null) > 0 then null
           else coalesce(sum(record.total_price), 0)
         end as stock_out_total
  from (
    select date_trunc('month', saved.date::timestamp)::date as summary_month,
           saved.stock_no,
           saved.item_description,
           saved.unit_of_measure,
           saved.stock_out_count,
           saved.total_price
    from public.stock_out_records as saved
  ) as record
  group by record.summary_month, record.stock_no
)
insert into public.tafi_summary_stock_record (
  summary_month,
  stock_no,
  item_description,
  unit_of_measure,
  stock_in_quantity,
  stock_in_total,
  stock_out_quantity,
  stock_out_total
)
select coalesce(stock_in.summary_month, stock_out.summary_month),
       coalesce(stock_in.stock_no, stock_out.stock_no),
       coalesce(stock_in.item_description, stock_out.item_description),
       coalesce(stock_in.unit_of_measure, stock_out.unit_of_measure),
       coalesce(stock_in.stock_in_quantity, 0),
       case when stock_in.stock_no is null then 0 else stock_in.stock_in_total end,
       coalesce(stock_out.stock_out_quantity, 0),
       case when stock_out.stock_no is null then 0 else stock_out.stock_out_total end
from stock_in_summary as stock_in
full outer join stock_out_summary as stock_out
  on stock_out.summary_month = stock_in.summary_month
  and stock_out.stock_no = stock_in.stock_no;

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

revoke all on function public.tafi_refresh_summary_stock_record(text, date)
  from public, anon, authenticated;
revoke all on function public.tafi_sync_summary_stock_record()
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_summary_stock_records(uuid, date)
  from public, anon, authenticated;
grant execute on function public.tafi_admin_list_summary_stock_records(uuid, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
