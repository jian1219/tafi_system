-- Run after branch_cdj.sql and branch_daily_summary_cdj.sql.
begin;

do $$
begin
  if to_regclass('public.branch_cdj') is null
    or to_regclass('public.branch_daily_summary_cdj') is null
    or to_regprocedure(
      'public.branch_admin_create_cdj_entry(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric)'
    ) is null
    or to_regprocedure('public.branch_cdj_sync_daily_summary()') is null then
    raise exception 'Install the Branch CDJ and daily summary migrations first.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.branch_cdj'::regclass
      and tgname = 'branch_cdj_sync_daily_summary'
      and not tgisinternal
  ) then
    raise exception 'The Branch CDJ daily summary trigger is missing.';
  end if;
end;
$$;

create or replace function public.branch_admin_create_cdj_entry_with_date(
  p_session_token uuid,
  p_date date,
  p_ref_no text,
  p_disbursement_voucher_no text,
  p_description text,
  p_account_titles text,
  p_payee_supplier text,
  p_tin text,
  p_cash numeric,
  p_bank_transfer numeric,
  p_gcash numeric,
  p_cwt numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  if p_date is null then
    raise exception 'A Cash Disbursement Journal date is required.';
  end if;

  v_entry_id := public.branch_admin_create_cdj_entry(
    p_session_token,
    p_ref_no,
    p_disbursement_voucher_no,
    p_description,
    p_account_titles,
    p_payee_supplier,
    p_tin,
    p_cash,
    p_bank_transfer,
    p_gcash,
    p_cwt
  );

  update public.branch_cdj
  set "date" = p_date
  where id = v_entry_id;

  return v_entry_id;
end;
$$;

revoke all on function public.branch_admin_create_cdj_entry_with_date(
  uuid, date, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.branch_admin_create_cdj_entry_with_date(
  uuid, date, text, text, text, text, text, text, numeric, numeric, numeric, numeric
) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
