-- Run after cash_receipts_journal.sql and tafi_admin_sales.sql.
begin;

drop function if exists public.branch_admin_create_cash_receipts_journal_entry_with_si_no(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
);
drop function if exists public.branch_admin_update_cash_receipts_journal_entry_with_si_no(
  uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
);

create or replace function public.branch_admin_create_cash_receipts_journal_entry_with_si_no(
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
  p_cash_count numeric,
  p_date date,
  p_si_no text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_date date := p_date;
  v_year integer;
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
  if v_date is null then
    raise exception 'Select a Cash Receipts Journal date';
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

  perform pg_advisory_xact_lock(
    hashtext(v_branch_id::text),
    hashtext('cash_receipts_journal_si_no')
  );

  v_si_no := nullif(btrim(p_si_no), '');
  if v_si_no is null then
    v_year := extract(year from v_date)::integer;
    select greatest(
      2101,
      coalesce(max(substring(entry.si_no from '[0-9]+$')::numeric), 2100) + 1
    )
    into v_next_si_no
    from public.cash_receipts_journal as entry
    where entry.branch_id = v_branch_id
      and entry.si_no ~ ('^' || v_year::text || '-[0-9]+$');
    v_si_no := v_year::text || '-' || v_next_si_no::text;
  elsif length(v_si_no) > 64 then
    raise exception 'SI No. must be 64 characters or fewer';
  end if;

  if exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = v_branch_id
      and entry.si_no = v_si_no
  ) then
    raise exception 'SI No. already exists in this branch';
  end if;

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

create or replace function public.branch_admin_update_cash_receipts_journal_entry_with_si_no(
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
  p_cash_count numeric,
  p_date date,
  p_si_no text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_si_no text := nullif(btrim(p_si_no), '');
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
  if p_date is null then
    raise exception 'Select a Cash Receipts Journal date';
  end if;
  if v_si_no is null then
    raise exception 'Enter an SI No.';
  end if;
  if length(v_si_no) > 64 then
    raise exception 'SI No. must be 64 characters or fewer';
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

  perform pg_advisory_xact_lock(
    hashtext(v_branch_id::text),
    hashtext('cash_receipts_journal_si_no')
  );
  if exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = v_branch_id
      and entry.si_no = v_si_no
      and entry.id <> p_entry_id
  ) then
    raise exception 'SI No. already exists in this branch';
  end if;

  update public.cash_receipts_journal as entry
  set si_no = v_si_no,
    "date" = p_date,
    total_sales = p_total_sales,
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

revoke all on function public.branch_admin_create_cash_receipts_journal_entry_with_si_no(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date, text
) from public, anon, authenticated;
revoke all on function public.branch_admin_update_cash_receipts_journal_entry_with_si_no(
  uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date, text
) from public, anon, authenticated;
grant execute on function public.branch_admin_create_cash_receipts_journal_entry_with_si_no(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date, text
) to anon, authenticated;
grant execute on function public.branch_admin_update_cash_receipts_journal_entry_with_si_no(
  uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date, text
) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
