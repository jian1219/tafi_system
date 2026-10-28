-- Run after tafi_admin_inventory.sql.
begin;

create unique index if not exists inventory_information_stock_link_idx
  on public.inventory_information (id, stock_no, item_description, unit_of_measure);

create table if not exists public.tafi_stock_inventory (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null unique,
  stock_no text not null,
  item_description text not null,
  unit_of_measure text not null,
  available numeric(14, 3) not null default 0
    check (available >= 0 and available = trunc(available)),
  created_at timestamptz not null default now(),
  foreign key (inventory_id, stock_no, item_description, unit_of_measure)
    references public.inventory_information(id, stock_no, item_description, unit_of_measure)
    on delete restrict
);

alter table public.tafi_stock_inventory enable row level security;
revoke all on table public.tafi_stock_inventory from public, anon, authenticated;

drop function if exists public.tafi_admin_list_stock_inventory(uuid);
create function public.tafi_admin_list_stock_inventory(
  p_session_token uuid
)
returns table (
  stock_inventory_id uuid,
  inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric,
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
         stock.created_at
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  order by inventory.stock_no, stock.created_at desc;
end;
$$;

drop function if exists public.accountant_list_tafi_stock_inventory(uuid);
create function public.accountant_list_tafi_stock_inventory(
  p_session_token uuid
)
returns table (
  stock_inventory_id uuid,
  stock_no text,
  item_description text,
  unit_of_measure text,
  category text,
  available numeric,
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
  select stock.id,
         stock.stock_no,
         stock.item_description,
         stock.unit_of_measure,
         inventory.category,
         stock.available,
         stock.created_at
  from public.tafi_stock_inventory as stock
  join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  order by inventory.stock_no, stock.created_at desc;
end;
$$;

drop function if exists public.tafi_admin_create_stock_inventory(uuid, uuid, numeric);
drop function if exists public.tafi_admin_create_stock_inventory(uuid, uuid);
create function public.tafi_admin_create_stock_inventory(
  p_session_token uuid,
  p_inventory_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  stock_inventory_id uuid;
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
    raise exception 'An inventory item is required';
  end if;

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
  where inventory.id = p_inventory_id
  returning id into stock_inventory_id;

  if not found then
    raise exception 'The selected inventory item does not exist';
  end if;

  return stock_inventory_id;
end;
$$;

revoke all on function public.tafi_admin_list_stock_inventory(uuid) from public;
revoke all on function public.accountant_list_tafi_stock_inventory(uuid) from public;
revoke all on function public.tafi_admin_create_stock_inventory(uuid, uuid) from public;

grant execute on function public.tafi_admin_list_stock_inventory(uuid) to anon, authenticated;
grant execute on function public.accountant_list_tafi_stock_inventory(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_create_stock_inventory(uuid, uuid) to anon, authenticated;

commit;
