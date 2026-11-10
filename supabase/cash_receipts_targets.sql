-- Run after branch_management.sql and cash_receipts_journal.sql.
begin;

create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  "date" date not null,
  target_sales numeric(14, 2) not null,
  total_gross_sales numeric(14, 2),
  target_vs_achieved numeric(14, 2),
  target_vs_achievement_rate numeric(16, 8),
  sales_variance_percentage numeric(16, 8),
  created_at timestamptz not null default now(),
  unique (branch_id, "date"),
  check (target_sales > 0)
);

alter table public.targets enable row level security;
revoke all on table public.targets from public, anon, authenticated;

create or replace function public.targets_calculate_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."date" is null or new.target_sales is null or new.target_sales <= 0
    or new.target_sales <> round(new.target_sales, 2) then
    raise exception 'Enter a target date and target sales greater than zero with up to two decimal places';
  end if;

  select entry.gross_sales
  into new.total_gross_sales
  from public.cash_receipts_journal as entry
  where entry.branch_id = new.branch_id
    and entry."date" = new."date"
  order by entry.created_at desc, entry.id desc
  limit 1;

  if not found then
    new.total_gross_sales := null;
    new.target_vs_achieved := null;
    new.target_vs_achievement_rate := null;
    new.sales_variance_percentage := null;
  else
    new.target_vs_achieved := new.total_gross_sales - new.target_sales;
    new.target_vs_achievement_rate := new.total_gross_sales / new.target_sales;
    new.sales_variance_percentage := new.target_vs_achieved / new.target_sales;
  end if;
  return new;
end;
$$;

drop trigger if exists targets_calculate_fields on public.targets;
create trigger targets_calculate_fields
before insert or update on public.targets
for each row execute function public.targets_calculate_fields();

create or replace function public.targets_sync_cash_receipts_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.targets as saved_target
    set total_gross_sales = null
    where saved_target.branch_id = old.branch_id
      and saved_target."date" = old."date";
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (old.branch_id, old."date") is distinct from (new.branch_id, new."date") then
    update public.targets as saved_target
    set total_gross_sales = null
    where saved_target.branch_id = old.branch_id
      and saved_target."date" = old."date";
  end if;

  update public.targets as saved_target
  set total_gross_sales = (
    select entry.gross_sales
    from public.cash_receipts_journal as entry
    where entry.branch_id = saved_target.branch_id
      and entry."date" = saved_target."date"
    order by entry.created_at desc, entry.id desc
    limit 1
  )
  where saved_target.branch_id = new.branch_id
    and saved_target."date" = new."date";
  return new;
end;
$$;

drop trigger if exists targets_sync_cash_receipts_fields on public.cash_receipts_journal;
create trigger targets_sync_cash_receipts_fields
after insert or update or delete on public.cash_receipts_journal
for each row execute function public.targets_sync_cash_receipts_fields();

drop function if exists public.branch_admin_create_sales_target(uuid, date, numeric);
drop function if exists public.branch_admin_update_sales_target(uuid, uuid, date, numeric);

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

revoke all on function public.targets_calculate_fields()
  from public, anon, authenticated;
revoke all on function public.targets_sync_cash_receipts_fields()
  from public, anon, authenticated;
revoke all on function public.branch_admin_list_sales_targets(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.branch_admin_list_sales_targets(uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
