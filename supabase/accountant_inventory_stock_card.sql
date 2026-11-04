-- Independent TAFI Accountant stock card ledger; no foreign keys to other tables.
-- Run after accountant_management.sql.
begin;

do $$
begin
  if to_regclass('public.accountant_session') is null then
    raise exception 'Install Accountant sessions before the Inventory Stock Card migration.';
  end if;
end;
$$;

create table if not exists public.accountant_inventory_stock_card (
  id uuid primary key default gen_random_uuid(),
  stock_no text not null,
  item_description text not null,
  category text,
  unit_of_measure text not null,
  date date not null,
  reference text,
  description text,
  in_qty numeric(14, 3),
  in_unit_cost numeric(14, 2),
  in_total numeric(14, 2),
  out_qty numeric(14, 3),
  out_unit_cost numeric(14, 2),
  out_total numeric(14, 2),
  balance_qty numeric(14, 3),
  balance_unit_cost numeric(14, 2),
  running_balance numeric(14, 2),
  created_at timestamptz not null default now()
);

alter table public.accountant_inventory_stock_card enable row level security;
revoke all on table public.accountant_inventory_stock_card from public, anon, authenticated;

create index if not exists accountant_inventory_stock_card_stock_date_idx
  on public.accountant_inventory_stock_card (stock_no, date, created_at, id);

create or replace function public.accountant_list_inventory_stock_card_records(
  p_session_token uuid
)
returns table (
  id uuid,
  stock_no text,
  item_description text,
  category text,
  unit_of_measure text,
  date date,
  reference text,
  description text,
  in_qty numeric,
  in_unit_cost numeric,
  in_total numeric,
  out_qty numeric,
  out_unit_cost numeric,
  out_total numeric,
  balance_qty numeric,
  balance_unit_cost numeric,
  running_balance numeric
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
  select record.id,
         record.stock_no,
         record.item_description,
         record.category,
         record.unit_of_measure,
         record.date,
         record.reference,
         record.description,
         record.in_qty,
         record.in_unit_cost,
         record.in_total,
         record.out_qty,
         record.out_unit_cost,
         record.out_total,
         record.balance_qty,
         record.balance_unit_cost,
         record.running_balance
  from public.accountant_inventory_stock_card as record
  order by record.stock_no, record.date, record.created_at, record.id;
end;
$$;

revoke all on function public.accountant_list_inventory_stock_card_records(uuid)
  from public, anon, authenticated;
grant execute on function public.accountant_list_inventory_stock_card_records(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
