-- Run after tafi_admin_stock_in_scans.sql, tafi_admin_stock_in_scan_price.sql,
-- tafi_admin_stock_in_records.sql, tafi_admin_stock_out_records.sql,
-- and the Accountant session migration.
begin;

do $$
begin
  if to_regclass('public.accountant_session') is null
    or to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.stock_in_records') is null
    or to_regclass('public.stock_out_records') is null then
    raise exception 'Install Accountant sessions, TAFI barcode inventory, and stock record migrations first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tafi_admin_stock_in_scans'
      and column_name = 'price'
  ) then
    raise exception 'Run tafi_admin_stock_in_scan_price.sql before this migration.';
  end if;
end;
$$;

create or replace function public.accountant_list_tafi_barcode_inventory(
  p_session_token uuid
)
returns table (
  barcode text,
  stock_no text,
  item_description text,
  unit_of_measure text,
  price numeric,
  scan_count bigint,
  created_at timestamptz,
  updated_at timestamptz
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
         saved.price,
         saved.scan_count,
         saved.created_at,
         saved.updated_at
  from public.tafi_admin_stock_in_scans as saved
  order by saved.stock_no, saved.barcode;
end;
$$;

create or replace function public.accountant_list_tafi_stock_in_records(
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

create or replace function public.accountant_list_tafi_stock_out_records(
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

revoke all on function public.accountant_list_tafi_barcode_inventory(uuid)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.accountant_list_tafi_barcode_inventory(uuid)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
