-- Run after branch_cdj.sql.
begin;

create table if not exists public.branch_daily_summary_cdj (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  "date" date not null,
  check_ref_no text not null default '',
  disbursement_voucher_no text not null default '',
  cash numeric(14, 2) not null default 0,
  bank_transfer numeric(14, 2) not null default 0,
  gcash numeric(14, 2) not null default 0,
  cwt numeric(14, 2) not null default 0,
  total numeric(14, 2) generated always as (cash + bank_transfer + gcash + cwt) stored,
  "Accounts Receivable" numeric(14, 2) not null default 0,
  "Advances to Employees" numeric(14, 2) not null default 0,
  "Accounts Payable" numeric(14, 2) not null default 0,
  "Accrued Expenses" numeric(14, 2) not null default 0,
  "Lease Liability" numeric(14, 2) not null default 0,
  "Franchise Payable" numeric(14, 2) not null default 0,
  "VAT/WHHT PAYABLE" numeric(14, 2) not null default 0,
  "Inventory - Tuna" numeric(14, 2) not null default 0,
  "Inventory - Produce" numeric(14, 2) not null default 0,
  "Inventory - Dry Goods" numeric(14, 2) not null default 0,
  "Inventory - Dairy and Chilled Items" numeric(14, 2) not null default 0,
  "Inventory - Packaging Materials" numeric(14, 2) not null default 0,
  "Inventory - Beverages" numeric(14, 2) not null default 0,
  "Inventory - Kitchen Supplies" numeric(14, 2) not null default 0,
  "Inventory - Dining Supplies" numeric(14, 2) not null default 0,
  "Admin Supplies" numeric(14, 2) not null default 0,
  "Counter Supplies" numeric(14, 2) not null default 0,
  "Cleaning Supplies" numeric(14, 2) not null default 0,
  "Kitchen Equipment" numeric(14, 2) not null default 0,
  "Dining Equipment" numeric(14, 2) not null default 0,
  "Office Equipment" numeric(14, 2) not null default 0,
  "Kitchen Furnitures & Fixtures" numeric(14, 2) not null default 0,
  "Office Furnitures & Fixtures" numeric(14, 2) not null default 0,
  "Wages - Service Crews" numeric(14, 2) not null default 0,
  "Franchise Royalty Fees" numeric(14, 2) not null default 0,
  "Advertising Expense" numeric(14, 2) not null default 0,
  "Salaries Expense" numeric(14, 2) not null default 0,
  "Employee Benefit Expense" numeric(14, 2) not null default 0,
  "Travel and Accommodation Expense" numeric(14, 2) not null default 0,
  "Performance Bonus Expense" numeric(14, 2) not null default 0,
  "Human Resource Expense" numeric(14, 2) not null default 0,
  "Professional Fees" numeric(14, 2) not null default 0,
  "SSS Expense" numeric(14, 2) not null default 0,
  "PhilHealth Expense" numeric(14, 2) not null default 0,
  "Pag-Ibig Expense" numeric(14, 2) not null default 0,
  "Rent Expense" numeric(14, 2) not null default 0,
  "Insurance Expense" numeric(14, 2) not null default 0,
  "Utilities Expense" numeric(14, 2) not null default 0,
  "Communication Expenses" numeric(14, 2) not null default 0,
  "Parking Attendant Fee" numeric(14, 2) not null default 0,
  "Garbage Fee" numeric(14, 2) not null default 0,
  "Transportation Expense" numeric(14, 2) not null default 0,
  "Repairs and Maintenance" numeric(14, 2) not null default 0,
  "Bank Charges" numeric(14, 2) not null default 0,
  "Miscellaneous Expenses" numeric(14, 2) not null default 0,
  "Taxes and Licenses" numeric(14, 2) not null default 0,
  "Interest Expense" numeric(14, 2) not null default 0,
  "Income Tax Expense" numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, "date")
);

create index if not exists branch_daily_summary_cdj_branch_date_idx
  on public.branch_daily_summary_cdj (branch_id, "date" desc);

alter table public.branch_daily_summary_cdj enable row level security;
revoke all on table public.branch_daily_summary_cdj from public, anon, authenticated;

