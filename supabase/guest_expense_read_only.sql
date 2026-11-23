-- Run after Guest accounts, Branch CDJ, TAFI CDJ, and AP Subsidiary Ledger migrations.
begin;

do $$
begin
  if to_regclass('public.guest_session') is null
    or to_regclass('public.branch') is null
    or to_regclass('public.branch_cdj') is null
    or to_regclass('public.branch_daily_summary_cdj') is null
    or to_regclass('public.tafi_cdj') is null
    or to_regclass('public.tafi_ap_subsidiary_ledger') is null then
    raise exception 'Install Guest accounts and Expense migrations first.';
  end if;
end;
$$;

create or replace function public.guest_assert_expense_session(
  p_session_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;
end;
$$;

create or replace function public.guest_assert_expense_branch(
  p_session_token uuid,
  p_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.guest_assert_expense_session(p_session_token);

  if p_branch_id is null or not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
end;
$$;

create or replace function public.guest_list_branch_cdj_entries(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer,
  p_limit integer
)
returns table (
  id uuid,
  branch_id uuid,
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
  perform public.guest_assert_expense_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Branch Cash Disbursement Journal page range';
  end if;

  return query
  select entry.id,
         entry.branch_id,
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
  from public.branch_cdj as entry
  where entry.branch_id = p_branch_id
  order by entry."date" desc, entry.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.guest_list_branch_daily_summary_cdj(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer,
  p_limit integer
)
returns setof public.branch_daily_summary_cdj
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.guest_assert_expense_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Branch Cash Disbursement Journal summary page range';
  end if;

  return query
  select summary.*
  from public.branch_daily_summary_cdj as summary
  where summary.branch_id = p_branch_id
  order by summary."date" desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.guest_list_tafi_cdj_entries(
  p_session_token uuid,
  p_offset integer,
  p_limit integer
)
returns setof public.tafi_cdj
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.guest_assert_expense_session(p_session_token);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid TAFI Cash Disbursement Journal page range';
  end if;

  return query
  select entry.*
  from public.tafi_cdj as entry
  order by entry."date" desc, entry.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

drop function if exists public.guest_list_tafi_ap_subsidiary_ledger(uuid);

create or replace function public.guest_list_tafi_ap_subsidiary_ledger(
  p_session_token uuid
)
returns table (
  ledger_id uuid,
  delivery_date date,
  po_no text,
  dv_no text,
  coverage_period text,
  billing_invoice text,
  description text,
  payee_supplier_name text,
  terms text,
  amount numeric,
  discount numeric,
  wth numeric,
  net_amount numeric,
  payment_made numeric,
  check_no text,
  check_date text,
  invoice_no_ref_no text,
  date_payment text,
  balance_due numeric,
  status text,
  remarks text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.guest_assert_expense_session(p_session_token);

  return query
  select ledger.id,
         ledger.delivery_date,
         ledger.po_no,
         ledger.dv_no,
         ledger.coverage_period,
         ledger.billing_invoice,
         ledger.description,
         ledger.payee_supplier_name,
         ledger.terms,
         ledger.amount,
         ledger.discount,
         ledger.wth,
         ledger.net_amount,
         ledger.payment_made,
         ledger.check_no,
         ledger.check_date,
         ledger.invoice_no_ref_no,
         ledger.date_payment,
         ledger.balance_due,
         ledger.status,
         ledger.remarks,
         ledger.created_at,
         ledger.updated_at
  from public.tafi_ap_subsidiary_ledger as ledger
  order by ledger.delivery_date desc nulls last, ledger.created_at desc;
end;
$$;

revoke all on function public.guest_assert_expense_session(uuid)
  from public, anon, authenticated;
revoke all on function public.guest_assert_expense_branch(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.guest_list_branch_cdj_entries(uuid, uuid, integer, integer)
  from public;
grant execute on function public.guest_list_branch_cdj_entries(uuid, uuid, integer, integer)
  to anon, authenticated;
revoke all on function public.guest_list_branch_daily_summary_cdj(uuid, uuid, integer, integer)
  from public;
grant execute on function public.guest_list_branch_daily_summary_cdj(uuid, uuid, integer, integer)
  to anon, authenticated;
revoke all on function public.guest_list_tafi_cdj_entries(uuid, integer, integer)
  from public;
grant execute on function public.guest_list_tafi_cdj_entries(uuid, integer, integer)
  to anon, authenticated;
revoke all on function public.guest_list_tafi_ap_subsidiary_ledger(uuid)
  from public;
grant execute on function public.guest_list_tafi_ap_subsidiary_ledger(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
