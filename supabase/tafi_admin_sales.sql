-- Run after branch_management.sql, cash_receipts_journal.sql, cash_receipts_targets.sql,
-- deposit.sql, branch_transactions.sql, tafi_admin_management.sql, and accountant_management.sql.
begin;

create or replace function public.tafi_admin_assert_sales_branch(
  p_session_token uuid,
  p_branch_id uuid
)
returns void
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
  ) and not exists (
    select 1
    from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin or Accountant session is invalid or expired' using errcode = '28000';
  end if;

  if p_branch_id is null or not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
end;
$$;

create or replace function public.tafi_admin_assert_sales_admin_branch(
  p_session_token uuid,
  p_branch_id uuid
)
returns void
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

  perform public.tafi_admin_assert_sales_branch(p_session_token, p_branch_id);
end;
$$;

create table if not exists public.branch_recurring_sales_target (
  branch_id uuid primary key references public.branch(id) on delete cascade,
  target_sales numeric(14, 2) not null check (target_sales > 0),
  effective_from date not null,
  updated_at timestamptz not null default now()
);

alter table public.branch_recurring_sales_target enable row level security;
revoke all on table public.branch_recurring_sales_target from public, anon, authenticated;

create or replace function public.cash_receipts_journal_apply_recurring_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_sales numeric;
  v_effective_from date;
begin
  select recurring_target.target_sales, recurring_target.effective_from
  into v_target_sales, v_effective_from
  from public.branch_recurring_sales_target as recurring_target
  where recurring_target.branch_id = new.branch_id;

  if not found or new."date" < v_effective_from then
    return new;
  end if;

  insert into public.targets (branch_id, "date", target_sales)
  values (new.branch_id, new."date", v_target_sales)
  on conflict (branch_id, "date")
  do update set target_sales = excluded.target_sales;

  return new;
end;
$$;

drop trigger if exists cash_receipts_journal_apply_recurring_target
  on public.cash_receipts_journal;
create trigger cash_receipts_journal_apply_recurring_target
after insert or update on public.cash_receipts_journal
for each row execute function public.cash_receipts_journal_apply_recurring_target();

create or replace function public.tafi_admin_create_branch_cash_receipts_journal_entry(
  p_session_token uuid,
  p_branch_id uuid,
  p_total_sales numeric,
  p_consigment_sales numeric,
  p_discount numeric,
  p_returns numeric,
  p_food_panda numeric,
  p_gcash numeric,
  p_creditable_withholding_tax numeric,
  p_cash_float numeric,
  p_expense numeric,
  p_cash_count numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (now() at time zone 'Asia/Manila')::date;
  v_month_start date;
  v_next_si_no numeric;
  v_si_no text;
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);

  if p_total_sales is null or p_total_sales < 0 or p_total_sales <> round(p_total_sales, 2)
    or p_consigment_sales is null or p_consigment_sales < 0
      or p_consigment_sales <> round(p_consigment_sales, 2)
    or p_discount is null or p_discount < 0 or p_discount <> round(p_discount, 2)
    or p_returns is null or p_returns < 0 or p_returns <> round(p_returns, 2)
    or p_food_panda is null or p_food_panda < 0 or p_food_panda <> round(p_food_panda, 2)
    or p_gcash is null or p_gcash < 0 or p_gcash <> round(p_gcash, 2)
    or p_creditable_withholding_tax is null or p_creditable_withholding_tax < 0
      or p_creditable_withholding_tax <> round(p_creditable_withholding_tax, 2)
    or p_cash_float is null or p_cash_float < 0 or p_cash_float <> round(p_cash_float, 2)
    or p_expense is null or p_expense < 0 or p_expense <> round(p_expense, 2)
    or p_cash_count is null or p_cash_count < 0 or p_cash_count <> round(p_cash_count, 2) then
    raise exception 'Enter valid amounts of zero or greater with up to two decimal places';
  end if;

  v_month_start := date_trunc('month', v_date)::date;
  perform pg_advisory_xact_lock(
    hashtext(p_branch_id::text),
    date_part('year', v_date)::integer * 100 + date_part('month', v_date)::integer
  );

  select coalesce(max(entry.si_no::numeric), 0) + 1
  into v_next_si_no
  from public.cash_receipts_journal as entry
  where entry.branch_id = p_branch_id
    and entry."date" >= v_month_start
    and entry."date" < (v_month_start + interval '1 month')::date
    and entry.si_no ~ '^[0-9]+$';

  v_si_no := v_next_si_no::text;

  insert into public.cash_receipts_journal (
    branch_id,
    si_no,
    "date",
    total_sales,
    consigment_sales,
    discount,
    returns,
    food_panda,
    gcash,
    creditable_withholding_tax,
    cash_float,
    expense,
    cash_count
  )
  values (
    p_branch_id,
    v_si_no,
    v_date,
    p_total_sales,
    p_consigment_sales,
    p_discount,
    p_returns,
    p_food_panda,
    p_gcash,
    p_creditable_withholding_tax,
    p_cash_float,
    p_expense,
    p_cash_count
  )
  returning si_no into v_si_no;

  return v_si_no;
end;
$$;

create or replace function public.tafi_admin_update_branch_cash_receipts_journal_entry(
  p_session_token uuid,
  p_branch_id uuid,
  p_entry_id uuid,
  p_total_sales numeric,
  p_consigment_sales numeric,
  p_discount numeric,
  p_returns numeric,
  p_food_panda numeric,
  p_gcash numeric,
  p_creditable_withholding_tax numeric,
  p_cash_float numeric,
  p_expense numeric,
  p_cash_count numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_si_no text;
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);

  if p_entry_id is null then
    raise exception 'Select a Cash Receipts Journal entry to update';
  end if;

  if p_total_sales is null or p_total_sales < 0 or p_total_sales <> round(p_total_sales, 2)
    or p_consigment_sales is null or p_consigment_sales < 0
      or p_consigment_sales <> round(p_consigment_sales, 2)
    or p_discount is null or p_discount < 0 or p_discount <> round(p_discount, 2)
    or p_returns is null or p_returns < 0 or p_returns <> round(p_returns, 2)
    or p_food_panda is null or p_food_panda < 0 or p_food_panda <> round(p_food_panda, 2)
    or p_gcash is null or p_gcash < 0 or p_gcash <> round(p_gcash, 2)
    or p_creditable_withholding_tax is null or p_creditable_withholding_tax < 0
      or p_creditable_withholding_tax <> round(p_creditable_withholding_tax, 2)
    or p_cash_float is null or p_cash_float < 0 or p_cash_float <> round(p_cash_float, 2)
    or p_expense is null or p_expense < 0 or p_expense <> round(p_expense, 2)
    or p_cash_count is null or p_cash_count < 0 or p_cash_count <> round(p_cash_count, 2) then
    raise exception 'Enter valid amounts of zero or greater with up to two decimal places';
  end if;

  update public.cash_receipts_journal as entry
  set total_sales = p_total_sales,
    consigment_sales = p_consigment_sales,
    discount = p_discount,
    returns = p_returns,
    food_panda = p_food_panda,
    gcash = p_gcash,
    creditable_withholding_tax = p_creditable_withholding_tax,
    cash_float = p_cash_float,
    expense = p_expense,
    cash_count = p_cash_count
  where entry.id = p_entry_id
    and entry.branch_id = p_branch_id
  returning entry.si_no into v_si_no;

  if not found then
    raise exception 'Cash Receipts Journal entry was not found in the selected branch';
  end if;

  return v_si_no;
end;
$$;

create or replace function public.tafi_admin_list_branch_cash_receipts_journal_entries(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.cash_receipts_journal
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_admin_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Cash Receipts Journal page range';
  end if;

  return query
  select entry.*
  from public.cash_receipts_journal as entry
  where entry.branch_id = p_branch_id
  order by entry."date" desc, entry.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

drop function if exists public.tafi_admin_create_branch_sales_target(uuid, uuid, date, numeric);
drop function if exists public.tafi_admin_update_branch_sales_target(uuid, uuid, uuid, date, numeric);

create or replace function public.tafi_admin_get_branch_recurring_sales_target(
  p_session_token uuid,
  p_branch_id uuid
)
returns setof public.branch_recurring_sales_target
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_admin_assert_sales_branch(p_session_token, p_branch_id);
  return query
  select recurring_target.*
  from public.branch_recurring_sales_target as recurring_target
  where recurring_target.branch_id = p_branch_id;
end;
$$;

create or replace function public.tafi_admin_set_branch_recurring_sales_target(
  p_session_token uuid,
  p_branch_id uuid,
  p_target_sales numeric
)
returns setof public.branch_recurring_sales_target
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_effective_from date := (now() at time zone 'Asia/Manila')::date;
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);
  if p_target_sales is null or p_target_sales <= 0 or p_target_sales <> round(p_target_sales, 2) then
    raise exception 'Enter a daily target greater than zero with up to two decimal places';
  end if;

  insert into public.branch_recurring_sales_target (
    branch_id, target_sales, effective_from, updated_at
  )
  values (p_branch_id, p_target_sales, v_effective_from, now())
  on conflict (branch_id)
  do update set
    target_sales = excluded.target_sales,
    effective_from = excluded.effective_from,
    updated_at = now();

  insert into public.targets (branch_id, "date", target_sales)
  select p_branch_id, v_effective_from, p_target_sales
  where exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = p_branch_id
      and entry."date" = v_effective_from
  )
  on conflict (branch_id, "date")
  do update set target_sales = excluded.target_sales;

  return query
  select recurring_target.*
  from public.branch_recurring_sales_target as recurring_target
  where recurring_target.branch_id = p_branch_id;
