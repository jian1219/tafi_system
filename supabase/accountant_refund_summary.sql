-- Run after branch_admin_refund_summary.sql and accountant_management.sql.
begin;

create or replace function public.accountant_list_branch_refund_summary(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer,
  p_limit integer
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  "date" date,
  refund_replacement text,
  refund_replacement_slip_no text,
  qty integer,
  replacement_item text,
  total_refund numeric,
  reason_for_refund_replacement text,
  remarks text,
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
    select 1 from public.branch as branch where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found.';
  end if;
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid refund summary page range.';
  end if;

  return query
  select entry.id,
         entry.branch_id,
         branch.name,
         entry."date",
         entry.refund_replacement,
         entry.refund_replacement_slip_no,
         entry.qty,
         entry.replacement_item,
         entry.total_refund,
         entry.reason_for_refund_replacement,
         entry.remarks,
         entry.created_at
  from public.refund_summary as entry
  join public.branch as branch
    on branch.id = entry.branch_id
  where entry.branch_id = p_branch_id
  order by entry."date" desc, entry.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.accountant_list_branch_refund_summary(
  uuid, uuid, integer, integer
) from public;
grant execute on function public.accountant_list_branch_refund_summary(
  uuid, uuid, integer, integer
) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
