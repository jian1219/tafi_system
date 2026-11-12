-- Run after branch_management.sql.
begin;

create table if not exists public.sales_discounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  "date" date not null,
  "type" text not null check ("type" in (
    'Senior Citizen',
    'PWD',
    'Eagle''s',
    'Pag-ibig',
    'Loyalty Card'
  )),
  disc_rate numeric(5, 2) generated always as (
    case
      when "type" in ('Senior Citizen', 'PWD') then 20.00
      when "type" in ('Eagle''s', 'Pag-ibig', 'Loyalty Card') then 10.00
    end
  ) stored,
  name text,
  sales_invoice text,
  billing text,
  consigment text,
  gross numeric(14, 2) not null check (gross >= 0),
  customer_count_per_order integer not null check (customer_count_per_order > 0),
  no_person_granted_discount integer not null
    check (no_person_granted_discount >= 0
      and no_person_granted_discount <= customer_count_per_order),
  basis numeric(14, 2) generated always as (
    ((gross / customer_count_per_order) / 1.12) * no_person_granted_discount
  ) stored,
  created_at timestamptz not null default now()
);

create index if not exists sales_discounts_branch_date_idx
  on public.sales_discounts (branch_id, "date" desc, created_at desc);

alter table public.sales_discounts enable row level security;
revoke all on table public.sales_discounts from public, anon, authenticated;

create or replace function public.branch_admin_create_sales_discount(
  p_session_token uuid,
  p_date date,
  p_type text,
  p_name text,
  p_sales_invoice text,
  p_billing text,
  p_consigment text,
  p_gross numeric,
  p_customer_count_per_order integer,
  p_no_person_granted_discount integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_discount_id uuid;
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
  if p_date is null or p_type is null
    or p_type not in ('Senior Citizen', 'PWD', 'Eagle''s', 'Pag-ibig', 'Loyalty Card') then
    raise exception 'Select a valid date and discount type';
  end if;
  if p_gross is null or p_gross < 0 or p_gross <> round(p_gross, 2) then
    raise exception 'Enter a gross amount of zero or greater with up to two decimal places';
  end if;
  if p_customer_count_per_order is null or p_customer_count_per_order < 1
    or p_no_person_granted_discount is null or p_no_person_granted_discount < 0
    or p_no_person_granted_discount > p_customer_count_per_order then
    raise exception 'Enter a customer count greater than zero and a discounted-person count from zero up to the customer count';
  end if;

  insert into public.sales_discounts (
    branch_id,
    "date",
    "type",
    name,
    sales_invoice,
    billing,
    consigment,
    gross,
    customer_count_per_order,
    no_person_granted_discount
  )
  values (
    v_branch_id,
    p_date,
    p_type,
    nullif(btrim(p_name), ''),
    nullif(btrim(p_sales_invoice), ''),
    nullif(btrim(p_billing), ''),
    nullif(btrim(p_consigment), ''),
    p_gross,
    p_customer_count_per_order,
    p_no_person_granted_discount
  )
  returning id into v_discount_id;

  return v_discount_id;
end;
$$;

create or replace function public.branch_admin_list_sales_discounts(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.sales_discounts
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
    raise exception 'Invalid sales discount page range';
  end if;

  return query
  select discount.*
  from public.sales_discounts as discount
  where discount.branch_id = v_branch_id
  order by discount."date" desc, discount.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.branch_admin_create_sales_discount(
  uuid, date, text, text, text, text, text, numeric, integer, integer
) from public, anon, authenticated;
revoke all on function public.branch_admin_list_sales_discounts(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.branch_admin_create_sales_discount(
  uuid, date, text, text, text, text, text, numeric, integer, integer
) to anon, authenticated;
grant execute on function public.branch_admin_list_sales_discounts(uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
