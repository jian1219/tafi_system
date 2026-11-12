-- Run after branch_management.sql, cash_receipts_journal.sql, and deposit.sql.
begin;

create table if not exists public.daily_summary_crj (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  "date" date not null,
  code text not null,
  total_gross_sales numeric(14, 2) not null default 0,
  contra_sales numeric(14, 2) not null default 0,
  total_noncash_sales numeric(14, 2) not null default 0,
  total_cash_sales numeric(14, 2) not null default 0,
  net_cash_available numeric(14, 2) not null default 0,
  cash_count numeric(14, 2) not null default 0,
  total_cash_deposited numeric(14, 2) not null default 0,
  difference numeric(14, 2) not null default 0,
  remarks text,
  created_at timestamptz not null default now()
);

drop index if exists public.daily_summary_crj_branch_date_idx;
create unique index if not exists daily_summary_crj_branch_date_uidx
  on public.daily_summary_crj (branch_id, "date");

alter table public.daily_summary_crj enable row level security;
revoke all on table public.daily_summary_crj from public, anon, authenticated;

create or replace function public.daily_summary_crj_refresh(
  p_branch_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_branch_id is null or p_date is null then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_branch_id::text),
    hashtext(p_date::text)
  );

  if not exists (
    select 1
    from public.cash_receipts_journal as entry
    where entry.branch_id = p_branch_id
      and entry."date" = p_date
  ) then
    delete from public.daily_summary_crj as summary
    where summary.branch_id = p_branch_id
      and summary."date" = p_date;
    return;
  end if;

  insert into public.daily_summary_crj (
    branch_id,
    "date",
    code,
    total_gross_sales,
    contra_sales,
    total_noncash_sales,
    total_cash_sales,
    net_cash_available,
    cash_count,
    total_cash_deposited,
    difference,
    remarks
  )
  select
    p_branch_id,
    p_date,
    string_agg(entry.si_no, ', ' order by entry.created_at, entry.id),
    coalesce(sum(entry.gross_sales), 0),
    coalesce(sum(entry.discount + entry.returns), 0),
    coalesce(sum(entry.total_noncash_sales), 0),
    coalesce(sum(entry.net_cash_sales), 0),
    coalesce(sum(entry.net_cash_available), 0),
    coalesce(sum(entry.cash_count), 0),
    coalesce((
      select sum(saved_deposit.total_deposit)
      from public.deposit as saved_deposit
      where saved_deposit.branch_id = p_branch_id
        and saved_deposit.date_deposit = p_date
    ), 0),
    coalesce(sum(entry.difference), 0),
    null
  from public.cash_receipts_journal as entry
  where entry.branch_id = p_branch_id
    and entry."date" = p_date
  on conflict (branch_id, "date") do update set
    code = excluded.code,
    total_gross_sales = excluded.total_gross_sales,
    contra_sales = excluded.contra_sales,
    total_noncash_sales = excluded.total_noncash_sales,
    total_cash_sales = excluded.total_cash_sales,
    net_cash_available = excluded.net_cash_available,
    cash_count = excluded.cash_count,
    total_cash_deposited = excluded.total_cash_deposited,
    difference = excluded.difference,
    remarks = excluded.remarks;
end;
$$;

create or replace function public.daily_summary_crj_sync_cash_receipts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.daily_summary_crj_refresh(old.branch_id, old."date");
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (old.branch_id, old."date") is distinct from (new.branch_id, new."date") then
    perform public.daily_summary_crj_refresh(old.branch_id, old."date");
  end if;

  perform public.daily_summary_crj_refresh(new.branch_id, new."date");
  return new;
end;
$$;

drop trigger if exists daily_summary_crj_sync_cash_receipts
  on public.cash_receipts_journal;
create trigger daily_summary_crj_sync_cash_receipts
after insert or update or delete on public.cash_receipts_journal
for each row execute function public.daily_summary_crj_sync_cash_receipts();

create or replace function public.daily_summary_crj_sync_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.daily_summary_crj_refresh(old.branch_id, old.date_deposit);
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (old.branch_id, old.date_deposit) is distinct from (new.branch_id, new.date_deposit) then
    perform public.daily_summary_crj_refresh(old.branch_id, old.date_deposit);
  end if;

  perform public.daily_summary_crj_refresh(new.branch_id, new.date_deposit);
  return new;
end;
$$;

drop trigger if exists daily_summary_crj_sync_deposit on public.deposit;
create trigger daily_summary_crj_sync_deposit
after insert or update or delete on public.deposit
for each row execute function public.daily_summary_crj_sync_deposit();

revoke all on function public.daily_summary_crj_refresh(uuid, date)
  from public, anon, authenticated;
revoke all on function public.daily_summary_crj_sync_cash_receipts()
  from public, anon, authenticated;
revoke all on function public.daily_summary_crj_sync_deposit()
  from public, anon, authenticated;

do $$
declare
  v_branch_id uuid;
  v_date date;
begin
  for v_branch_id, v_date in
    select entry.branch_id, entry."date"
    from public.cash_receipts_journal as entry
    group by entry.branch_id, entry."date"
    union
    select summary.branch_id, summary."date"
    from public.daily_summary_crj as summary
  loop
    perform public.daily_summary_crj_refresh(v_branch_id, v_date);
  end loop;
end;
$$;

create or replace function public.branch_admin_list_daily_summary_crj(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.daily_summary_crj
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
    raise exception 'Invalid Cash Receipts Journal summary page range';
  end if;

  return query
  select summary.*
  from public.daily_summary_crj as summary
  where summary.branch_id = v_branch_id
  order by summary."date" desc, summary.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.branch_admin_list_daily_summary_crj(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.branch_admin_list_daily_summary_crj(uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
