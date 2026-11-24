-- Run after branch_management.sql, accountant_management.sql, and branch_stock_in_records.sql.
begin;

do $$
begin
  if to_regclass('public.branch') is null
    or to_regclass('public.branch_admin') is null
    or to_regclass('public.branch_admin_session') is null
    or to_regclass('public.accountant_session') is null
    or to_regclass('public.branch_stock_in_record') is null
    or to_regclass('public.tafi_stock_inventory') is null
    or to_regclass('public.inventory_information') is null then
    raise exception 'Install Branch Admin management, Accountant sessions, and branch stock-in records before the Branch Stock Card migration.';
  end if;
end;
$$;

create table if not exists public.branch_stock_card (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  stock_in_record_id uuid references public.branch_stock_in_record(id) on delete cascade,
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

alter table public.branch_stock_card
  add column if not exists stock_in_record_id uuid
  references public.branch_stock_in_record(id) on delete cascade;

alter table public.branch_stock_card enable row level security;
revoke all on table public.branch_stock_card from public, anon, authenticated;

create index if not exists branch_stock_card_branch_stock_date_idx
  on public.branch_stock_card (branch_id, stock_no, date, created_at, id);

create unique index if not exists branch_stock_card_stock_in_record_uidx
  on public.branch_stock_card (stock_in_record_id)
  where stock_in_record_id is not null;

insert into public.branch_stock_card (
  stock_in_record_id,
  branch_id,
  stock_no,
  item_description,
  category,
  unit_of_measure,
  date,
  reference,
  description,
  in_qty,
  in_unit_cost,
  in_total,
  created_at
)
select saved.id,
       saved.branch_id,
       saved.stock_no,
       saved.item_description,
       inventory.category,
       saved.unit_of_measure,
       saved.date,
       saved.request_id::text,
       'Received from purchase order',
       saved.stock_in_count,
       saved.per_item_price,
       saved.total_price,
       saved.created_at
from public.branch_stock_in_record as saved
left join public.tafi_stock_inventory as stock
  on stock.id = saved.stock_inventory_id
left join public.inventory_information as inventory
  on inventory.id = stock.inventory_id
on conflict (stock_in_record_id) where stock_in_record_id is not null
do update set
  branch_id = excluded.branch_id,
  stock_no = excluded.stock_no,
  item_description = excluded.item_description,
  category = excluded.category,
  unit_of_measure = excluded.unit_of_measure,
  date = excluded.date,
  reference = excluded.reference,
  description = excluded.description,
  in_qty = excluded.in_qty,
  in_unit_cost = excluded.in_unit_cost,
  in_total = excluded.in_total,
  created_at = excluded.created_at;

create or replace function public.branch_stock_card_sync_stock_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branch_stock_card (
    stock_in_record_id,
    branch_id,
    stock_no,
    item_description,
    category,
    unit_of_measure,
    date,
    reference,
    description,
    in_qty,
    in_unit_cost,
    in_total,
    created_at
  )
  select new.id,
         new.branch_id,
         new.stock_no,
         new.item_description,
         inventory.category,
         new.unit_of_measure,
         new.date,
         new.request_id::text,
         'Received from purchase order',
         new.stock_in_count,
         new.per_item_price,
         new.total_price,
         new.created_at
  from public.tafi_stock_inventory as stock
  left join public.inventory_information as inventory
    on inventory.id = stock.inventory_id
  where stock.id = new.stock_inventory_id
  on conflict (stock_in_record_id) where stock_in_record_id is not null
  do update set
    branch_id = excluded.branch_id,
    stock_no = excluded.stock_no,
    item_description = excluded.item_description,
    category = excluded.category,
    unit_of_measure = excluded.unit_of_measure,
    date = excluded.date,
    reference = excluded.reference,
    description = excluded.description,
    in_qty = excluded.in_qty,
    in_unit_cost = excluded.in_unit_cost,
    in_total = excluded.in_total,
    created_at = excluded.created_at;

  return new;
end;
$$;

revoke all on function public.branch_stock_card_sync_stock_in()
  from public, anon, authenticated;

drop trigger if exists branch_stock_card_sync_stock_in_trigger
  on public.branch_stock_in_record;
create trigger branch_stock_card_sync_stock_in_trigger
after insert or update on public.branch_stock_in_record
for each row
execute function public.branch_stock_card_sync_stock_in();

create or replace function public.branch_admin_list_stock_card_records(
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
  with stock_card_entries as (
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
           record.created_at
    from public.branch_stock_card as record
    where record.branch_id = v_branch_id
      and record.stock_in_record_id is not null
  ),
  balanced_stock_card_entries as (
    select entry.*,
           sum(coalesce(entry.in_qty, 0)) over stock_history as balance_qty,
           case
             when count(entry.in_total) over stock_history
               = count(*) over stock_history
             then sum(entry.in_total) over stock_history
             else null::numeric
           end as running_balance
    from stock_card_entries as entry
    window stock_history as (
      partition by entry.stock_no
      order by entry.date, entry.created_at, entry.id
      rows between unbounded preceding and current row
    )
  )
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
         null::numeric,
         null::numeric,
         null::numeric,
         record.balance_qty,
         case
           when record.running_balance is not null
             and record.balance_qty > 0
           then record.running_balance / record.balance_qty
           else null::numeric
         end,
         record.running_balance
  from balanced_stock_card_entries as record
  order by record.stock_no, record.date, record.created_at, record.id;
end;
$$;

revoke all on function public.branch_admin_list_stock_card_records(uuid)
  from public, anon, authenticated;
grant execute on function public.branch_admin_list_stock_card_records(uuid)
  to anon, authenticated;

create or replace function public.accountant_list_branch_stock_card_records(
  p_session_token uuid
)
returns table (
  branch_id uuid,
  branch_name text,
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
  with stock_card_entries as (
    select stock_card.branch_id,
           branch.name as branch_name,
           stock_card.id,
           stock_card.stock_no,
           stock_card.item_description,
           stock_card.category,
           stock_card.unit_of_measure,
           stock_card.date,
           stock_card.reference,
           stock_card.description,
           stock_card.in_qty,
           stock_card.in_unit_cost,
           stock_card.in_total,
           stock_card.created_at
    from public.branch_stock_card as stock_card
    join public.branch as branch
      on branch.id = stock_card.branch_id
    where stock_card.stock_in_record_id is not null
  ),
  balanced_stock_card_entries as (
    select entry.*,
           sum(coalesce(entry.in_qty, 0)) over stock_history as balance_qty,
           case
             when count(entry.in_total) over stock_history
               = count(*) over stock_history
             then sum(entry.in_total) over stock_history
             else null::numeric
           end as running_balance
    from stock_card_entries as entry
    window stock_history as (
      partition by entry.branch_id, entry.stock_no
      order by entry.date, entry.created_at, entry.id
      rows between unbounded preceding and current row
    )
  )
  select record.branch_id,
         record.branch_name,
         record.id,
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
         null::numeric,
         null::numeric,
         null::numeric,
         record.balance_qty,
         case
           when record.running_balance is not null
             and record.balance_qty > 0
           then record.running_balance / record.balance_qty
           else null::numeric
         end,
         record.running_balance
  from balanced_stock_card_entries as record
  order by record.branch_name, record.stock_no, record.date, record.created_at, record.id;
end;
$$;

revoke all on function public.accountant_list_branch_stock_card_records(uuid)
  from public, anon, authenticated;
grant execute on function public.accountant_list_branch_stock_card_records(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