end;
$$;

create or replace function public.tafi_admin_list_branch_sales_targets(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.targets
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_admin_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid sales target page range';
  end if;

  return query
  select saved_target.*
  from public.targets as saved_target
  where saved_target.branch_id = p_branch_id
  order by saved_target."date" desc, saved_target.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_create_branch_deposit(
  p_session_token uuid,
  p_branch_id uuid,
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
  v_deposit_id uuid;
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);
  if p_date_deposit is null
    or p_deposit_am is null or p_deposit_am < 0 or p_deposit_am <> round(p_deposit_am, 2)
    or p_deposit_pm is null or p_deposit_pm < 0 or p_deposit_pm <> round(p_deposit_pm, 2) then
    raise exception 'Enter a deposit date and valid AM and PM amounts with up to two decimal places';
  end if;
  if not exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = p_branch_id
      and entry."date" = p_date_deposit
  ) then
    raise exception 'No Cash Receipts Journal entry exists for this branch and date';
  end if;

  insert into public.deposit (branch_id, date_deposit, deposit_am, deposit_pm)
  values (p_branch_id, p_date_deposit, p_deposit_am, p_deposit_pm)
  returning id into v_deposit_id;
  return v_deposit_id;
end;
$$;

create or replace function public.tafi_admin_update_branch_deposit(
  p_session_token uuid,
  p_branch_id uuid,
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
  v_deposit_id uuid;
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);
  if p_deposit_id is null or p_date_deposit is null
    or p_deposit_am is null or p_deposit_am < 0 or p_deposit_am <> round(p_deposit_am, 2)
    or p_deposit_pm is null or p_deposit_pm < 0 or p_deposit_pm <> round(p_deposit_pm, 2) then
    raise exception 'Select a deposit and enter a date and valid AM and PM amounts with up to two decimal places';
  end if;
  if not exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = p_branch_id
      and entry."date" = p_date_deposit
  ) then
    raise exception 'No Cash Receipts Journal entry exists for this branch and date';
  end if;

  update public.deposit as saved_deposit
  set date_deposit = p_date_deposit,
    deposit_am = p_deposit_am,
    deposit_pm = p_deposit_pm
  where saved_deposit.id = p_deposit_id
    and saved_deposit.branch_id = p_branch_id
  returning saved_deposit.id into v_deposit_id;

  if not found then
    raise exception 'Deposit was not found in the selected branch';
  end if;
  return v_deposit_id;
