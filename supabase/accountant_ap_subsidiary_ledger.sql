-- Run after accountant_management.sql and tafi_admin_management.sql.
create table if not exists public.tafi_ap_subsidiary_ledger (
  id uuid primary key default gen_random_uuid(),
  delivery_date date,
  po_no text,
  dv_no text,
  coverage_period text,
  billing_invoice text,
  description text,
  payee_supplier_name text,
  terms text,
  amount numeric(14, 2) check (amount is null or amount >= 0),
  net_amount numeric(14, 2) check (net_amount is null or net_amount >= 0),
  payment_made numeric(14, 2) check (payment_made is null or payment_made >= 0),
  check_no text,
  check_date text,
  invoice_no_ref_no text,
  date_payment text,
  balance_due numeric(14, 2) check (balance_due is null or balance_due >= 0),
  status text not null default 'preparing_check'
    check (status in ('preparing_check', 'paid', 'check_for_pick_up')),
  remarks text,
  created_by_accountant_id uuid
    references public.accountant(id) on delete restrict,
  created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict,
  constraint tafi_ap_subsidiary_ledger_one_creator
    check (num_nonnulls(created_by_accountant_id, created_by_tafi_admin_id) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tafi_ap_subsidiary_ledger
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete restrict,
  alter column created_by_accountant_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tafi_ap_subsidiary_ledger_one_creator'
      and conrelid = 'public.tafi_ap_subsidiary_ledger'::regclass
  ) then
    alter table public.tafi_ap_subsidiary_ledger
      add constraint tafi_ap_subsidiary_ledger_one_creator
      check (num_nonnulls(created_by_accountant_id, created_by_tafi_admin_id) = 1);
  end if;
end;
$$;

alter table public.tafi_ap_subsidiary_ledger enable row level security;
revoke all on table public.tafi_ap_subsidiary_ledger from public, anon, authenticated;

create or replace function public.accountant_list_ap_subsidiary_ledger(
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
  if not exists (
    select 1
    from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

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

create or replace function public.accountant_save_ap_subsidiary_ledger_entry(
  p_session_token uuid,
  p_ledger_id uuid,
  p_delivery_date date,
  p_po_no text,
  p_dv_no text,
  p_coverage_period text,
  p_billing_invoice text,
  p_description text,
  p_payee_supplier_name text,
  p_terms text,
  p_amount numeric,
  p_net_amount numeric,
  p_payment_made numeric,
  p_check_no text,
  p_check_date text,
  p_invoice_no_ref_no text,
  p_date_payment text,
  p_balance_due numeric,
  p_status text,
  p_remarks text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  accountant_id uuid;
  saved_ledger_id uuid;
begin
  select accountant_session.accountant_id
  into accountant_id
  from public.accountant_session as accountant_session
  where accountant_session.session_token = p_session_token
    and accountant_session.expires_at > now();

  if not found then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  if p_status not in ('preparing_check', 'paid', 'check_for_pick_up') then
    raise exception 'Choose a valid AP payment status';
  end if;

  if p_ledger_id is null then
    insert into public.tafi_ap_subsidiary_ledger (
      delivery_date,
      po_no,
      dv_no,
      coverage_period,
      billing_invoice,
      description,
      payee_supplier_name,
      terms,
      amount,
      net_amount,
      payment_made,
      check_no,
      check_date,
      invoice_no_ref_no,
      date_payment,
      balance_due,
      status,
      remarks,
      created_by_accountant_id
    )
    values (
      p_delivery_date,
      nullif(btrim(p_po_no), ''),
      nullif(btrim(p_dv_no), ''),
      nullif(btrim(p_coverage_period), ''),
      nullif(btrim(p_billing_invoice), ''),
      nullif(btrim(p_description), ''),
      nullif(btrim(p_payee_supplier_name), ''),
      nullif(btrim(p_terms), ''),
      p_amount,
      p_net_amount,
      p_payment_made,
      nullif(btrim(p_check_no), ''),
      nullif(btrim(p_check_date), ''),
      nullif(btrim(p_invoice_no_ref_no), ''),
      nullif(btrim(p_date_payment), ''),
      p_balance_due,
      p_status,
      nullif(btrim(p_remarks), ''),
      accountant_id
    )
    returning id into saved_ledger_id;
  else
    update public.tafi_ap_subsidiary_ledger as ledger
    set delivery_date = p_delivery_date,
        po_no = nullif(btrim(p_po_no), ''),
        dv_no = nullif(btrim(p_dv_no), ''),
        coverage_period = nullif(btrim(p_coverage_period), ''),
        billing_invoice = nullif(btrim(p_billing_invoice), ''),
        description = nullif(btrim(p_description), ''),
        payee_supplier_name = nullif(btrim(p_payee_supplier_name), ''),
        terms = nullif(btrim(p_terms), ''),
        amount = p_amount,
        net_amount = p_net_amount,
        payment_made = p_payment_made,
        check_no = nullif(btrim(p_check_no), ''),
        check_date = nullif(btrim(p_check_date), ''),
        invoice_no_ref_no = nullif(btrim(p_invoice_no_ref_no), ''),
        date_payment = nullif(btrim(p_date_payment), ''),
        balance_due = p_balance_due,
        status = p_status,
        remarks = nullif(btrim(p_remarks), ''),
        updated_at = now()
    where ledger.id = p_ledger_id
    returning ledger.id into saved_ledger_id;

    if not found then
      raise exception 'AP Subsidiary Ledger entry not found';
    end if;
  end if;

  return saved_ledger_id;
end;
$$;

revoke all on function public.accountant_list_ap_subsidiary_ledger(uuid) from public;
revoke all on function public.accountant_save_ap_subsidiary_ledger_entry(
  uuid, uuid, date, text, text, text, text, text, text, text, numeric, numeric,
  numeric, text, text, text, text, numeric, text, text
) from public;

grant execute on function public.accountant_list_ap_subsidiary_ledger(uuid) to anon, authenticated;
grant execute on function public.accountant_save_ap_subsidiary_ledger_entry(
  uuid, uuid, date, text, text, text, text, text, text, text, numeric, numeric,
  numeric, text, text, text, text, numeric, text, text
) to anon, authenticated;

create or replace function public.tafi_admin_list_ap_subsidiary_ledger(
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
  if not exists (
    select 1
    from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

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

create or replace function public.tafi_admin_save_ap_subsidiary_ledger_entry(
  p_session_token uuid,
  p_ledger_id uuid,
  p_delivery_date date,
  p_po_no text,
  p_dv_no text,
  p_coverage_period text,
  p_billing_invoice text,
  p_description text,
  p_payee_supplier_name text,
  p_terms text,
  p_amount numeric,
  p_net_amount numeric,
  p_payment_made numeric,
  p_check_no text,
  p_check_date text,
  p_invoice_no_ref_no text,
  p_date_payment text,
  p_balance_due numeric,
  p_status text,
  p_remarks text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tafi_admin_id uuid;
  saved_ledger_id uuid;
begin
  select admin_session.tafi_admin_id
  into tafi_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'TAFI Admin session is invalid or expired' using errcode = '28000';
  end if;

  if p_status not in ('preparing_check', 'paid', 'check_for_pick_up') then
    raise exception 'Choose a valid AP payment status';
  end if;

  if p_ledger_id is null then
    insert into public.tafi_ap_subsidiary_ledger (
      delivery_date,
      po_no,
      dv_no,
      coverage_period,
      billing_invoice,
      description,
      payee_supplier_name,
      terms,
      amount,
      net_amount,
      payment_made,
      check_no,
      check_date,
      invoice_no_ref_no,
      date_payment,
      balance_due,
      status,
      remarks,
      created_by_tafi_admin_id
    )
    values (
      p_delivery_date,
      nullif(btrim(p_po_no), ''),
      nullif(btrim(p_dv_no), ''),
      nullif(btrim(p_coverage_period), ''),
      nullif(btrim(p_billing_invoice), ''),
      nullif(btrim(p_description), ''),
      nullif(btrim(p_payee_supplier_name), ''),
      nullif(btrim(p_terms), ''),
      p_amount,
      p_net_amount,
      p_payment_made,
      nullif(btrim(p_check_no), ''),
      nullif(btrim(p_check_date), ''),
      nullif(btrim(p_invoice_no_ref_no), ''),
      nullif(btrim(p_date_payment), ''),
      p_balance_due,
      p_status,
      nullif(btrim(p_remarks), ''),
      tafi_admin_id
    )
    returning id into saved_ledger_id;
  else
    update public.tafi_ap_subsidiary_ledger as ledger
    set delivery_date = p_delivery_date,
        po_no = nullif(btrim(p_po_no), ''),
        dv_no = nullif(btrim(p_dv_no), ''),
        coverage_period = nullif(btrim(p_coverage_period), ''),
        billing_invoice = nullif(btrim(p_billing_invoice), ''),
        description = nullif(btrim(p_description), ''),
        payee_supplier_name = nullif(btrim(p_payee_supplier_name), ''),
        terms = nullif(btrim(p_terms), ''),
        amount = p_amount,
        net_amount = p_net_amount,
        payment_made = p_payment_made,
        check_no = nullif(btrim(p_check_no), ''),
        check_date = nullif(btrim(p_check_date), ''),
        invoice_no_ref_no = nullif(btrim(p_invoice_no_ref_no), ''),
        date_payment = nullif(btrim(p_date_payment), ''),
        balance_due = p_balance_due,
        status = p_status,
        remarks = nullif(btrim(p_remarks), ''),
        updated_at = now()
    where ledger.id = p_ledger_id
    returning ledger.id into saved_ledger_id;

    if not found then
      raise exception 'AP Subsidiary Ledger entry not found';
    end if;
  end if;

  return saved_ledger_id;
end;
$$;

revoke all on function public.tafi_admin_list_ap_subsidiary_ledger(uuid) from public;
revoke all on function public.tafi_admin_save_ap_subsidiary_ledger_entry(
  uuid, uuid, date, text, text, text, text, text, text, text, numeric, numeric,
  numeric, text, text, text, text, numeric, text, text
) from public;

grant execute on function public.tafi_admin_list_ap_subsidiary_ledger(uuid) to anon, authenticated;
grant execute on function public.tafi_admin_save_ap_subsidiary_ledger_entry(
  uuid, uuid, date, text, text, text, text, text, text, text, numeric, numeric,
  numeric, text, text, text, text, numeric, text, text
) to anon, authenticated;
