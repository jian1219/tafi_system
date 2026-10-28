-- Run after tafi_admin_stock_in_scans.sql and the TAFI Admin inventory RPC.
begin;

do $$
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null then
    raise exception 'Run tafi_admin_stock_in_scans.sql before this migration.';
  end if;
  if to_regprocedure('public.tafi_admin_list_inventory_information(uuid)') is null then
    raise exception 'The session-validating inventory RPC is missing; install the TAFI Admin inventory migration first.';
  end if;
end;
$$;

create table if not exists public.stock_out_records (
  barcode text not null,
  stock_no text not null,
  item_description text not null,
  unit_of_measure text not null,
  stock_out_count bigint not null check (stock_out_count > 0),
  date date not null,
  primary key (barcode, date)
);

create index if not exists stock_out_records_date_idx
  on public.stock_out_records (date desc, stock_no, barcode);

alter table public.stock_out_records enable row level security;
revoke all on table public.stock_out_records from public, anon, authenticated;

-- Remove every previous overload so PostgREST can resolve the RPC unambiguously.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select proc.oid::regprocedure
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'tafi_admin_record_stock_out_scan'
      and proc.prokind = 'f'
  loop
    execute format('drop function %s', v_function);
  end loop;
end;
$$;

create function public.tafi_admin_record_stock_out_scan(
  p_session_token uuid,
  p_barcode text,
  p_quantity numeric default 1,
  p_date date default current_date
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  stock_out_count bigint,
  date date,
  remaining_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text := btrim(p_barcode);
  v_scan public.tafi_admin_stock_in_scans%rowtype;
  v_record public.stock_out_records%rowtype;
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  if v_barcode is null or v_barcode = '' then
    raise exception 'A barcode is required.';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) then
    raise exception 'Stock-out quantity must be a whole number greater than zero.';
  end if;
  if p_date is null then
    raise exception 'A stock-out date is required.';
  end if;

  select saved.*
  into v_scan
  from public.tafi_admin_stock_in_scans as saved
  where saved.barcode = v_barcode
  for update;

  if not found then
    raise exception 'This barcode is not in Barcode Inventory.';
  end if;
  if v_scan.scan_count < p_quantity then
    raise exception 'The stock-out quantity exceeds the remaining barcode count.';
  end if;

  update public.tafi_admin_stock_in_scans as saved
  set scan_count = saved.scan_count - p_quantity,
      updated_at = now()
  where saved.barcode = v_barcode
  returning saved.* into v_scan;

  insert into public.stock_out_records as saved (
    barcode,
    stock_no,
    item_description,
    unit_of_measure,
    stock_out_count,
    date
  )
  values (
    v_scan.barcode,
    v_scan.stock_no,
    v_scan.item_description,
    v_scan.unit_of_measure,
    p_quantity::bigint,
    p_date
  )
  on conflict on constraint stock_out_records_pkey do update
  set stock_no = excluded.stock_no,
      item_description = excluded.item_description,
      unit_of_measure = excluded.unit_of_measure,
      stock_out_count = saved.stock_out_count + excluded.stock_out_count
  returning saved.* into v_record;

  return query
  select v_record.barcode,
         v_record.stock_no,
         v_record.item_description,
         v_record.unit_of_measure,
         v_record.stock_out_count,
         v_record.date,
         v_scan.scan_count;
end;
$$;

drop function if exists public.tafi_admin_list_stock_out_records(uuid, date);
drop function if exists public.tafi_admin_list_stock_out_records(uuid, date, date);
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
  stock_out_count bigint,
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
         saved.stock_out_count,
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
  order by saved.date desc, saved.stock_no, saved.barcode;
end;
$$;

revoke all on function public.tafi_admin_record_stock_out_scan(uuid, text, numeric, date)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_record_stock_out_scan(uuid, text, numeric, date)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
