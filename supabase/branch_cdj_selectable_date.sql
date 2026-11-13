-- Run after branch_cdj.sql and branch_daily_summary_cdj.sql.
begin;

do $$
begin
  if to_regclass('public.branch_cdj') is null
    or to_regclass('public.branch_daily_summary_cdj') is null
    or to_regprocedure(
      'public.branch_admin_create_cdj_entry(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric)'
    ) is null
    or to_regprocedure('public.branch_cdj_sync_daily_summary()') is null then
    raise exception 'Install the Branch CDJ and daily summary migrations first.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.branch_cdj'::regclass
      and tgname = 'branch_cdj_sync_daily_summary'
      and not tgisinternal
  ) then
    raise exception 'The Branch CDJ daily summary trigger is missing.';
  end if;
end;
$$;

create or replace function public.branch_admin_create_cdj_entry_with_date(
  p_session_token uuid,
  p_date date,
  p_ref_no text,
  p_disbursement_voucher_no text,
  p_description text,
  p_account_titles text,
  p_payee_supplier text,
  p_tin text,
  p_cash numeric,
  p_bank_transfer numeric,
  p_gcash numeric,
  p_cwt numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  if p_date is null then
    raise exception 'A Cash Disbursement Journal date is required.';
  end if;

  v_entry_id := public.branch_admin_create_cdj_entry(
    p_session_token,
    p_ref_no,
    p_disbursement_voucher_no,
    p_description,
    p_account_titles,
    p_payee_supplier,
    p_tin,
    p_cash,
    p_bank_transfer,
    p_gcash,
    p_cwt
  );

  update public.branch_cdj
  set "date" = p_date
  where id = v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.branch_admin_update_cdj_entry_with_date(
  p_session_token uuid,
  p_entry_id uuid,
  p_date date,
  p_ref_no text,
  p_disbursement_voucher_no text,
  p_description text,
  p_account_titles text,
  p_payee_supplier text,
  p_tin text,
  p_cash numeric,
  p_bank_transfer numeric,
  p_gcash numeric,
  p_cwt numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_cash numeric := coalesce(p_cash, 0);
  v_bank_transfer numeric := coalesce(p_bank_transfer, 0);
  v_gcash numeric := coalesce(p_gcash, 0);
  v_cwt numeric := coalesce(p_cwt, 0);
  v_entry_id uuid;
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

  if not exists (
    select 1
    from public.branch_cdj as entry
    where entry.id = p_entry_id
      and entry.branch_id = v_branch_id
  ) then
    raise exception 'Cash Disbursement Journal entry not found or does not belong to this branch';
  end if;

  if p_date is null then
    raise exception 'A Cash Disbursement Journal date is required.';
  end if;

  if nullif(btrim(p_description), '') is null
    or nullif(btrim(p_payee_supplier), '') is null then
    raise exception 'Description and Payee / Supplier are required';
  end if;

  if p_account_titles is null or btrim(p_account_titles) not in (
    'Accounts Receivable',
    'Advances to Employees',
    'Accounts Payable',
    'Accrued Expenses',
    'Lease Liability',
    'Franchise Payable',
    'VAT/WHHT PAYABLE',
    'Inventory - Tuna',
    'Inventory - Produce',
    'Inventory - Dry Goods',
    'Inventory - Dairy and Chilled Items',
    'Inventory - Packaging Materials',
    'Inventory - Beverages',
    'Inventory - Kitchen Supplies',
    'Inventory - Dining Supplies',
    'Admin Supplies',
    'Counter Supplies',
    'Cleaning Supplies',
    'Kitchen Equipment',
    'Dining Equipment',
    'Office Equipment',
    'Kitchen Furnitures & Fixtures',
    'Office Furnitures & Fixtures',
    'Wages - Service Crews',
    'Franchise Royalty Fees',
    'Advertising Expense',
    'Salaries Expense',
    'Employee Benefit Expense',
    'Travel and Accommodation Expense',
    'Performance Bonus Expense',
    'Human Resource Expense',
    'Professional Fees',
    'SSS Expense',
    'PhilHealth Expense',
    'Pag-Ibig Expense',
    'Rent Expense',
    'Insurance Expense',
    'Utilities Expense',
    'Communication Expenses',
    'Parking Attendant Fee',
    'Garbage Fee',
    'Transportation Expense',
    'Repairs and Maintenance',
    'Bank Charges',
    'Miscellaneous Expenses',
    'Taxes and Licenses',
    'Interest Expense',
    'Income Tax Expense'
  ) then
    raise exception 'Select a valid account title';
  end if;

  if v_cash < 0 or v_bank_transfer < 0 or v_gcash < 0 or v_cwt < 0
    or v_cash::text in ('NaN', 'Infinity', '-Infinity')
    or v_bank_transfer::text in ('NaN', 'Infinity', '-Infinity')
    or v_gcash::text in ('NaN', 'Infinity', '-Infinity')
    or v_cwt::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Amounts must be finite values of zero or greater';
  end if;

  if v_cash + v_bank_transfer + v_gcash + v_cwt <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  update public.branch_cdj as entry
  set "date" = p_date,
      ref_no = coalesce(btrim(p_ref_no), ''),
      disbursement_voucher_no = coalesce(btrim(p_disbursement_voucher_no), ''),
      description = btrim(p_description),
      account_titles = btrim(p_account_titles),
      payee_supplier = btrim(p_payee_supplier),
      tin = coalesce(btrim(p_tin), ''),
      cash = v_cash,
      bank_transfer = v_bank_transfer,
      gcash = v_gcash,
      cwt = v_cwt
  where entry.id = p_entry_id
    and entry.branch_id = v_branch_id
  returning entry.id into v_entry_id;

  if not found then
    raise exception 'Cash Disbursement Journal entry not found or does not belong to this branch';
  end if;

  return v_entry_id;
end;
$$;

revoke all on function public.branch_admin_create_cdj_entry_with_date(
  uuid, date, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.branch_admin_create_cdj_entry_with_date(
  uuid, date, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) to anon, authenticated;

revoke all on function public.branch_admin_update_cdj_entry_with_date(
  uuid, uuid, date, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.branch_admin_update_cdj_entry_with_date(
  uuid, uuid, date, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
