-- Run after branch_management.sql.
begin;

create table if not exists public.cash_receipts_journal (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  si_no text not null,
  "date" date not null default ((now() at time zone 'Asia/Manila')::date),
  "day" text not null,
  total_sales numeric(14, 2) not null default 0,
  consigment_sales numeric(14, 2) not null default 0,
  gross_sales numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  returns numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  food_panda numeric(14, 2) not null default 0,
  gcash numeric(14, 2) not null default 0,
  total_noncash_sales numeric(14, 2) not null default 0,
  creditable_withholding_tax numeric(14, 2) not null default 0,
  net_cash_sales numeric(14, 2) not null default 0,
  cash_float numeric(14, 2) not null default 0,
  cash_available numeric(14, 2) not null default 0,
  expense numeric(14, 2) not null default 0,
  net_cash_available numeric(14, 2) not null default 0,
  cash_count numeric(14, 2) not null default 0,
  difference numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cash_receipts_journal_branch_date_idx
  on public.cash_receipts_journal (branch_id, "date" desc, created_at desc);

alter table public.cash_receipts_journal enable row level security;
revoke all on table public.cash_receipts_journal from public, anon, authenticated;

create or replace function public.cash_receipts_journal_calculate_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new."day" := case extract(isodow from new."date")::integer
    when 1 then 'Monday'
    when 2 then 'Tuesday'
    when 3 then 'Wednesday'
    when 4 then 'Thursday'
    when 5 then 'Friday'
    when 6 then 'Saturday'
    when 7 then 'Sunday'
  end;
  new.gross_sales := new.total_sales - new.consigment_sales;
  new.net_sales := new.gross_sales - new.discount - new.returns;
  new.total_noncash_sales := new.food_panda + new.gcash;
  new.net_cash_sales := new.net_sales - new.total_noncash_sales - new.creditable_withholding_tax;
  new.cash_available := new.net_cash_sales + new.cash_float;
  new.net_cash_available := new.cash_available - new.expense;
  new.difference := new.cash_count - new.net_cash_available;
  return new;
end;
$$;

drop trigger if exists cash_receipts_journal_calculate_fields
  on public.cash_receipts_journal;
create trigger cash_receipts_journal_calculate_fields
before insert or update on public.cash_receipts_journal
for each row execute function public.cash_receipts_journal_calculate_fields();

drop function if exists public.branch_admin_create_cash_receipts_journal_entry(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
);
create or replace function public.branch_admin_create_cash_receipts_journal_entry(
  p_session_token uuid,
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
  v_branch_id uuid;
  v_date date := (now() at time zone 'Asia/Manila')::date;
  v_month_start date;
  v_next_si_no numeric;
  v_si_no text;
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
    hashtext(v_branch_id::text),
    date_part('year', v_date)::integer * 100 + date_part('month', v_date)::integer
  );

  select coalesce(max(entry.si_no::numeric), 0) + 1
  into v_next_si_no
  from public.cash_receipts_journal as entry
  where entry.branch_id = v_branch_id
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
    v_branch_id,
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

create or replace function public.branch_admin_update_cash_receipts_journal_entry(
  p_session_token uuid,
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
  v_branch_id uuid;
  v_si_no text;
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
    and entry.branch_id = v_branch_id
  returning entry.si_no into v_si_no;

  if not found then
    raise exception 'Cash Receipts Journal entry was not found in your branch';
  end if;

  return v_si_no;
end;
$$;

create or replace function public.branch_admin_list_cash_receipts_journal_entries(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.cash_receipts_journal
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
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Cash Receipts Journal page range';
  end if;

  return query
  select entry.*
  from public.cash_receipts_journal as entry
  where entry.branch_id = v_branch_id
  order by entry."date" desc, entry.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.cash_receipts_journal_calculate_fields()
  from public, anon, authenticated;
revoke all on function public.branch_admin_create_cash_receipts_journal_entry(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.branch_admin_update_cash_receipts_journal_entry(
  uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.branch_admin_list_cash_receipts_journal_entries(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.branch_admin_create_cash_receipts_journal_entry(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to anon, authenticated;
grant execute on function public.branch_admin_update_cash_receipts_journal_entry(
  uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to anon, authenticated;
grant execute on function public.branch_admin_list_cash_receipts_journal_entries(
  uuid, integer, integer
) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
