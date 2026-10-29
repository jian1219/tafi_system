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

create table if not exists public.stock_in_records (
  barcode text not null,
  stock_no text not null,
  item_description text not null,
  unit_of_measure text not null,
  stock_in_count bigint not null check (stock_in_count > 0),
  date date not null,
  primary key (barcode, date)
);

create index if not exists stock_in_records_date_idx
  on public.stock_in_records (date desc, stock_no, barcode);

alter table public.stock_in_records enable row level security;
revoke all on table public.stock_in_records from public, anon, authenticated;

do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as ns
      on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname = 'tafi_admin_record_stock_in_scan'
      and p.prokind = 'f'
  loop
    execute format('drop function %s', v_function);
  end loop;
end;
$$;

create function public.tafi_admin_record_stock_in_scan(
  p_session_token uuid,
  p_barcode text,
  p_stock_no text default null,
  p_date date default current_date
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  scan_count bigint,
  needs_stock_selection boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text := btrim(p_barcode);
  v_stock_no text := nullif(btrim(p_stock_no), '');
  v_item_description text;
  v_unit_of_measure text;
  v_item_matches integer;
  v_scan public.tafi_admin_stock_in_scans%rowtype;
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  if v_barcode is null or v_barcode = '' then
    raise exception 'A barcode is required.';
  end if;
  if p_date is null then
    raise exception 'A stock-in date is required.';
  end if;

  if v_stock_no is null then
    update public.tafi_admin_stock_in_scans as saved
    set scan_count = saved.scan_count + 1,
        updated_at = now()
    where saved.barcode = v_barcode
    returning saved.* into v_scan;

    if found then
      insert into public.stock_in_records as saved (
        barcode,
        stock_no,
        item_description,
        unit_of_measure,
        stock_in_count,
        date
      )
      values (
        v_scan.barcode,
        v_scan.stock_no,
        v_scan.item_description,
        v_scan.unit_of_measure,
        1,
        p_date
      )
      on conflict on constraint stock_in_records_pkey do update
      set stock_no = excluded.stock_no,
          item_description = excluded.item_description,
          unit_of_measure = excluded.unit_of_measure,
          stock_in_count = saved.stock_in_count + excluded.stock_in_count;

      return query
      select v_scan.barcode, v_scan.stock_no, v_scan.item_description,
             v_scan.unit_of_measure, v_scan.scan_count, false;
    else
      return query
      select v_barcode, null::text, null::text, null::text, 0::bigint, true;
    end if;
    return;
  end if;

  select count(*)::integer
  into v_item_matches
  from public.inventory_information as inventory
  where inventory.stock_no = v_stock_no;

  if v_item_matches = 0 then
    raise exception 'The selected stock number does not exist.';
  elsif v_item_matches > 1 then
    raise exception 'The selected stock number is not unique.';
  end if;

  select inventory.item_description, inventory.unit_of_measure
  into v_item_description, v_unit_of_measure
  from public.inventory_information as inventory
  where inventory.stock_no = v_stock_no;

  insert into public.tafi_admin_stock_in_scans as saved (
    barcode,
    stock_no,
    item_description,
    unit_of_measure,
    scan_count
  )
  values (
    v_barcode,
    v_stock_no,
    v_item_description,
    v_unit_of_measure,
    1
  )
  on conflict on constraint tafi_admin_stock_in_scans_pkey do update
  set scan_count = saved.scan_count + 1,
      updated_at = now()
  where saved.stock_no = excluded.stock_no
    and saved.item_description = excluded.item_description
    and saved.unit_of_measure = excluded.unit_of_measure
  returning saved.* into v_scan;

  if not found then
    raise exception 'This barcode is already linked to a different item.';
  end if;

  insert into public.stock_in_records as saved (
    barcode,
    stock_no,
    item_description,
    unit_of_measure,
    stock_in_count,
    date
  )
  values (
    v_scan.barcode,
    v_scan.stock_no,
    v_scan.item_description,
    v_scan.unit_of_measure,
    1,
    p_date
  )
  on conflict on constraint stock_in_records_pkey do update
  set stock_no = excluded.stock_no,
      item_description = excluded.item_description,
      unit_of_measure = excluded.unit_of_measure,
      stock_in_count = saved.stock_in_count + excluded.stock_in_count;

  return query
  select v_scan.barcode, v_scan.stock_no, v_scan.item_description,
         v_scan.unit_of_measure, v_scan.scan_count, false;
end;
$$;

do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as ns
      on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname = 'tafi_admin_list_stock_in_records'
      and p.prokind = 'f'
  loop
    execute format('drop function %s', v_function);
  end loop;
end;
$$;

create function public.tafi_admin_list_stock_in_records(
  p_session_token uuid,
  p_month date default null,
  p_date date default null
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  stock_in_count bigint,
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
         saved.stock_in_count,
         saved.date
  from public.stock_in_records as saved
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

revoke all on function public.tafi_admin_record_stock_in_scan(uuid, text, text, date)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_stock_in_records(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_record_stock_in_scan(uuid, text, text, date)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_in_records(uuid, date, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
