-- Run after accountant_management.sql, branch_stock_requests.sql, and
-- tafi_stock_request_preparation.sql.
begin;

do $$
begin
  if to_regclass('public.accountant_session') is null
    or to_regclass('public.branch_stock_requests') is null
    or to_regclass('public.branch') is null then
    raise exception 'Install the Accountant and stock request migrations first.';
  end if;
end;
$$;

create or replace function public.accountant_list_pending_stock_request_branches(
  p_session_token uuid
)
returns table (
  branch_id uuid,
  branch_name text,
  request_count bigint,
  latest_request_at timestamptz
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
  select branch.id,
         branch.name,
         count(request.id),
         max(request.created_at)
  from public.branch_stock_requests as request
  join public.branch as branch
    on branch.id = request.branch_id
  where request.status = 'pending'
  group by branch.id, branch.name
  order by max(request.created_at) desc, branch.name;
end;
$$;

revoke all on function public.accountant_list_pending_stock_request_branches(uuid) from public;
grant execute on function public.accountant_list_pending_stock_request_branches(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
