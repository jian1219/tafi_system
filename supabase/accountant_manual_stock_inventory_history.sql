-- Run after accountant_management.sql and tafi_admin_manual_stock_inventory.sql.
begin;

do $$
begin
  if to_regclass('public.accountant_session') is null
    or to_regclass('public.inventory_add_manually_history') is null then
    raise exception 'Run accountant_management.sql and tafi_admin_manual_stock_inventory.sql first.';
  end if;
end;
$$;

create or replace function public.accountant_list_manual_stock_inventory_history(
  p_session_token uuid
)
returns table (
  history_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  manually_add bigint,
  date date,
  created_at timestamptz
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
  select history.id,
         history.stock_no,
         history.item_description,
         history.unit_of_measure,
         history.manually_add,
         history.date,
         history.created_at
  from public.inventory_add_manually_history as history
  order by history.date desc, history.created_at desc, history.id desc;
end;
$$;

revoke all on function public.accountant_list_manual_stock_inventory_history(uuid)
  from public, anon, authenticated;
grant execute on function public.accountant_list_manual_stock_inventory_history(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
