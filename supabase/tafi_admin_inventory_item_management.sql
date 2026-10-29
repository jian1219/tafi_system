-- Run after tafi_admin_inventory.sql and tafi_stock_inventory.sql.
begin;

do $$
declare
  v_constraint_name text;
begin
  if to_regclass('public.inventory_information') is null
    or to_regclass('public.tafi_stock_inventory') is null then
    raise exception 'Run the inventory information and TAFI stock inventory migrations first.';
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

  perform 1
  from public.inventory_information as inventory
  where inventory.id = p_inventory_id
  for update;

  if not found then
    raise exception 'The inventory item does not exist.';
  end if;

  update public.inventory_information
  set stock_no = trim(p_stock_no),
      category = trim(p_category),
      item_description = trim(p_item_description),
      unit_of_measure = trim(p_unit_of_measure),
      supplier = trim(p_supplier)
  where id = p_inventory_id;

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

  perform 1
  from public.inventory_information as inventory
  where inventory.id = p_inventory_id
  for update;

  if not found then
    raise exception 'The inventory item does not exist.';
  end if;

  if exists (
    select 1
    from public.tafi_stock_inventory as stock
    where stock.inventory_id = p_inventory_id
  ) then
    raise exception 'This item is linked to TAFI Stock Inventory. Remove its stock inventory record before deleting it.';
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
