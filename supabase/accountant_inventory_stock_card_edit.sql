-- Run after accountant_inventory_stock_card.sql and tafi_stock_records_total_price.sql.
begin;

do $$
begin
  if to_regclass('public.accountant_inventory_stock_card') is null
    or to_regclass('public.stock_in_records') is null
    or to_regclass('public.stock_out_records') is null then
    raise exception 'Install Accountant stock card and TAFI stock-in/out tables before this migration.';
  end if;
end;
$$;

alter table public.stock_in_records
  add column if not exists reference text,
  add column if not exists description text;

alter table public.stock_out_records
  add column if not exists reference text,
  add column if not exists description text;

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
  date date,
  reference text,
  description text
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
         saved.date,
         saved.reference,
         saved.description
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
  date date,
  reference text,
  description text
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
         saved.date,
         saved.reference,
         saved.description
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

create or replace function public.accountant_update_inventory_stock_card_metadata(
  p_session_token uuid,
  p_stock_card_record_ids uuid[],
  p_stock_in_barcodes text[],
  p_stock_in_dates date[],
  p_stock_out_barcodes text[],
  p_stock_out_dates date[],
  p_reference text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_stock_card_count integer;
  v_updated_stock_card_count integer;
  v_requested_stock_in_count integer;
  v_updated_stock_in_count integer;
  v_requested_stock_out_count integer;
  v_updated_stock_out_count integer;
begin
  if not exists (
    select 1
    from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  if coalesce(cardinality(p_stock_in_barcodes), 0)
    <> coalesce(cardinality(p_stock_in_dates), 0) then
    raise exception 'Inventory record keys are invalid';
  end if;

  if coalesce(cardinality(p_stock_out_barcodes), 0)
    <> coalesce(cardinality(p_stock_out_dates), 0) then
    raise exception 'Inventory record keys are invalid';
  end if;

  select count(distinct requested.id)
  into v_requested_stock_card_count
  from unnest(coalesce(p_stock_card_record_ids, array[]::uuid[])) as requested(id)
  where requested.id is not null;

  if v_requested_stock_card_count
    <> coalesce(cardinality(p_stock_card_record_ids), 0) then
    raise exception 'Stock card record IDs are invalid or duplicated';
  end if;

  select count(*)
  into v_requested_stock_in_count
  from (
    select distinct requested.barcode, requested.stock_date
    from unnest(
      coalesce(p_stock_in_barcodes, array[]::text[]),
      coalesce(p_stock_in_dates, array[]::date[])
    ) as requested(barcode, stock_date)
    where requested.barcode is not null
      and requested.stock_date is not null
  ) as requested;

  if v_requested_stock_in_count
    <> coalesce(cardinality(p_stock_in_barcodes), 0) then
    raise exception 'Stock-in record keys are invalid or duplicated';
  end if;

  select count(*)
  into v_requested_stock_out_count
  from (
    select distinct requested.barcode, requested.stock_date
    from unnest(
      coalesce(p_stock_out_barcodes, array[]::text[]),
      coalesce(p_stock_out_dates, array[]::date[])
    ) as requested(barcode, stock_date)
    where requested.barcode is not null
      and requested.stock_date is not null
  ) as requested;

  if v_requested_stock_out_count
    <> coalesce(cardinality(p_stock_out_barcodes), 0) then
    raise exception 'Stock-out record keys are invalid or duplicated';
  end if;

  if v_requested_stock_card_count = 0
    and v_requested_stock_in_count = 0
    and v_requested_stock_out_count = 0 then
    raise exception 'No stock card records were selected';
  end if;

  if v_requested_stock_card_count > 0 then
    update public.accountant_inventory_stock_card as record
    set reference = nullif(btrim(p_reference), ''),
        description = nullif(btrim(p_description), '')
    where record.id = any(coalesce(p_stock_card_record_ids, array[]::uuid[]));

    get diagnostics v_updated_stock_card_count = row_count;
    if v_updated_stock_card_count <> v_requested_stock_card_count then
      raise exception 'One or more stock card records could not be updated';
    end if;
  end if;

  if v_requested_stock_in_count > 0 then
    update public.stock_in_records as record
    set reference = nullif(btrim(p_reference), ''),
        description = nullif(btrim(p_description), '')
    where exists (
      select 1
      from unnest(
        coalesce(p_stock_in_barcodes, array[]::text[]),
        coalesce(p_stock_in_dates, array[]::date[])
      ) as requested(barcode, stock_date)
      where requested.barcode = record.barcode
        and requested.stock_date = record.date
    );

    get diagnostics v_updated_stock_in_count = row_count;
    if v_updated_stock_in_count <> v_requested_stock_in_count then
      raise exception 'One or more stock-in records could not be updated';
    end if;
  end if;

  if v_requested_stock_out_count > 0 then
    update public.stock_out_records as record
    set reference = nullif(btrim(p_reference), ''),
        description = nullif(btrim(p_description), '')
    where exists (
      select 1
      from unnest(
        coalesce(p_stock_out_barcodes, array[]::text[]),
        coalesce(p_stock_out_dates, array[]::date[])
      ) as requested(barcode, stock_date)
      where requested.barcode = record.barcode
        and requested.stock_date = record.date
    );

    get diagnostics v_updated_stock_out_count = row_count;
    if v_updated_stock_out_count <> v_requested_stock_out_count then
      raise exception 'One or more stock-out records could not be updated';
    end if;
  end if;
end;
$$;

revoke all on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_in_records(uuid, date, date)
  to anon, authenticated;
revoke all on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_out_records(uuid, date, date)
  to anon, authenticated;

revoke all on function public.accountant_update_inventory_stock_card_metadata(
  uuid, uuid[], text[], date[], text[], date[], text, text
) from public, anon, authenticated;
grant execute on function public.accountant_update_inventory_stock_card_metadata(
  uuid, uuid[], text[], date[], text[], date[], text, text
) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
