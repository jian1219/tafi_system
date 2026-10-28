-- Run after branch_inventory.sql and tafi_admin_stock_in_scans.sql.
begin;

drop function if exists public.branch_admin_list_tafi_stock_items(uuid);
create function public.branch_admin_list_tafi_stock_items(
  p_session_token uuid
)
returns table (
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.branch_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;

  return query
  select stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         coalesce(barcode_totals.item_count, 0::numeric)
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  left join (
    select saved.stock_no, sum(saved.scan_count)::numeric as item_count
    from public.tafi_admin_stock_in_scans as saved
    group by saved.stock_no
  ) as barcode_totals
    on barcode_totals.stock_no = stock.stock_no
  order by inventory.category, stock.stock_no;
end;
$$;

revoke all on function public.branch_admin_list_tafi_stock_items(uuid) from public;
grant execute on function public.branch_admin_list_tafi_stock_items(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
