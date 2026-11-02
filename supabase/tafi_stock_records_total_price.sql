-- Run after tafi_stock_records_price.sql and
-- tafi_admin_stock_in_scan_total_price_editable.sql.
begin;

do $$
begin
  if to_regclass('public.stock_in_records') is null
    or to_regclass('public.stock_out_records') is null
    or to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regprocedure('public.tafi_admin_update_stock_in_scan_total_price(uuid, text, numeric)') is null
    or to_regprocedure('public.tafi_admin_list_inventory_information(uuid)') is null
    or to_regprocedure('public.accountant_list_tafi_stock_in_records(uuid, date, date)') is null
    or to_regprocedure('public.accountant_list_tafi_stock_out_records(uuid, date, date)') is null then
    raise exception 'Install TAFI Admin barcode, stock record, and Accountant barcode migrations first.';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_in_records'
      and column_name = 'price'
      and numeric_precision is not null
  ) then
    alter table public.stock_in_records
      alter column price type numeric;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_out_records'
      and column_name = 'price'
      and numeric_precision is not null
  ) then
    alter table public.stock_out_records
      alter column price type numeric;
  end if;
end;
$$;

alter table public.stock_in_records
  add column if not exists total_price numeric
  generated always as (round(price * stock_in_count, 2)) stored;
alter table public.stock_out_records
  add column if not exists total_price numeric
  generated always as (round(price * stock_out_count, 2)) stored;

drop function if exists public.tafi_admin_list_stock_in_records(uuid, date, date);
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
         saved.stock_in_count,
         saved.price,
         saved.total_price,
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
  order by saved.date desc, saved.stock_no, saved.barcode;
end;
$$;

drop function if exists public.accountant_list_tafi_stock_in_records(uuid, date, date);
create function public.accountant_list_tafi_stock_in_records(
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
         saved.stock_in_count,
         saved.price,
         saved.total_price,
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

drop function if exists public.accountant_list_tafi_stock_out_records(uuid, date, date);
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
  order by saved.date desc, saved.stock_no, saved.barcode;
end;
$$;

create or replace function public.tafi_admin_update_stock_in_scan_total_price(
  p_session_token uuid,
  p_barcode text,
  p_total_price numeric
)
returns table (
  barcode text,
  total_price numeric,
  price numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_barcode text := nullif(btrim(p_barcode), '');
  v_barcode_result text;
  v_total_price_result numeric;
  v_price_result numeric;
begin
  if p_session_token is null then
    raise exception 'A valid TAFI Admin session is required.';
  end if;

  perform 1
  from public.tafi_admin_list_inventory_information(p_session_token);

  if v_barcode is null then
    raise exception 'A barcode is required.';
  end if;

  if p_total_price is not null and (
    p_total_price < 0
    or p_total_price > 99999999999999999999999999999.99
    or p_total_price <> round(p_total_price, 2)
  ) then
    raise exception 'Total price must be zero or greater and have no more than two decimal places.';
  end if;

  update public.tafi_admin_stock_in_scans as saved
  set total_price = p_total_price,
      updated_at = now()
  where saved.barcode = v_barcode
  returning saved.barcode, saved.total_price, saved.price
  into v_barcode_result, v_total_price_result, v_price_result;

  if not found then
    raise exception 'The barcode was not found in Barcode Inventory.';
  end if;

  update public.stock_in_records as saved
  set price = v_price_result
  where saved.barcode = v_barcode_result
    and saved.price is distinct from v_price_result;

  update public.stock_out_records as saved
  set price = v_price_result
  where saved.barcode = v_barcode_result
    and saved.price is distinct from v_price_result;

  return query
  select v_barcode_result, v_total_price_result, v_price_result;
end;
$$;

revoke all on function public.tafi_admin_list_stock_in_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_update_stock_in_scan_total_price(uuid, text, numeric)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_list_stock_in_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.tafi_admin_update_stock_in_scan_total_price(uuid, text, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
