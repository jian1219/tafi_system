-- Run after super_admin_guest_accounts.sql and tafi_admin_sales.sql.
begin;

do $$
begin
  if to_regclass('public.guest_session') is null
    or to_regclass('public.branch') is null
    or to_regclass('public.cash_receipts_journal') is null
    or to_regclass('public.targets') is null
    or to_regclass('public.sales_discounts') is null
    or to_regclass('public.daily_summary_crj') is null
    or to_regclass('public.deposit') is null
    or to_regclass('public.gcash_transaction') is null
    or to_regclass('public.food_panda_transaction') is null then
    raise exception 'Install Guest accounts and TAFI Admin Sales migrations first.';
  end if;
end;
$$;

create or replace function public.guest_assert_sales_branch(
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
    from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
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

create or replace function public.guest_list_branch_cash_receipts_journal_entries(
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
  perform public.guest_assert_sales_branch(p_session_token, p_branch_id);
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

create or replace function public.guest_list_branch_sales_targets(
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
  perform public.guest_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid sales target page range';
  end if;

  return query
  select target.*
  from public.targets as target
  where target.branch_id = p_branch_id
  order by target."date" desc, target.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.guest_list_branch_sales_discounts(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.sales_discounts
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.guest_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid sales discount page range';
  end if;

  return query
  select discount.*
  from public.sales_discounts as discount
  where discount.branch_id = p_branch_id
  order by discount."date" desc, discount.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.guest_list_branch_daily_summary_crj(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.daily_summary_crj
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.guest_assert_sales_branch(p_session_token, p_branch_id);
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Cash Receipts Journal summary page range';
  end if;

  return query
  select summary.*
  from public.daily_summary_crj as summary
  where summary.branch_id = p_branch_id
  order by summary."date" desc, summary.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.guest_list_branch_deposits(
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
  perform public.guest_assert_sales_branch(p_session_token, p_branch_id);
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

create or replace function public.guest_list_branch_gcash_transactions(
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
  perform public.guest_assert_sales_branch(p_session_token, p_branch_id);
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

create or replace function public.guest_list_branch_food_panda_transactions(
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
  perform public.guest_assert_sales_branch(p_session_token, p_branch_id);
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

revoke all on function public.guest_assert_sales_branch(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.guest_list_branch_cash_receipts_journal_entries(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.guest_list_branch_sales_targets(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.guest_list_branch_sales_discounts(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.guest_list_branch_daily_summary_crj(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.guest_list_branch_deposits(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.guest_list_branch_gcash_transactions(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.guest_list_branch_food_panda_transactions(uuid, uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.guest_list_branch_cash_receipts_journal_entries(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.guest_list_branch_sales_targets(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.guest_list_branch_sales_discounts(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.guest_list_branch_daily_summary_crj(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.guest_list_branch_deposits(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.guest_list_branch_gcash_transactions(uuid, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.guest_list_branch_food_panda_transactions(uuid, uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
