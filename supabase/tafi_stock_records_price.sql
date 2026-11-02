-- Run after tafi_admin_stock_in_scan_price.sql,
-- tafi_admin_stock_in_records.sql, tafi_admin_stock_out_records.sql,
-- and accountant_tafi_barcode_records.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_admin_stock_in_scans') is null
    or to_regclass('public.stock_in_records') is null
    or to_regclass('public.stock_out_records') is null
    or to_regclass('public.accountant_session') is null then
    raise exception 'Install barcode inventory, stock record, and Accountant session migrations first.';
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

alter table public.stock_in_records
  add column if not exists price numeric(12, 2);
alter table public.stock_out_records
  add column if not exists price numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.stock_in_records'::regclass
      and conname = 'stock_in_records_price_nonnegative'
  ) then
    alter table public.stock_in_records
      add constraint stock_in_records_price_nonnegative
      check (price is null or price >= 0);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out_records'::regclass
      and conname = 'stock_out_records_price_nonnegative'
  ) then
    alter table public.stock_out_records
      add constraint stock_out_records_price_nonnegative
      check (price is null or price >= 0);
  end if;
end;
$$;

create or replace function public.tafi_set_stock_record_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select scan.price
  into new.price
  from public.tafi_admin_stock_in_scans as scan
  where scan.barcode = new.barcode;

  return new;
end;
$$;

drop trigger if exists stock_in_records_set_price on public.stock_in_records;
create trigger stock_in_records_set_price
before insert or update on public.stock_in_records
for each row
execute function public.tafi_set_stock_record_price();

drop trigger if exists stock_out_records_set_price on public.stock_out_records;
create trigger stock_out_records_set_price
before insert or update on public.stock_out_records
for each row
execute function public.tafi_set_stock_record_price();

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

revoke all on function public.tafi_set_stock_record_price()
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_stock_in_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_list_stock_in_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_stock_out_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
