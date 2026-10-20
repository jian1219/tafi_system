-- Run after tafi_stock_inventory.sql.
begin;

create table if not exists public.tafi_stock_inventory_arrivals (
  id uuid primary key default gen_random_uuid(),
  stock_inventory_id uuid not null
    references public.tafi_stock_inventory(id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  created_by_tafi_admin_id uuid not null
    references public.tafi_admin(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists tafi_stock_inventory_arrivals_created_at_idx
  on public.tafi_stock_inventory_arrivals (created_at desc);

alter table public.tafi_stock_inventory_arrivals enable row level security;
revoke all on table public.tafi_stock_inventory_arrivals from public, anon, authenticated;

create or replace function public.tafi_admin_list_stock_inventory_arrivals(
  p_session_token uuid
)
returns table (
  arrival_id uuid,
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  qty numeric,
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
  select arrival.id,
         stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         arrival.qty,
         arrival.created_at
  from public.tafi_stock_inventory_arrivals as arrival
  join public.tafi_stock_inventory as stock
    on stock.id = arrival.stock_inventory_id
  order by arrival.created_at desc;
end;
$$;

create or replace function public.tafi_admin_create_stock_inventory_arrival(
  p_session_token uuid,
  p_stock_inventory_id uuid,
  p_qty numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_arrival_id uuid;
begin
  select admin_session.tafi_admin_id
  into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_stock_inventory_id is null then
    raise exception 'A stock inventory item is required';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Arrival quantity must be greater than zero';
  end if;

  update public.tafi_stock_inventory
  set onhand = onhand + p_qty
  where id = p_stock_inventory_id;

  if not found then
    raise exception 'The selected stock inventory item does not exist';
  end if;

  insert into public.tafi_stock_inventory_arrivals (
    stock_inventory_id,
    qty,
    created_by_tafi_admin_id
  )
  values (
    p_stock_inventory_id,
    p_qty,
    v_admin_id
  )
  returning id into v_arrival_id;

  return v_arrival_id;
end;
$$;

revoke all on function public.tafi_admin_list_stock_inventory_arrivals(uuid) from public;
revoke all on function public.tafi_admin_create_stock_inventory_arrival(uuid, uuid, numeric) from public;

grant execute on function public.tafi_admin_list_stock_inventory_arrivals(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_create_stock_inventory_arrival(uuid, uuid, numeric) to anon, authenticated;

commit;
