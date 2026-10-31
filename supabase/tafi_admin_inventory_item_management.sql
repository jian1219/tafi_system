-- Run after accountant_management.sql, tafi_admin_management.sql,
-- tafi_admin_inventory.sql, tafi_stock_inventory.sql,
-- branch_management.sql, branch_inventory.sql,
-- tafi_admin_stock_in_scans.sql, and tafi_admin_stock_out_records.sql.
begin;

do $$
declare
  v_constraint_name text;
begin
  if to_regclass('public.inventory_information') is null
    or to_regclass('public.tafi_stock_inventory') is null then
    raise exception 'Run the inventory information and TAFI stock inventory migrations first.';
  end if;
  if to_regclass('public.tafi_admin_stock_in_scans') is null then
    raise exception 'Run tafi_admin_stock_in_scans.sql before this migration.';
  end if;
  if to_regclass('public.branch') is null
    or to_regclass('public.branch_inventory') is null
    or to_regclass('public.branch_inventory_daily_log') is null then
    raise exception 'Run branch_management.sql and branch_inventory.sql before this migration.';
  end if;

  for v_constraint_name in
    select constraint_row.conname
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.tafi_stock_inventory'::regclass
      and constraint_row.confrelid = 'public.inventory_information'::regclass
      and constraint_row.contype = 'f'
  loop
    execute format(
      'alter table public.tafi_stock_inventory drop constraint %I',
      v_constraint_name
    );
  end loop;

  execute 'alter table public.tafi_stock_inventory
    add constraint tafi_stock_inventory_inventory_information_fk
    foreign key (inventory_id, stock_no, item_description, unit_of_measure)
    references public.inventory_information(id, stock_no, item_description, unit_of_measure)
    on update cascade
    on delete restrict';
end;
$$;

create or replace function public.tafi_admin_create_stock_inventory_for_catalog_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tafi_stock_inventory (
    inventory_id,
    stock_no,
    item_description,
    unit_of_measure
  )
  values (
    new.id,
    new.stock_no,
    new.item_description,
    new.unit_of_measure
  )
  on conflict (inventory_id) do nothing;

  return new;
end;
$$;

revoke all on function public.tafi_admin_create_stock_inventory_for_catalog_item()
  from public, anon, authenticated;

drop trigger if exists inventory_information_create_tafi_stock
  on public.inventory_information;
create trigger inventory_information_create_tafi_stock
  after insert on public.inventory_information
  for each row
  execute function public.tafi_admin_create_stock_inventory_for_catalog_item();

insert into public.tafi_stock_inventory (
  inventory_id,
  stock_no,
  item_description,
  unit_of_measure
)
select inventory.id,
       inventory.stock_no,
       inventory.item_description,
       inventory.unit_of_measure
from public.inventory_information as inventory
on conflict (inventory_id) do nothing;

create or replace function public.tafi_admin_create_branch_inventory_for_stock_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branch_inventory (branch_id, stock_inventory_id, available)
  select branch.id, new.id, 0
  from public.branch
  on conflict (branch_id, stock_inventory_id) do nothing;

  return new;
end;
$$;

revoke all on function public.tafi_admin_create_branch_inventory_for_stock_item()
  from public, anon, authenticated;

drop trigger if exists tafi_stock_inventory_create_branch_rows
  on public.tafi_stock_inventory;
create trigger tafi_stock_inventory_create_branch_rows
  after insert on public.tafi_stock_inventory
  for each row
  execute function public.tafi_admin_create_branch_inventory_for_stock_item();

create or replace function public.tafi_admin_create_branch_rows_for_new_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branch_inventory (branch_id, stock_inventory_id, available)
  select new.id, stock.id, 0
  from public.tafi_stock_inventory as stock
  on conflict (branch_id, stock_inventory_id) do nothing;

  return new;
end;
$$;

revoke all on function public.tafi_admin_create_branch_rows_for_new_branch()
  from public, anon, authenticated;

drop trigger if exists branch_create_inventory_rows
  on public.branch;
create trigger branch_create_inventory_rows
  after insert on public.branch
  for each row
  execute function public.tafi_admin_create_branch_rows_for_new_branch();

insert into public.branch_inventory (branch_id, stock_inventory_id, available)
select branch.id, stock.id, 0
from public.branch as branch
cross join public.tafi_stock_inventory as stock
on conflict (branch_id, stock_inventory_id) do nothing;

