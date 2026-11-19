-- Run after branch_employee_contributions.sql.
begin;

do $$
begin
  if to_regclass('public.branch_admin_session') is null
    or to_regclass('public.branch_admin') is null
    or to_regclass('public.branch_employee_cash_advance_loan') is null
    or to_regclass('public.branch_employee_cash_advance_payment') is null then
    raise exception 'Install Branch Admin sessions and cash advance tables first.';
  end if;
end;
$$;

create or replace function public.branch_admin_update_cash_advance_loan_amount(
  p_session_token uuid,
  p_advance_id uuid,
  p_advance_amount numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_amount_paid numeric;
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

  if p_advance_amount is null
    or p_advance_amount <= 0
    or p_advance_amount > 9999999999.99
    or p_advance_amount <> round(p_advance_amount, 2) then
    raise exception 'Cash advance amount must be greater than zero and have no more than two decimal places.';
  end if;

  perform 1
  from public.branch_employee_cash_advance_loan as loan
  where loan.id = p_advance_id
    and loan.branch_id = v_branch_id
    and loan.advance_date <= (now() at time zone 'Asia/Manila')::date
    and loan.advance_date >= (now() at time zone 'Asia/Manila')::date - 3
  for update;

  if not found then
    raise exception 'Cash advance amounts can only be edited within three days of the cash advance date.';
  end if;

  select coalesce(sum(payment.amount), 0)
  into v_amount_paid
  from public.branch_employee_cash_advance_payment as payment
  where payment.advance_id = p_advance_id
    and payment.branch_id = v_branch_id;

  if p_advance_amount < v_amount_paid then
    raise exception 'Cash advance amount cannot be less than the repayments already entered.';
  end if;

  update public.branch_employee_cash_advance_loan as loan
  set advance_amount = p_advance_amount
  where loan.id = p_advance_id
    and loan.branch_id = v_branch_id;
end;
$$;

revoke all on function public.branch_admin_update_cash_advance_loan_amount(uuid, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.branch_admin_update_cash_advance_loan_amount(uuid, uuid, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
