-- Run after tafi_stock_inventory_barcode_balance.sql.
begin;

do $$
begin
  if to_regclass('public.tafi_stock_inventory') is null
    or to_regclass('public.tafi_admin_session') is null then
    raise exception 'Run the TAFI stock inventory and TAFI Admin session migrations first.';
  end if;

  if to_regprocedure('public.tafi_admin_list_stock_inventory(uuid)') is null then
    raise exception 'Run tafi_stock_inventory_barcode_balance.sql before this migration.';
  end if;
end;
$$;

alter table public.tafi_stock_inventory
  add column if not exists re_order_level numeric(14, 3) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.tafi_stock_inventory'::regclass
      and conname = 'tafi_stock_inventory_re_order_level_nonnegative'
  ) then
    alter table public.tafi_stock_inventory
      add constraint tafi_stock_inventory_re_order_level_nonnegative
      check (re_order_level >= 0);
  end if;
end;
$$;

drop function public.tafi_admin_list_stock_inventory(uuid);
create function public.tafi_admin_list_stock_inventory(p_session_token uuid)
returns table (
  stock_inventory_id uuid,
  inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric,
  re_order_level numeric,
  created_at timestamptz
)
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

  return query
  select stock.id,
         stock.inventory_id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         stock.available,
         stock.re_order_level,
         stock.created_at
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  order by inventory.stock_no, stock.created_at desc;
end;
$$;

create or replace function public.tafi_admin_update_stock_inventory_re_order_level(
  p_session_token uuid,
  p_stock_inventory_id uuid,
  p_re_order_level numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_re_order_level numeric;
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_stock_inventory_id is null then
    raise exception 'A TAFI stock item is required.';
  end if;

  if p_re_order_level is null
    or p_re_order_level < 0
    or p_re_order_level > 99999999999.999
    or p_re_order_level <> round(p_re_order_level, 3) then
    raise exception 'Re-order level must be between 0 and 99,999,999,999.999 with no more than three decimal places.';
  end if;

  update public.tafi_stock_inventory as stock
  set re_order_level = p_re_order_level
  where stock.id = p_stock_inventory_id
  returning stock.re_order_level into v_re_order_level;

  if not found then
    raise exception 'The selected TAFI stock item no longer exists.';
  end if;

  return v_re_order_level;
end;
$$;

revoke all on function public.tafi_admin_list_stock_inventory(uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_update_stock_inventory_re_order_level(uuid, uuid, numeric)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_list_stock_inventory(uuid)
  to anon, authenticated;
grant execute on function public.tafi_admin_update_stock_inventory_re_order_level(uuid, uuid, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
