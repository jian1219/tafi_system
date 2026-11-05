-- Run after tafi_cdj.sql and tafi_admin_management.sql.
begin;

create or replace function public.tafi_admin_create_tafi_cdj_entry(
  p_session_token uuid,
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
  v_cash numeric := coalesce(p_cash, 0);
  v_bank_transfer numeric := coalesce(p_bank_transfer, 0);
  v_gcash numeric := coalesce(p_gcash, 0);
  v_cwt numeric := coalesce(p_cwt, 0);
begin
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
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

  if v_cash <> round(v_cash, 2)
    or v_bank_transfer <> round(v_bank_transfer, 2)
    or v_gcash <> round(v_gcash, 2)
    or v_cwt <> round(v_cwt, 2) then
    raise exception 'Amounts can have up to two decimal places';
  end if;

  if v_cash + v_bank_transfer + v_gcash + v_cwt <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  insert into public.tafi_cdj (
    ref_no,
    disbursement_voucher_no,
    description,
    account_titles,
    payee_supplier,
    tin,
    cash,
    bank_transfer,
    gcash,
    cwt
  )
  values (
    coalesce(btrim(p_ref_no), ''),
    coalesce(btrim(p_disbursement_voucher_no), ''),
    btrim(p_description),
    btrim(p_account_titles),
    btrim(p_payee_supplier),
    coalesce(btrim(p_tin), ''),
    v_cash,
    v_bank_transfer,
    v_gcash,
    v_cwt
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.tafi_admin_list_tafi_cdj_entries(
  p_session_token uuid,
  p_offset integer,
  p_limit integer
)
returns table (
  id uuid,
  "date" date,
  ref_no text,
  disbursement_voucher_no text,
  description text,
  account_titles text,
  payee_supplier text,
  tin text,
  cash numeric,
  bank_transfer numeric,
  gcash numeric,
  cwt numeric,
  total numeric,
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

  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid TAFI Cash Disbursement Journal page range';
  end if;

  return query
  select entry.id,
         entry."date",
         entry.ref_no,
         entry.disbursement_voucher_no,
         entry.description,
         entry.account_titles,
         entry.payee_supplier,
         entry.tin,
         entry.cash,
         entry.bank_transfer,
         entry.gcash,
         entry.cwt,
         entry.total,
         entry.created_at
  from public.tafi_cdj as entry
  order by entry."date" desc, entry.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.tafi_admin_create_tafi_cdj_entry(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) from public;
grant execute on function public.tafi_admin_create_tafi_cdj_entry(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) to anon, authenticated;
revoke all on function public.tafi_admin_list_tafi_cdj_entries(uuid, integer, integer)
  from public;
grant execute on function public.tafi_admin_list_tafi_cdj_entries(uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