create or replace function public.tafi_admin_update_inventory_information(
  p_session_token uuid,
  p_inventory_id uuid,
  p_stock_no text,
  p_category text,
  p_item_description text,
  p_unit_of_measure text,
  p_supplier text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory public.inventory_information%rowtype;
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_inventory_id is null
    or nullif(trim(p_stock_no), '') is null
    or nullif(trim(p_category), '') is null
    or nullif(trim(p_item_description), '') is null
    or nullif(trim(p_unit_of_measure), '') is null
    or nullif(trim(p_supplier), '') is null then
    raise exception 'Inventory ID, stock number, category, item description, unit of measure, and supplier are required';
  end if;

  select inventory.*
  into v_inventory
  from public.inventory_information as inventory
  where inventory.id = p_inventory_id
  for update;

  if not found then
    raise exception 'The inventory item does not exist.';
  end if;

  if trim(p_stock_no) is distinct from v_inventory.stock_no
    and exists (
      select 1
      from public.inventory_information as other_inventory
      where other_inventory.stock_no = trim(p_stock_no)
        and other_inventory.id <> p_inventory_id
    ) then
    raise exception 'The stock number is already assigned to another inventory item.';
  end if;

  update public.inventory_information
  set stock_no = trim(p_stock_no),
      category = trim(p_category),
      item_description = trim(p_item_description),
      unit_of_measure = trim(p_unit_of_measure),
      supplier = trim(p_supplier)
  where id = p_inventory_id;

  update public.tafi_admin_stock_in_scans as barcode
  set stock_no = trim(p_stock_no),
      item_description = trim(p_item_description),
      unit_of_measure = trim(p_unit_of_measure),
      updated_at = now()
  where barcode.stock_no = v_inventory.stock_no;

  return true;
end;
$$;

create or replace function public.tafi_admin_delete_inventory_information(
  p_session_token uuid,
  p_inventory_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock_no text;
  v_stock_inventory_id uuid;
  v_preparation_ids uuid[] := array[]::uuid[];
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_inventory_id is null then
    raise exception 'An inventory item is required.';
  end if;

  select inventory.stock_no
  into v_stock_no
  from public.inventory_information as inventory
  where inventory.id = p_inventory_id
  for update;

  if not found then
    raise exception 'The inventory item does not exist.';
  end if;

  select stock.id
  into v_stock_inventory_id
  from public.tafi_stock_inventory as stock
  where stock.inventory_id = p_inventory_id
  for update;

  if v_stock_inventory_id is not null
    and to_regclass('public.branch_stock_requests') is not null
    and to_regclass('public.tafi_stock_request_preparations') is not null
    and to_regclass('public.tafi_stock_request_preparation_items') is not null then
    execute $query$
      select coalesce(array_agg(preparation_id), array[]::uuid[])
      from (
        select request.preparation_id
        from public.branch_stock_requests as request
        where request.stock_inventory_id = $1
          and request.preparation_id is not null
        union
        select item.preparation_id
        from public.tafi_stock_request_preparation_items as item
        where item.stock_inventory_id = $1
      ) as linked_preparations
    $query$
    into v_preparation_ids
    using v_stock_inventory_id;
  end if;

  if v_stock_inventory_id is not null
    and to_regclass('public.branch_stock_receipt_history') is not null then
    if to_regclass('public.branch_stock_requests') is not null then
      execute $query$
        delete from public.branch_stock_receipt_history as history
        where history.stock_inventory_id = $1
          or history.request_id in (
            select request.id
            from public.branch_stock_requests as request
            where request.stock_inventory_id = $1
          )
      $query$
      using v_stock_inventory_id;
    else
      execute
        'delete from public.branch_stock_receipt_history where stock_inventory_id = $1'
      using v_stock_inventory_id;
    end if;
  end if;

  if v_stock_inventory_id is not null
    and to_regclass('public.branch_inventory_daily_log') is not null then
    delete from public.branch_inventory_daily_log as usage_log
    using public.branch_inventory as branch_stock
    where usage_log.branch_inventory_id = branch_stock.id
      and branch_stock.stock_inventory_id = v_stock_inventory_id;
  end if;

  if v_stock_inventory_id is not null
    and to_regclass('public.branch_stock_requests') is not null then
    execute
      'delete from public.branch_stock_requests where stock_inventory_id = $1'
    using v_stock_inventory_id;
  end if;

  if v_stock_inventory_id is not null
    and to_regclass('public.tafi_stock_request_preparation_items') is not null then
    execute
      'delete from public.tafi_stock_request_preparation_items where stock_inventory_id = $1'
    using v_stock_inventory_id;
  end if;

  if cardinality(v_preparation_ids) > 0 then
    execute $query$
      delete from public.tafi_stock_request_preparations as preparation
      where preparation.id = any($1)
        and not exists (
          select 1
          from public.branch_stock_requests as request
          where request.preparation_id = preparation.id
        )
        and not exists (
          select 1
          from public.tafi_stock_request_preparation_items as item
          where item.preparation_id = preparation.id
        )
    $query$
    using v_preparation_ids;
  end if;

  if v_stock_inventory_id is not null
    and to_regclass('public.tafi_stock_inventory_arrivals') is not null then
    execute
      'delete from public.tafi_stock_inventory_arrivals where stock_inventory_id = $1'
    using v_stock_inventory_id;
  end if;

  if to_regclass('public.stock_in_records') is not null then
    execute 'delete from public.stock_in_records where stock_no = $1'
    using v_stock_no;
  end if;

  if to_regclass('public.stock_out_records') is not null then
    execute 'delete from public.stock_out_records where stock_no = $1'
    using v_stock_no;
  end if;

  if to_regclass('public.inventory_add_manually_history') is not null then
    execute
      'delete from public.inventory_add_manually_history where stock_no = $1'
    using v_stock_no;
  end if;

  delete from public.tafi_admin_stock_in_scans
  where stock_no = v_stock_no;

  if v_stock_inventory_id is not null then
    delete from public.branch_inventory
    where stock_inventory_id = v_stock_inventory_id;

    delete from public.tafi_stock_inventory
    where id = v_stock_inventory_id;
  end if;

  delete from public.inventory_information
  where id = p_inventory_id;

  return true;
end;
$$;

revoke all on function public.tafi_admin_update_inventory_information(uuid, uuid, text, text, text, text, text)
  from public;
revoke all on function public.tafi_admin_delete_inventory_information(uuid, uuid)
  from public;

grant execute on function public.tafi_admin_update_inventory_information(uuid, uuid, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.tafi_admin_delete_inventory_information(uuid, uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
