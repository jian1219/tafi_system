-- Run after branch_management.sql and cash_receipts_journal.sql.
begin;

create table if not exists public.deposit (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  date_deposit date not null,
  deposit_am numeric(14, 2) not null default 0,
  deposit_pm numeric(14, 2) not null default 0,
  total_deposit numeric(14, 2) not null default 0,
  deposit_vs_cash_sales numeric(14, 2),
  created_at timestamptz not null default now(),
  unique (branch_id, date_deposit)
);

create index if not exists deposit_branch_date_idx
  on public.deposit (branch_id, date_deposit desc);

alter table public.deposit enable row level security;
revoke all on table public.deposit from public, anon, authenticated;

create or replace function public.deposit_calculate_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.date_deposit is null
    or new.deposit_am is null or new.deposit_am < 0 or new.deposit_am <> round(new.deposit_am, 2)
    or new.deposit_pm is null or new.deposit_pm < 0 or new.deposit_pm <> round(new.deposit_pm, 2) then
    raise exception 'Enter a deposit date and valid AM and PM amounts with up to two decimal places';
  end if;

  new.total_deposit := new.deposit_am + new.deposit_pm;
  select greatest(entry.net_cash_available, entry.cash_count) - new.total_deposit
  into new.deposit_vs_cash_sales
  from public.cash_receipts_journal as entry
  where entry.branch_id = new.branch_id
    and entry."date" = new.date_deposit
  order by entry.created_at desc, entry.id desc
  limit 1;

  if not found then
    new.deposit_vs_cash_sales := null;
  end if;
  return new;
end;
$$;

drop trigger if exists deposit_calculate_fields on public.deposit;
create trigger deposit_calculate_fields
before insert or update on public.deposit
for each row execute function public.deposit_calculate_fields();

create or replace function public.deposit_sync_cash_receipts_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.deposit as saved_deposit
    set deposit_vs_cash_sales = null
    where saved_deposit.branch_id = old.branch_id
      and saved_deposit.date_deposit = old."date";
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (old.branch_id, old."date") is distinct from (new.branch_id, new."date") then
    update public.deposit as saved_deposit
    set deposit_vs_cash_sales = null
    where saved_deposit.branch_id = old.branch_id
      and saved_deposit.date_deposit = old."date";
  end if;

  update public.deposit as saved_deposit
  set deposit_vs_cash_sales = (
    select greatest(entry.net_cash_available, entry.cash_count) - saved_deposit.total_deposit
    from public.cash_receipts_journal as entry
    where entry.branch_id = saved_deposit.branch_id
      and entry."date" = saved_deposit.date_deposit
    order by entry.created_at desc, entry.id desc
    limit 1
  )
  where saved_deposit.branch_id = new.branch_id
    and saved_deposit.date_deposit = new."date";
  return new;
end;
$$;

drop trigger if exists deposit_sync_cash_receipts_fields on public.cash_receipts_journal;
create trigger deposit_sync_cash_receipts_fields
after insert or update or delete on public.cash_receipts_journal
for each row execute function public.deposit_sync_cash_receipts_fields();

create or replace function public.branch_admin_create_deposit(
  p_session_token uuid,
  p_date_deposit date,
  p_deposit_am numeric,
  p_deposit_pm numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_deposit_id uuid;
begin
  select branch_admin.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_date_deposit is null
    or p_deposit_am is null or p_deposit_am < 0 or p_deposit_am <> round(p_deposit_am, 2)
    or p_deposit_pm is null or p_deposit_pm < 0 or p_deposit_pm <> round(p_deposit_pm, 2) then
    raise exception 'Enter a deposit date and valid AM and PM amounts with up to two decimal places';
  end if;
  if not exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = v_branch_id
      and entry."date" = p_date_deposit
  ) then
    raise exception 'No Cash Receipts Journal entry exists for this branch and date';
  end if;

  insert into public.deposit (branch_id, date_deposit, deposit_am, deposit_pm)
  values (v_branch_id, p_date_deposit, p_deposit_am, p_deposit_pm)
  returning id into v_deposit_id;
  return v_deposit_id;
end;
$$;

create or replace function public.branch_admin_update_deposit(
  p_session_token uuid,
  p_deposit_id uuid,
  p_date_deposit date,
  p_deposit_am numeric,
  p_deposit_pm numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_deposit_id uuid;
begin
  select branch_admin.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_deposit_id is null or p_date_deposit is null
    or p_deposit_am is null or p_deposit_am < 0 or p_deposit_am <> round(p_deposit_am, 2)
    or p_deposit_pm is null or p_deposit_pm < 0 or p_deposit_pm <> round(p_deposit_pm, 2) then
    raise exception 'Select a deposit and enter a date and valid AM and PM amounts with up to two decimal places';
  end if;
  if not exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = v_branch_id
      and entry."date" = p_date_deposit
  ) then
    raise exception 'No Cash Receipts Journal entry exists for this branch and date';
  end if;

  update public.deposit as saved_deposit
  set date_deposit = p_date_deposit,
    deposit_am = p_deposit_am,
    deposit_pm = p_deposit_pm
  where saved_deposit.id = p_deposit_id
    and saved_deposit.branch_id = v_branch_id
  returning saved_deposit.id into v_deposit_id;

  if not found then
    raise exception 'Deposit was not found in your branch';
  end if;
  return v_deposit_id;
end;
$$;

create or replace function public.branch_admin_list_deposits(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.deposit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select branch_admin.branch_id into v_branch_id
  from public.branch_admin_session as admin_session
  join public.branch_admin as branch_admin
    on branch_admin.id = admin_session.branch_admin_id
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Branch Admin session is invalid or expired' using errcode = '28000';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid deposit page range';
  end if;

  return query
  select saved_deposit.*
  from public.deposit as saved_deposit
  where saved_deposit.branch_id = v_branch_id
  order by saved_deposit.date_deposit desc, saved_deposit.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.deposit_calculate_fields()
  from public, anon, authenticated;
revoke all on function public.deposit_sync_cash_receipts_fields()
  from public, anon, authenticated;
revoke all on function public.branch_admin_create_deposit(uuid, date, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.branch_admin_update_deposit(uuid, uuid, date, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_deposits(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.branch_admin_create_deposit(uuid, date, numeric, numeric)
  to anon, authenticated;
grant execute on function public.branch_admin_update_deposit(uuid, uuid, date, numeric, numeric)
  to anon, authenticated;
grant execute on function public.branch_admin_list_deposits(uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
