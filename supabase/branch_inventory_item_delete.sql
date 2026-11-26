-- Run after branch_inventory.sql.
begin;

do $$
begin
  if to_regclass('public.branch_inventory') is null
    or to_regclass('public.branch_inventory_daily_log') is null
    or to_regclass('public.branch_admin_session') is null
    or to_regclass('public.branch_admin') is null then
    raise exception 'Install branch_inventory.sql and branch admin session tables first.';
  end if;
end;
$$;

create or replace function public.branch_admin_delete_inventory_item(
  p_session_token uuid,
  p_branch_inventory_id uuid
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
  from public.branch_inventory as branch_stock
  where branch_stock.id = p_branch_inventory_id
    and branch_stock.branch_id = v_branch_id
  for update;

  if not found then
    raise exception 'Inventory item was not found for this branch';
  end if;
  if v_available <> 0 then
    raise exception 'Inventory items can only be deleted when Available is 0';
  end if;

  delete from public.branch_inventory as branch_stock
  where branch_stock.id = p_branch_inventory_id
    and branch_stock.branch_id = v_branch_id;

  if not found then
    raise exception 'Inventory item could not be deleted';
  end if;

  return true;
end;
$$;

revoke all on function public.branch_admin_delete_inventory_item(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.branch_admin_delete_inventory_item(uuid, uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
