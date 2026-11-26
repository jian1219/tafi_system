-- Run after branch_inventory.sql.
begin;

create table if not exists public.branch_inventory_ref (
  branch_id uuid not null references public.branch(id) on delete cascade,
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  barcode text,
  available numeric(14, 3) not null default 0 check (available >= 0),
  primary key (branch_id, stock_inventory_id)
);

alter table public.branch_inventory_ref
  add column if not exists barcode text;

alter table public.branch_inventory_ref enable row level security;
revoke all on table public.branch_inventory_ref from public, anon, authenticated;

create table if not exists public.branch_inventory_ref_history (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  stock_no text not null,
  description text not null,
  unit_of_measure text not null,
  stock_out_qty numeric(14, 3) not null check (stock_out_qty > 0),
  stock_out_at timestamptz not null default now()
);

create index if not exists branch_inventory_ref_history_branch_time_idx
  on public.branch_inventory_ref_history (branch_id, stock_out_at desc);

alter table public.branch_inventory_ref_history enable row level security;
revoke all on table public.branch_inventory_ref_history from public, anon, authenticated;

create table if not exists public.branch_inventory_ref_stock_in_history (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  stock_no text not null,
  description text not null,
  unit_of_measure text not null,
  stock_in_qty numeric(14, 3) not null check (stock_in_qty > 0),
  stock_in_at timestamptz not null default now()
);

create index if not exists branch_inventory_ref_stock_in_history_branch_time_idx
  on public.branch_inventory_ref_stock_in_history (branch_id, stock_in_at desc);

alter table public.branch_inventory_ref_stock_in_history enable row level security;
revoke all on table public.branch_inventory_ref_stock_in_history from public, anon, authenticated;

drop function if exists public.branch_admin_list_inventory_ref(uuid);

