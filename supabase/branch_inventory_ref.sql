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

revoke all on function public.branch_admin_list_inventory_ref(uuid) from public;
revoke all on function public.branch_admin_add_inventory_ref_item(uuid, uuid) from public;
revoke all on function public.branch_admin_update_inventory_ref_barcode(uuid, uuid, text) from public;
grant execute on function public.branch_admin_list_inventory_ref(uuid) to anon, authenticated;
grant execute on function public.branch_admin_add_inventory_ref_item(uuid, uuid) to anon, authenticated;
grant execute on function public.branch_admin_update_inventory_ref_barcode(uuid, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
