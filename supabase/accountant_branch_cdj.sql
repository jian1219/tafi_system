-- Run after branch_cdj.sql, branch_daily_summary_cdj.sql, branch_inventory.sql,
-- branch_management.sql, and accountant_management.sql.
begin;

create or replace function public.accountant_list_branch_cdj_entries(
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
  if not exists (
    select 1
    from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  if p_branch_id is null or not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;

  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Cash Disbursement Journal page range';
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

create or replace function public.accountant_list_branch_daily_summary_cdj(
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
  if not exists (
    select 1
    from public.accountant_session as accountant_session
    where accountant_session.session_token = p_session_token
      and accountant_session.expires_at > now()
  ) then
    raise exception 'Accountant session is invalid or expired' using errcode = '28000';
  end if;

  if p_branch_id is null or not exists (
    select 1
    from public.branch as branch
    where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;

  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid daily summary page range';
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

revoke all on function public.accountant_list_branch_cdj_entries(uuid, uuid, integer, integer)
  from public;
grant execute on function public.accountant_list_branch_cdj_entries(uuid, uuid, integer, integer)
  to anon, authenticated;
revoke all on function public.accountant_list_branch_daily_summary_cdj(uuid, uuid, integer, integer)
  from public;
grant execute on function public.accountant_list_branch_daily_summary_cdj(uuid, uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