create or replace function public.branch_admin_list_inventory_ref(
  p_session_token uuid
)
returns table (
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  barcode text,
  available numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select branch_stock.stock_inventory_id,
    stock.stock_no,
    stock.item_description,
    stock.unit_of_measure,
    inventory.category,
    branch_stock.barcode,
    branch_stock.available
  from public.branch_inventory_ref as branch_stock
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where branch_stock.branch_id = v_branch_id
  order by inventory.category, stock.stock_no;
end;
$$;

drop function if exists public.branch_admin_list_inventory_ref_history(uuid, integer, integer, date);
drop function if exists public.branch_admin_list_inventory_ref_history(uuid, integer, integer);

create or replace function public.branch_admin_list_inventory_ref_history(
  p_session_token uuid,
  p_limit integer,
  p_offset integer,
  p_day date default null
)
returns table (
  history_id uuid,
  stock_no text,
  description text,
  unit_of_measure text,
  stock_out_qty numeric,
  stock_out_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'History page size must be between 1 and 100';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'History offset must be zero or greater';
  end if;

  return query
  select history.id,
         history.stock_no,
         history.description,
         history.unit_of_measure,
         history.stock_out_qty,
         history.stock_out_at
  from public.branch_inventory_ref_history as history
  where history.branch_id = v_branch_id
    and (
      p_day is null
      or (
        history.stock_out_at >= (p_day::timestamp at time zone 'Asia/Manila')
        and history.stock_out_at < ((p_day + 1)::timestamp at time zone 'Asia/Manila')
      )
    )
  order by history.stock_out_at desc, history.id desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.branch_admin_list_inventory_ref_stock_out_totals(
  p_session_token uuid,
  p_day date
)
returns table (
  stock_no text,
  description text,
  unit_of_measure text,
  total_stock_out numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_day is null then
    raise exception 'Select a day to view Stock Out totals';
  end if;

  return query
  select history.stock_no,
         history.description,
         history.unit_of_measure,
         sum(history.stock_out_qty)::numeric
  from public.branch_inventory_ref_history as history
  where history.branch_id = v_branch_id
    and history.stock_out_at >= (p_day::timestamp at time zone 'Asia/Manila')
    and history.stock_out_at < ((p_day + 1)::timestamp at time zone 'Asia/Manila')
  group by history.stock_no, history.description, history.unit_of_measure
  order by history.description, history.stock_no;
end;
$$;

create or replace function public.branch_admin_list_inventory_ref_stock_out_monthly_totals(
  p_session_token uuid,
  p_month date
)
returns table (
  stock_no text,
  description text,
  unit_of_measure text,
  total_stock_out numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Select a valid month';
  end if;

  return query
  select history.stock_no,
         history.description,
         history.unit_of_measure,
         sum(history.stock_out_qty)::numeric
  from public.branch_inventory_ref_history as history
  where history.branch_id = v_branch_id
    and history.stock_out_at >= (p_month::timestamp at time zone 'Asia/Manila')
    and history.stock_out_at < ((p_month + interval '1 month') at time zone 'Asia/Manila')
  group by history.stock_no, history.description, history.unit_of_measure
  order by history.description, history.stock_no;
end;
$$;

create or replace function public.branch_admin_list_inventory_ref_stock_in_history(
  p_session_token uuid,
  p_limit integer,
  p_offset integer
)
returns table (
  history_id uuid,
  stock_no text,
  description text,
  unit_of_measure text,
  stock_in_qty numeric,
  stock_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'History page size must be between 1 and 100';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'History offset must be zero or greater';
  end if;

  return query
  select history.id,
         history.stock_no,
         history.description,
         history.unit_of_measure,
         history.stock_in_qty,
         history.stock_in_at
  from public.branch_inventory_ref_stock_in_history as history
  where history.branch_id = v_branch_id
  order by history.stock_in_at desc, history.id desc
  limit p_limit
  offset p_offset;
end;
$$;

drop function if exists public.branch_admin_add_inventory_ref_item(uuid, uuid, numeric);

create or replace function public.branch_admin_add_inventory_ref_item(
  p_session_token uuid,
  p_stock_inventory_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_stock_inventory_id is null or not exists (
    select 1
    from public.tafi_stock_inventory as stock
    where stock.id = p_stock_inventory_id
  ) then
    raise exception 'A valid TAFI stock item is required';
  end if;

  if exists (
    select 1
    from public.branch_inventory_ref as branch_stock
    where branch_stock.branch_id = v_branch_id
      and branch_stock.stock_inventory_id = p_stock_inventory_id
  ) then
    raise exception 'Stock item is already in Ref Inventory';
  end if;

  insert into public.branch_inventory_ref (branch_id, stock_inventory_id)
  values (v_branch_id, p_stock_inventory_id);

  return true;
end;
$$;

create or replace function public.branch_admin_delete_inventory_ref_item(
  p_session_token uuid,
  p_stock_inventory_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_available numeric;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  select branch_stock.available
  into v_available
  from public.branch_inventory_ref as branch_stock
  where branch_stock.branch_id = v_branch_id
    and branch_stock.stock_inventory_id = p_stock_inventory_id
  for update;

  if not found then
    raise exception 'Stock item was not found in Ref Inventory';
  end if;
  if v_available <> 0 then
    raise exception 'Scan out all available Ref stock before deleting this item';
  end if;

  delete from public.branch_inventory_ref as branch_stock
  where branch_stock.branch_id = v_branch_id
    and branch_stock.stock_inventory_id = p_stock_inventory_id;

  return true;
end;
$$;

create or replace function public.branch_admin_update_inventory_ref_barcode(
  p_session_token uuid,
  p_stock_inventory_id uuid,
  p_barcode text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_barcode text := nullif(btrim(p_barcode), '');
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  if length(coalesce(v_barcode, '')) > 128 then
    raise exception 'Barcode cannot exceed 128 characters';
  end if;

  if v_barcode is not null then
    perform pg_advisory_xact_lock(hashtext(v_branch_id::text), hashtext(v_barcode));
    if exists (
      select 1
      from public.branch_inventory_ref as existing
      where existing.branch_id = v_branch_id
        and existing.barcode = v_barcode
        and existing.stock_inventory_id <> p_stock_inventory_id
    ) then
      raise exception 'This barcode is already assigned to another Ref Inventory item';
    end if;
  end if;

  update public.branch_inventory_ref
  set barcode = v_barcode
  where branch_id = v_branch_id
    and stock_inventory_id = p_stock_inventory_id;

  if not found then
    raise exception 'Stock item was not found in Ref Inventory';
  end if;

  return true;
end;
$$;

create or replace function public.branch_admin_scan_counter_inventory_out(
  p_session_token uuid,
  p_barcode text,
  p_quantity numeric
)
returns table (
  barcode text,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_out numeric,
  remaining_quantity numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_barcode text := nullif(btrim(p_barcode), '');
  v_stock_inventory_id uuid;
  v_stock_no text;
  v_item_description text;
  v_unit_of_measure text;
  v_available numeric;
  v_matching_barcodes integer;
  v_remaining_quantity numeric;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if v_barcode is null then
    raise exception 'Scan or enter a barcode';
  end if;
  if length(v_barcode) > 128 then
    raise exception 'Barcode cannot exceed 128 characters';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity)
    or p_quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a whole-number quantity greater than zero';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_branch_id::text), hashtext(v_barcode));

  select count(*)::integer
  into v_matching_barcodes
  from public.branch_inventory_ref as branch_stock
  where branch_stock.branch_id = v_branch_id
    and branch_stock.barcode = v_barcode;

  if v_matching_barcodes = 0 then
    raise exception 'This barcode is not assigned to an item in this branch''s Ref Inventory';
  end if;
  if v_matching_barcodes > 1 then
    raise exception 'This barcode is assigned to multiple items in this branch''s Ref Inventory';
  end if;

  select branch_stock.stock_inventory_id
  into v_stock_inventory_id
  from public.branch_inventory_ref as branch_stock
  where branch_stock.branch_id = v_branch_id
    and branch_stock.barcode = v_barcode
  for update;

  select branch_stock.available,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure
  into v_available,
       v_stock_no,
       v_item_description,
       v_unit_of_measure
  from public.branch_inventory_ref as branch_stock
  join public.tafi_stock_inventory as stock
    on stock.id = branch_stock.stock_inventory_id
  where branch_stock.branch_id = v_branch_id
    and branch_stock.stock_inventory_id = v_stock_inventory_id
  for update of branch_stock;

  if not found then
    raise exception 'The scanned item is not in this branch''s Ref Inventory';
  end if;
  if p_quantity > v_available then
    raise exception 'Stock-out quantity exceeds the Ref Inventory available quantity';
  end if;

  update public.branch_inventory_ref as ref_stock
  set available = ref_stock.available - p_quantity
  where ref_stock.branch_id = v_branch_id
    and ref_stock.stock_inventory_id = v_stock_inventory_id
  returning ref_stock.available into v_remaining_quantity;

  insert into public.branch_inventory_ref_history (
    branch_id,
    stock_no,
    description,
    unit_of_measure,
    stock_out_qty
  )
  values (
    v_branch_id,
    v_stock_no,
    v_item_description,
    v_unit_of_measure,
    p_quantity
  );

  return query
  select v_barcode,
         v_stock_inventory_id,
         v_stock_no,
         v_item_description,
         v_unit_of_measure,
         p_quantity,
         v_remaining_quantity;
end;
$$;

drop function if exists public.branch_admin_scan_counter_inventory_in(uuid, text, numeric);

create function public.branch_admin_scan_counter_inventory_in(
  p_session_token uuid,
  p_barcode text,
  p_quantity numeric
)
returns table (
  barcode text,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  quantity_in numeric,
  remaining_quantity numeric,
  main_remaining_quantity numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_barcode text := nullif(btrim(p_barcode), '');
  v_stock_inventory_id uuid;
  v_branch_inventory_id uuid;
  v_stock_no text;
  v_item_description text;
  v_unit_of_measure text;
  v_remaining_quantity numeric;
  v_main_remaining_quantity numeric;
  v_main_available numeric;
  v_usage_date date := timezone('Asia/Manila', now())::date;
  v_usage_today numeric := 0;
  v_matching_barcodes integer;
begin
  select branch_admin.branch_id
  into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if v_barcode is null then
    raise exception 'Scan or enter a barcode';
  end if;
  if length(v_barcode) > 128 then
    raise exception 'Barcode cannot exceed 128 characters';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity)
    or p_quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a whole-number quantity greater than zero';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_branch_id::text), hashtext(v_barcode));

  select count(*)::integer
  into v_matching_barcodes
  from public.branch_inventory_ref as branch_stock
  where branch_stock.branch_id = v_branch_id
    and branch_stock.barcode = v_barcode;

  if v_matching_barcodes = 0 then
    raise exception 'This barcode is not assigned to an item in this branch''s Ref Inventory';
  end if;
  if v_matching_barcodes > 1 then
    raise exception 'This barcode is assigned to multiple items in this branch''s Ref Inventory';
  end if;

  select branch_stock.stock_inventory_id
  into v_stock_inventory_id
  from public.branch_inventory_ref as branch_stock
  where branch_stock.branch_id = v_branch_id
    and branch_stock.barcode = v_barcode
  for update;

  select stock.stock_no, stock.item_description, stock.unit_of_measure
  into v_stock_no, v_item_description, v_unit_of_measure
  from public.tafi_stock_inventory as stock
  where stock.id = v_stock_inventory_id;

  if not found then
    raise exception 'The scanned item could not be found';
  end if;

  select inventory_stock.id, inventory_stock.available
  into v_branch_inventory_id, v_main_available
  from public.branch_inventory as inventory_stock
  where inventory_stock.branch_id = v_branch_id
    and inventory_stock.stock_inventory_id = v_stock_inventory_id
  for update;

  if not found then
    raise exception 'The scanned item is not in this branch''s Main Inventory';
  end if;
  if p_quantity > v_main_available then
    raise exception 'Stock-in quantity exceeds the Main Inventory available quantity';
  end if;

  select coalesce(daily_log.usage_quantity, 0)
  into v_usage_today
  from public.branch_inventory_daily_log as daily_log
  where daily_log.branch_inventory_id = v_branch_inventory_id
    and daily_log.usage_date = v_usage_date
  for update;

  if not found then
    v_usage_today := 0;
  end if;

  perform public.branch_admin_record_inventory_daily_usage(
    p_session_token,
    v_branch_inventory_id,
    v_usage_today + p_quantity
  );

  update public.branch_inventory_ref as ref_stock
  set available = ref_stock.available + p_quantity
  where ref_stock.branch_id = v_branch_id
    and ref_stock.stock_inventory_id = v_stock_inventory_id
  returning ref_stock.available into v_remaining_quantity;

  insert into public.branch_inventory_ref_stock_in_history (
    branch_id,
    stock_no,
    description,
    unit_of_measure,
    stock_in_qty
  )
  values (
    v_branch_id,
    v_stock_no,
    v_item_description,
    v_unit_of_measure,
    p_quantity
  );

  select inventory_stock.available
  into v_main_remaining_quantity
  from public.branch_inventory as inventory_stock
  where inventory_stock.id = v_branch_inventory_id;

  return query
  select v_barcode,
         v_stock_inventory_id,
         v_stock_no,
         v_item_description,
         v_unit_of_measure,
         p_quantity,
         v_remaining_quantity,
         v_main_remaining_quantity;
end;
$$;

revoke all on function public.branch_admin_list_inventory_ref(uuid) from public;
revoke all on function public.branch_admin_list_inventory_ref_history(uuid, integer, integer, date)
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_inventory_ref_stock_out_totals(uuid, date)
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_inventory_ref_stock_out_monthly_totals(uuid, date)
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_inventory_ref_stock_in_history(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.branch_admin_add_inventory_ref_item(uuid, uuid) from public;
revoke all on function public.branch_admin_delete_inventory_ref_item(uuid, uuid) from public;
revoke all on function public.branch_admin_update_inventory_ref_barcode(uuid, uuid, text) from public;
revoke all on function public.branch_admin_scan_counter_inventory_out(uuid, text, numeric)
  from public, anon, authenticated;
revoke all on function public.branch_admin_scan_counter_inventory_in(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.branch_admin_list_inventory_ref(uuid) to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_ref_history(uuid, integer, integer, date)
  to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_ref_stock_out_totals(uuid, date)
  to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_ref_stock_out_monthly_totals(uuid, date)
  to anon, authenticated;
grant execute on function public.branch_admin_list_inventory_ref_stock_in_history(uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.branch_admin_add_inventory_ref_item(uuid, uuid) to anon, authenticated;
grant execute on function public.branch_admin_delete_inventory_ref_item(uuid, uuid) to anon, authenticated;
grant execute on function public.branch_admin_update_inventory_ref_barcode(uuid, uuid, text) to anon, authenticated;
grant execute on function public.branch_admin_scan_counter_inventory_out(uuid, text, numeric)
  to anon, authenticated;
grant execute on function public.branch_admin_scan_counter_inventory_in(uuid, text, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
