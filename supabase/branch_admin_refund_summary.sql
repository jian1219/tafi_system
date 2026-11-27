-- Run after branch_management.sql.
begin;

create table if not exists public.refund_summary (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  "date" date not null default ((now() at time zone 'Asia/Manila')::date),
  refund_replacement text not null,
  refund_replacement_slip_no text not null,
  qty integer not null check (qty > 0),
  replacement_item text not null,
  total_refund numeric(14, 2) not null check (total_refund >= 0),
  reason_for_refund_replacement text not null check (
    reason_for_refund_replacement in (
      'Spoiled / Expired',
      'Undercooked / Overcooked / Off-flavor',
      'Customer Change Mind',
      'Wrong Order'
    )
  ),
  remarks text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists refund_summary_branch_date_idx
  on public.refund_summary (branch_id, "date" desc, created_at desc);

alter table public.refund_summary enable row level security;
revoke all on table public.refund_summary from public, anon, authenticated;

create or replace function public.branch_admin_create_refund_summary(
  p_session_token uuid,
  p_date date,
  p_refund_replacement text,
  p_refund_replacement_slip_no text,
  p_qty integer,
  p_replacement_item text,
  p_total_refund numeric,
  p_reason_for_refund_replacement text,
  p_remarks text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_entry_id uuid;
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

  if p_date is null then
    raise exception 'Select a date for the refund or replacement.';
  end if;
  if nullif(btrim(p_refund_replacement), '') is null
    or nullif(btrim(p_refund_replacement_slip_no), '') is null
    or nullif(btrim(p_replacement_item), '') is null then
    raise exception 'Refund / Replacement, Slip No., and Replacement Item are required.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be a whole number greater than zero.';
  end if;
  if p_total_refund is null or p_total_refund < 0
    or p_total_refund::text in ('NaN', 'Infinity', '-Infinity')
    or p_total_refund <> round(p_total_refund, 2) then
    raise exception 'Total Refund must be a valid amount with no more than two decimal places.';
  end if;
  if p_reason_for_refund_replacement is null
    or p_reason_for_refund_replacement not in (
      'Spoiled / Expired',
      'Undercooked / Overcooked / Off-flavor',
      'Customer Change Mind',
      'Wrong Order'
    ) then
    raise exception 'Select a valid refund or replacement reason.';
  end if;

  insert into public.refund_summary (
    branch_id,
    "date",
    refund_replacement,
    refund_replacement_slip_no,
    qty,
    replacement_item,
    total_refund,
    reason_for_refund_replacement,
    remarks
  )
  values (
    v_branch_id,
    p_date,
    btrim(p_refund_replacement),
    btrim(p_refund_replacement_slip_no),
    p_qty,
    btrim(p_replacement_item),
    p_total_refund,
    p_reason_for_refund_replacement,
    coalesce(btrim(p_remarks), '')
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.branch_admin_update_refund_summary(
  p_session_token uuid,
  p_entry_id uuid,
  p_date date,
  p_refund_replacement text,
  p_refund_replacement_slip_no text,
  p_qty integer,
  p_replacement_item text,
  p_total_refund numeric,
  p_reason_for_refund_replacement text,
  p_remarks text
)
returns boolean
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
  if p_entry_id is null or p_date is null then
    raise exception 'A valid refund / replacement entry and date are required.';
  end if;
  if nullif(btrim(p_refund_replacement), '') is null
    or nullif(btrim(p_refund_replacement_slip_no), '') is null
    or nullif(btrim(p_replacement_item), '') is null then
    raise exception 'Refund / Replacement, Slip No., and Replacement Item are required.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be a whole number greater than zero.';
  end if;
  if p_total_refund is null or p_total_refund < 0
    or p_total_refund::text in ('NaN', 'Infinity', '-Infinity')
    or p_total_refund <> round(p_total_refund, 2) then
    raise exception 'Total Refund must be a valid amount with no more than two decimal places.';
  end if;
  if p_reason_for_refund_replacement is null
    or p_reason_for_refund_replacement not in (
      'Spoiled / Expired',
      'Undercooked / Overcooked / Off-flavor',
      'Customer Change Mind',
      'Wrong Order'
    ) then
    raise exception 'Select a valid refund or replacement reason.';
  end if;

  update public.refund_summary as entry
  set "date" = p_date,
      refund_replacement = btrim(p_refund_replacement),
      refund_replacement_slip_no = btrim(p_refund_replacement_slip_no),
      qty = p_qty,
      replacement_item = btrim(p_replacement_item),
      total_refund = p_total_refund,
      reason_for_refund_replacement = p_reason_for_refund_replacement,
      remarks = coalesce(btrim(p_remarks), '')
  where entry.id = p_entry_id
    and entry.branch_id = v_branch_id;

  if not found then
    raise exception 'Refund / replacement entry was not found for this branch.';
  end if;

  return true;
end;
$$;

create or replace function public.branch_admin_delete_refund_summary(
  p_session_token uuid,
  p_entry_id uuid
)
returns boolean
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
  if p_entry_id is null then
    raise exception 'A refund / replacement entry is required.';
  end if;

  delete from public.refund_summary as entry
  where entry.id = p_entry_id
    and entry.branch_id = v_branch_id;

  if not found then
    raise exception 'Refund / replacement entry was not found for this branch.';
  end if;

  return true;
end;
$$;

create or replace function public.branch_admin_list_refund_summary(
  p_session_token uuid,
  p_offset integer,
  p_limit integer
)
returns table (
  id uuid,
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
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid refund summary page range.';
  end if;

  return query
  select entry.id,
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
  where entry.branch_id = v_branch_id
  order by entry."date" desc, entry.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.branch_admin_create_refund_summary(
  uuid, date, text, text, integer, text, numeric, text, text
) from public;
revoke all on function public.branch_admin_update_refund_summary(
  uuid, uuid, date, text, text, integer, text, numeric, text, text
) from public;
revoke all on function public.branch_admin_delete_refund_summary(uuid, uuid) from public;
revoke all on function public.branch_admin_list_refund_summary(uuid, integer, integer) from public;

grant execute on function public.branch_admin_create_refund_summary(
  uuid, date, text, text, integer, text, numeric, text, text
) to anon, authenticated;
grant execute on function public.branch_admin_update_refund_summary(
  uuid, uuid, date, text, text, integer, text, numeric, text, text
) to anon, authenticated;
grant execute on function public.branch_admin_delete_refund_summary(uuid, uuid)
  to anon, authenticated;
grant execute on function public.branch_admin_list_refund_summary(uuid, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