end;
$$;

create or replace function public.tafi_admin_list_branch_deposits(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.deposit
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_admin_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid deposit page range';
  end if;

  return query
  select saved_deposit.*
  from public.deposit as saved_deposit
  where saved_deposit.branch_id = p_branch_id
  order by saved_deposit.date_deposit desc, saved_deposit.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_create_branch_gcash_transaction(
  p_session_token uuid,
  p_branch_id uuid,
  p_date date,
  p_gcash_time text,
  p_reference_no text,
  p_sales_invoice text,
  p_amount numeric,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);
  if p_date is null or p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a transaction date and an amount of zero or greater with up to two decimal places';
  end if;

  insert into public.gcash_transaction (
    branch_id, "date", gcash_time, reference_no, sales_invoice, amount, reference
  )
  values (
    p_branch_id, p_date, p_gcash_time, p_reference_no, p_sales_invoice, p_amount, p_reference
  )
  returning id into v_transaction_id;
  return v_transaction_id;
end;
$$;

create or replace function public.tafi_admin_list_branch_gcash_transactions(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.gcash_transaction
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_admin_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid GCash transaction page range';
  end if;

  return query
  select transaction_entry.*
  from public.gcash_transaction as transaction_entry
  where transaction_entry.branch_id = p_branch_id
  order by transaction_entry."date" desc, transaction_entry.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_create_branch_food_panda_transaction(
  p_session_token uuid,
  p_branch_id uuid,
  p_date date,
  p_food_panda text,
  p_reference_no text,
  p_sales_invoice_order_slip_no text,
  p_invoice text,
  p_amount numeric,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);
  if p_date is null or p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a transaction date and an amount of zero or greater with up to two decimal places';
  end if;

  insert into public.food_panda_transaction (
    branch_id, "date", food_panda, reference_no, sales_invoice_order_slip_no, invoice, amount, reference
  )
  values (
    p_branch_id,
    p_date,
    p_food_panda,
    p_reference_no,
    p_sales_invoice_order_slip_no,
    p_invoice,
    p_amount,
    p_reference
  )
  returning id into v_transaction_id;
  return v_transaction_id;
end;
$$;

create or replace function public.tafi_admin_list_branch_food_panda_transactions(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.food_panda_transaction
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_admin_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Food Panda transaction page range';
  end if;

  return query
  select transaction_entry.*
  from public.food_panda_transaction as transaction_entry
  where transaction_entry.branch_id = p_branch_id
  order by transaction_entry."date" desc, transaction_entry.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.tafi_admin_assert_sales_branch(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_assert_sales_admin_branch(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.cash_receipts_journal_apply_recurring_target()
  from public, anon, authenticated;
revoke all on function public.tafi_admin_create_branch_cash_receipts_journal_entry(
  uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.tafi_admin_update_branch_cash_receipts_journal_entry(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.tafi_admin_list_branch_cash_receipts_journal_entries(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_get_branch_recurring_sales_target(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_set_branch_recurring_sales_target(uuid, uuid, numeric)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_branch_sales_targets(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_create_branch_deposit(uuid, uuid, date, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_update_branch_deposit(uuid, uuid, uuid, date, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_list_branch_deposits(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_create_branch_gcash_transaction(
  uuid, uuid, date, text, text, text, numeric, text
) from public, anon, authenticated;
revoke all on function public.tafi_admin_list_branch_gcash_transactions(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_create_branch_food_panda_transaction(
  uuid, uuid, date, text, text, text, text, numeric, text
) from public, anon, authenticated;
revoke all on function public.tafi_admin_list_branch_food_panda_transactions(uuid, uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.tafi_admin_create_branch_cash_receipts_journal_entry(
  uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to anon, authenticated;
grant execute on function public.tafi_admin_update_branch_cash_receipts_journal_entry(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_cash_receipts_journal_entries(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.tafi_admin_get_branch_recurring_sales_target(uuid, uuid)
  to anon, authenticated;
grant execute on function public.tafi_admin_set_branch_recurring_sales_target(uuid, uuid, numeric)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_sales_targets(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.tafi_admin_create_branch_deposit(uuid, uuid, date, numeric, numeric)
  to anon, authenticated;
grant execute on function public.tafi_admin_update_branch_deposit(uuid, uuid, uuid, date, numeric, numeric)
  to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_deposits(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.tafi_admin_create_branch_gcash_transaction(
  uuid, uuid, date, text, text, text, numeric, text
) to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_gcash_transactions(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.tafi_admin_create_branch_food_panda_transaction(
  uuid, uuid, date, text, text, text, text, numeric, text
) to anon, authenticated;
grant execute on function public.tafi_admin_list_branch_food_panda_transactions(uuid, uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