create or replace function public.branch_admin_refresh_daily_summary_cdj(
  p_branch_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.branch_cdj as entry
    where entry.branch_id = p_branch_id
      and entry."date" = p_date
  ) then
    delete from public.branch_daily_summary_cdj as summary
    where summary.branch_id = p_branch_id
      and summary."date" = p_date;
    return;
  end if;

  insert into public.branch_daily_summary_cdj (
    branch_id,
    "date",
    cash,
    bank_transfer,
    gcash,
    cwt,
    "Accounts Receivable",
    "Advances to Employees",
    "Accounts Payable",
    "Accrued Expenses",
    "Lease Liability",
    "Franchise Payable",
    "VAT/WHHT PAYABLE",
    "Inventory - Tuna",
    "Inventory - Produce",
    "Inventory - Dry Goods",
    "Inventory - Dairy and Chilled Items",
    "Inventory - Packaging Materials",
    "Inventory - Beverages",
    "Inventory - Kitchen Supplies",
    "Inventory - Dining Supplies",
    "Admin Supplies",
    "Counter Supplies",
    "Cleaning Supplies",
    "Kitchen Equipment",
    "Dining Equipment",
    "Office Equipment",
    "Kitchen Furnitures & Fixtures",
    "Office Furnitures & Fixtures",
    "Wages - Service Crews",
    "Franchise Royalty Fees",
    "Advertising Expense",
    "Salaries Expense",
    "Employee Benefit Expense",
    "Travel and Accommodation Expense",
    "Performance Bonus Expense",
    "Human Resource Expense",
    "Professional Fees",
    "SSS Expense",
    "PhilHealth Expense",
    "Pag-Ibig Expense",
    "Rent Expense",
    "Insurance Expense",
    "Utilities Expense",
    "Communication Expenses",
    "Parking Attendant Fee",
    "Garbage Fee",
    "Transportation Expense",
    "Repairs and Maintenance",
    "Bank Charges",
    "Miscellaneous Expenses",
    "Taxes and Licenses",
    "Interest Expense",
    "Income Tax Expense"
  )
  select p_branch_id,
         p_date,
         coalesce(sum(entry.cash), 0),
         coalesce(sum(entry.bank_transfer), 0),
         coalesce(sum(entry.gcash), 0),
         coalesce(sum(entry.cwt), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Accounts Receivable'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Advances to Employees'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Accounts Payable'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Accrued Expenses'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Lease Liability'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Franchise Payable'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'VAT/WHHT PAYABLE'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Tuna'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Produce'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Dry Goods'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Dairy and Chilled Items'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Packaging Materials'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Beverages'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Kitchen Supplies'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Inventory - Dining Supplies'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Admin Supplies'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Counter Supplies'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Cleaning Supplies'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Kitchen Equipment'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Dining Equipment'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Office Equipment'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Kitchen Furnitures & Fixtures'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Office Furnitures & Fixtures'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Wages - Service Crews'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Franchise Royalty Fees'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Advertising Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Salaries Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Employee Benefit Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Travel and Accommodation Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Performance Bonus Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Human Resource Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Professional Fees'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'SSS Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'PhilHealth Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Pag-Ibig Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Rent Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Insurance Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Utilities Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Communication Expenses'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Parking Attendant Fee'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Garbage Fee'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Transportation Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Repairs and Maintenance'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Bank Charges'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Miscellaneous Expenses'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Taxes and Licenses'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Interest Expense'), 0),
         coalesce(sum(entry.total) filter (where entry.account_titles = 'Income Tax Expense'), 0)
  from public.branch_cdj as entry
  where entry.branch_id = p_branch_id
    and entry."date" = p_date
  on conflict (branch_id, "date") do update
  set cash = excluded.cash,
      bank_transfer = excluded.bank_transfer,
      gcash = excluded.gcash,
      cwt = excluded.cwt,
      "Accounts Receivable" = excluded."Accounts Receivable",
      "Advances to Employees" = excluded."Advances to Employees",
      "Accounts Payable" = excluded."Accounts Payable",
      "Accrued Expenses" = excluded."Accrued Expenses",
      "Lease Liability" = excluded."Lease Liability",
      "Franchise Payable" = excluded."Franchise Payable",
      "VAT/WHHT PAYABLE" = excluded."VAT/WHHT PAYABLE",
      "Inventory - Tuna" = excluded."Inventory - Tuna",
      "Inventory - Produce" = excluded."Inventory - Produce",
      "Inventory - Dry Goods" = excluded."Inventory - Dry Goods",
      "Inventory - Dairy and Chilled Items" = excluded."Inventory - Dairy and Chilled Items",
      "Inventory - Packaging Materials" = excluded."Inventory - Packaging Materials",
      "Inventory - Beverages" = excluded."Inventory - Beverages",
      "Inventory - Kitchen Supplies" = excluded."Inventory - Kitchen Supplies",
      "Inventory - Dining Supplies" = excluded."Inventory - Dining Supplies",
      "Admin Supplies" = excluded."Admin Supplies",
      "Counter Supplies" = excluded."Counter Supplies",
      "Cleaning Supplies" = excluded."Cleaning Supplies",
      "Kitchen Equipment" = excluded."Kitchen Equipment",
      "Dining Equipment" = excluded."Dining Equipment",
      "Office Equipment" = excluded."Office Equipment",
      "Kitchen Furnitures & Fixtures" = excluded."Kitchen Furnitures & Fixtures",
      "Office Furnitures & Fixtures" = excluded."Office Furnitures & Fixtures",
      "Wages - Service Crews" = excluded."Wages - Service Crews",
      "Franchise Royalty Fees" = excluded."Franchise Royalty Fees",
      "Advertising Expense" = excluded."Advertising Expense",
      "Salaries Expense" = excluded."Salaries Expense",
      "Employee Benefit Expense" = excluded."Employee Benefit Expense",
      "Travel and Accommodation Expense" = excluded."Travel and Accommodation Expense",
      "Performance Bonus Expense" = excluded."Performance Bonus Expense",
      "Human Resource Expense" = excluded."Human Resource Expense",
      "Professional Fees" = excluded."Professional Fees",
      "SSS Expense" = excluded."SSS Expense",
      "PhilHealth Expense" = excluded."PhilHealth Expense",
      "Pag-Ibig Expense" = excluded."Pag-Ibig Expense",
      "Rent Expense" = excluded."Rent Expense",
      "Insurance Expense" = excluded."Insurance Expense",
      "Utilities Expense" = excluded."Utilities Expense",
      "Communication Expenses" = excluded."Communication Expenses",
      "Parking Attendant Fee" = excluded."Parking Attendant Fee",
      "Garbage Fee" = excluded."Garbage Fee",
      "Transportation Expense" = excluded."Transportation Expense",
      "Repairs and Maintenance" = excluded."Repairs and Maintenance",
      "Bank Charges" = excluded."Bank Charges",
      "Miscellaneous Expenses" = excluded."Miscellaneous Expenses",
      "Taxes and Licenses" = excluded."Taxes and Licenses",
      "Interest Expense" = excluded."Interest Expense",
      "Income Tax Expense" = excluded."Income Tax Expense",
      updated_at = now();
end;
$$;

create or replace function public.branch_cdj_sync_daily_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.branch_admin_refresh_daily_summary_cdj(old.branch_id, old."date");
    return old;
  end if;

  perform public.branch_admin_refresh_daily_summary_cdj(new.branch_id, new."date");
  if tg_op = 'UPDATE'
    and (old.branch_id is distinct from new.branch_id or old."date" is distinct from new."date") then
    perform public.branch_admin_refresh_daily_summary_cdj(old.branch_id, old."date");
  end if;
  return new;
end;
$$;

drop trigger if exists branch_cdj_sync_daily_summary on public.branch_cdj;
create trigger branch_cdj_sync_daily_summary
after insert or update or delete on public.branch_cdj
for each row execute function public.branch_cdj_sync_daily_summary();

create or replace function public.branch_admin_list_daily_summary_cdj(
  p_session_token uuid,
  p_offset integer,
  p_limit integer
)
returns setof public.branch_daily_summary_cdj
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

  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid daily summary page range';
  end if;

  return query
  select summary.*
  from public.branch_daily_summary_cdj as summary
  where summary.branch_id = v_branch_id
  order by summary."date" desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.branch_admin_update_daily_summary_cdj_refs(
  p_session_token uuid,
  p_date date,
  p_check_ref_no text,
  p_disbursement_voucher_no text
)
returns void
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

  update public.branch_daily_summary_cdj as summary
  set check_ref_no = coalesce(p_check_ref_no, ''),
      disbursement_voucher_no = coalesce(p_disbursement_voucher_no, ''),
      updated_at = now()
  where summary.branch_id = v_branch_id
    and summary."date" = p_date;

  if not found then
    raise exception 'No daily summary exists for the selected date';
  end if;
end;
$$;

revoke all on function public.branch_admin_refresh_daily_summary_cdj(uuid, date)
  from public, anon, authenticated;
revoke all on function public.branch_cdj_sync_daily_summary()
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_daily_summary_cdj(uuid, integer, integer)
  from public;
revoke all on function public.branch_admin_update_daily_summary_cdj_refs(uuid, date, text, text)
  from public;

grant execute on function public.branch_admin_list_daily_summary_cdj(uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.branch_admin_update_daily_summary_cdj_refs(uuid, date, text, text)
  to anon, authenticated;

do $$
declare
  source_day record;
begin
  for source_day in
    select distinct entry.branch_id, entry."date"
    from public.branch_cdj as entry
  loop
    perform public.branch_admin_refresh_daily_summary_cdj(source_day.branch_id, source_day."date");
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
