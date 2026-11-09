-- Run after branch_management.sql.
begin;

create table if not exists public.gcash_transaction (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  "date" date not null,
  gcash_time text,
  reference_no text,
  sales_invoice text,
  amount numeric(14, 2) not null,
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists gcash_transaction_branch_date_idx
  on public.gcash_transaction (branch_id, "date" desc, created_at desc);

alter table public.gcash_transaction enable row level security;
revoke all on table public.gcash_transaction from public, anon, authenticated;

create table if not exists public.food_panda_transaction (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  "date" date not null,
  food_panda text,
  reference_no text,
  sales_invoice_order_slip_no text,
  invoice text,
  amount numeric(14, 2) not null,
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists food_panda_transaction_branch_date_idx
  on public.food_panda_transaction (branch_id, "date" desc, created_at desc);

alter table public.food_panda_transaction enable row level security;
revoke all on table public.food_panda_transaction from public, anon, authenticated;

create or replace function public.branch_admin_create_gcash_transaction(
  p_session_token uuid,
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
  v_branch_id uuid;
  v_transaction_id uuid;
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
  if p_date is null or p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a transaction date and an amount of zero or greater with up to two decimal places';
  end if;

  insert into public.gcash_transaction (
    branch_id, "date", gcash_time, reference_no, sales_invoice, amount, reference
  )
  values (
    v_branch_id, p_date, p_gcash_time, p_reference_no, p_sales_invoice, p_amount, p_reference
  )
  returning id into v_transaction_id;
  return v_transaction_id;
end;
$$;

create or replace function public.branch_admin_list_gcash_transactions(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.gcash_transaction
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
    raise exception 'Invalid GCash transaction page range';
  end if;

  return query
  select transaction_entry.*
  from public.gcash_transaction as transaction_entry
  where transaction_entry.branch_id = v_branch_id
  order by transaction_entry."date" desc, transaction_entry.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.branch_admin_create_food_panda_transaction(
  p_session_token uuid,
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
  v_branch_id uuid;
  v_transaction_id uuid;
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
  if p_date is null or p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a transaction date and an amount of zero or greater with up to two decimal places';
  end if;

  insert into public.food_panda_transaction (
    branch_id, "date", food_panda, reference_no, sales_invoice_order_slip_no, invoice, amount, reference
  )
  values (
    v_branch_id,
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

create or replace function public.branch_admin_list_food_panda_transactions(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.food_panda_transaction
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
    raise exception 'Invalid Food Panda transaction page range';
  end if;

  return query
  select transaction_entry.*
  from public.food_panda_transaction as transaction_entry
  where transaction_entry.branch_id = v_branch_id
  order by transaction_entry."date" desc, transaction_entry.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.branch_admin_create_gcash_transaction(
  uuid, date, text, text, text, numeric, text
) from public, anon, authenticated;
revoke all on function public.branch_admin_list_gcash_transactions(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.branch_admin_create_food_panda_transaction(
  uuid, date, text, text, text, text, numeric, text
) from public, anon, authenticated;
revoke all on function public.branch_admin_list_food_panda_transactions(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.branch_admin_create_gcash_transaction(
  uuid, date, text, text, text, numeric, text
) to anon, authenticated;
grant execute on function public.branch_admin_list_gcash_transactions(uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.branch_admin_create_food_panda_transaction(
  uuid, date, text, text, text, text, numeric, text
) to anon, authenticated;
grant execute on function public.branch_admin_list_food_panda_transactions(uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
