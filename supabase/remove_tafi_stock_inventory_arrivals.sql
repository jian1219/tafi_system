begin;

drop function if exists public.tafi_admin_list_stock_inventory_arrivals(uuid);
drop function if exists public.tafi_admin_create_stock_inventory_arrival(uuid, uuid, numeric);
drop table if exists public.tafi_stock_inventory_arrivals;

notify pgrst, 'reload schema';

commit;
