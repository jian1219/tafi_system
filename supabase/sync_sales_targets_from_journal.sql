-- Run after cash_receipts_journal.sql, cash_receipts_targets.sql, and tafi_admin_sales.sql.
-- Targets are derived from matching Cash Receipts Journal dates:
-- TAFI Admin enters target_sales; gross_sales supplies total_gross_sales.
begin;

drop trigger if exists cash_receipts_journal_apply_recurring_target
  on public.cash_receipts_journal;
drop function if exists public.cash_receipts_journal_apply_recurring_target();
drop function if exists public.tafi_admin_get_branch_recurring_sales_target(uuid, uuid);
drop function if exists public.tafi_admin_set_branch_recurring_sales_target(uuid, uuid, numeric);

drop trigger if exists targets_sync_cash_receipts_fields on public.cash_receipts_journal;
drop function if exists public.targets_sync_cash_receipts_fields();

drop table if exists public.branch_recurring_sales_target;

alter table public.targets alter column target_sales drop not null;

do $$
declare
  target_constraint record;
begin
  for target_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.targets'::regclass
      and constraint_row.contype = 'c'
      and pg_catalog.strpos(
        pg_catalog.pg_get_constraintdef(constraint_row.oid),
        'target_sales'
      ) > 0
  loop
    execute pg_catalog.format(
      'alter table public.targets drop constraint %I',
      target_constraint.conname
    );
  end loop;

  alter table public.targets
    add constraint targets_target_sales_nonnegative_check
    check (target_sales is null or target_sales >= 0);
end;
$$;

create or replace function public.targets_calculate_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_count bigint;
  v_total_gross_sales numeric;
begin
  if new.branch_id is null or new."date" is null then
    raise exception 'A branch and target date are required';
  end if;

  select count(*), coalesce(sum(entry.gross_sales), 0)
  into v_entry_count, v_total_gross_sales
  from public.cash_receipts_journal as entry
  where entry.branch_id = new.branch_id
    and entry."date" = new."date";

  if v_entry_count = 0 then
    new.total_gross_sales := null;
    new.target_vs_achieved := null;
    new.target_vs_achievement_rate := null;
    new.sales_variance_percentage := null;
    return new;
  end if;

  new.total_gross_sales := v_total_gross_sales;
  if new.target_sales is null then
    new.target_vs_achieved := null;
    new.target_vs_achievement_rate := null;
    new.sales_variance_percentage := null;
    return new;
  end if;

  new.target_vs_achieved := new.total_gross_sales - new.target_sales;
  if new.target_sales = 0 then
    new.target_vs_achievement_rate := null;
    new.sales_variance_percentage := null;
  else
    new.target_vs_achievement_rate := new.total_gross_sales / new.target_sales;
    new.sales_variance_percentage := new.target_vs_achieved / new.target_sales;
  end if;
  return new;
end;
$$;

create or replace function public.targets_refresh_from_cash_receipts(
  p_branch_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_count bigint;
  v_target_sales numeric;
begin
  if p_branch_id is null or p_date is null then
    raise exception 'A branch and target date are required';
  end if;

  select count(*)
  into v_entry_count
  from public.cash_receipts_journal as entry
  where entry.branch_id = p_branch_id
    and entry."date" = p_date;

  select saved_target.target_sales
  into v_target_sales
  from public.targets as saved_target
  where saved_target.branch_id = p_branch_id
    and saved_target."date" <= p_date
    and saved_target.target_sales is not null
  order by saved_target."date" desc
  limit 1;

  if v_entry_count = 0 then
    delete from public.targets as saved_target
    where saved_target.branch_id = p_branch_id
      and saved_target."date" = p_date
      and saved_target.target_sales is null;
    update public.targets as saved_target
    set target_sales = saved_target.target_sales
    where saved_target.branch_id = p_branch_id
      and saved_target."date" = p_date
      and saved_target.target_sales is not null;
    return;
  end if;

  insert into public.targets as saved_target (branch_id, "date", target_sales)
  values (p_branch_id, p_date, v_target_sales)
  on conflict (branch_id, "date")
  do update set target_sales = coalesce(saved_target.target_sales, excluded.target_sales);
end;
$$;

create or replace function public.cash_receipts_journal_sync_targets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.targets_refresh_from_cash_receipts(old.branch_id, old."date");
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (old.branch_id, old."date") is distinct from (new.branch_id, new."date") then
    perform public.targets_refresh_from_cash_receipts(old.branch_id, old."date");
  end if;

  perform public.targets_refresh_from_cash_receipts(new.branch_id, new."date");
  return new;
end;
$$;

drop trigger if exists cash_receipts_journal_sync_targets on public.cash_receipts_journal;
create trigger cash_receipts_journal_sync_targets
after insert or update or delete on public.cash_receipts_journal
for each row execute function public.cash_receipts_journal_sync_targets();

update public.targets as saved_target
set target_sales = coalesce(
  saved_target.target_sales,
  (
    select earlier_target.target_sales
    from public.targets as earlier_target
    where earlier_target.branch_id = saved_target.branch_id
      and earlier_target."date" < saved_target."date"
      and earlier_target.target_sales is not null
    order by earlier_target."date" desc
    limit 1
  )
);

insert into public.targets as saved_target (branch_id, "date", target_sales)
select entry.branch_id,
  entry."date",
  (
    select earlier_target.target_sales
    from public.targets as earlier_target
    where earlier_target.branch_id = entry.branch_id
      and earlier_target."date" <= entry."date"
      and earlier_target.target_sales is not null
    order by earlier_target."date" desc
    limit 1
  )
from public.cash_receipts_journal as entry
group by entry.branch_id, entry."date"
on conflict (branch_id, "date")
do update set target_sales = coalesce(saved_target.target_sales, excluded.target_sales);

create or replace function public.branch_admin_list_sales_targets(
  p_session_token uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof public.targets
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
    raise exception 'Invalid sales target page range';
  end if;

  return query
  select saved_target.*
  from public.targets as saved_target
  where saved_target.branch_id = v_branch_id
  order by saved_target."date" desc, saved_target.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_set_branch_sales_target(
  p_session_token uuid,
  p_branch_id uuid,
  p_date date,
  p_target_sales numeric
)
returns setof public.targets
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tafi_admin_assert_sales_admin_branch(p_session_token, p_branch_id);
  if p_date is null or p_target_sales is null or p_target_sales < 0
    or p_target_sales <> round(p_target_sales, 2) then
    raise exception 'Enter a target date and target sales of zero or greater with up to two decimal places';
  end if;

  insert into public.targets (branch_id, "date", target_sales)
  values (p_branch_id, p_date, p_target_sales)
  on conflict (branch_id, "date")
  do update set target_sales = excluded.target_sales;

  update public.targets as saved_target
  set target_sales = p_target_sales
  where saved_target.branch_id = p_branch_id
    and saved_target."date" > p_date;

  return query
  select saved_target.*
  from public.targets as saved_target
  where saved_target.branch_id = p_branch_id
    and saved_target."date" = p_date;
end;
$$;

revoke all on function public.targets_calculate_fields()
  from public, anon, authenticated;
revoke all on function public.targets_refresh_from_cash_receipts(uuid, date)
  from public, anon, authenticated;
revoke all on function public.cash_receipts_journal_sync_targets()
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_sales_targets(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.tafi_admin_set_branch_sales_target(uuid, uuid, date, numeric)
  from public, anon, authenticated;
grant execute on function public.branch_admin_list_sales_targets(uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.tafi_admin_set_branch_sales_target(uuid, uuid, date, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
