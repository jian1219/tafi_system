begin;

create or replace function public.guest_list_cash_advance_loans(
  p_session_token uuid,
  p_branch_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  advance_date date,
  advance_amount numeric,
  amount_paid numeric,
  balance numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch as branch where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Cash advance history page offset and limit are invalid';
  end if;

  return query
  select loan.id, loan.employee_code, employee.name, loan.advance_date,
    loan.advance_amount, coalesce(payment_totals.amount_paid, 0),
    greatest(loan.advance_amount - coalesce(payment_totals.amount_paid, 0), 0),
    loan.created_at
  from public.branch_employee_cash_advance_loan as loan
  join public.employee as employee
    on employee.branch_id = loan.branch_id
    and employee.employee_code = loan.employee_code
  left join lateral (
    select sum(payment.amount) as amount_paid
    from public.branch_employee_cash_advance_payment as payment
    where payment.advance_id = loan.id
      and payment.branch_id = loan.branch_id
  ) as payment_totals on true
  where loan.branch_id = p_branch_id
  order by loan.advance_date desc, employee.name, loan.created_at desc, loan.id
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.guest_list_cash_advance_payments(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date default null,
  p_period_end date default null,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  advance_id uuid,
  employee_code text,
  period_start date,
  period_end date,
  amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.guest_session as guest_session
    where guest_session.session_token = p_session_token
      and guest_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired Guest session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch as branch where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Cash advance payment page offset and limit are invalid';
  end if;
  if (p_period_start is null) <> (p_period_end is null)
    or (p_period_start is not null and p_period_end < p_period_start) then
    raise exception 'Both cash advance period dates must be provided and valid';
  end if;

  return query
  select payment.id, payment.advance_id, payment.employee_code,
    payment.period_start, payment.period_end, payment.amount
  from public.branch_employee_cash_advance_payment as payment
  where payment.branch_id = p_branch_id
    and (p_period_start is null or payment.period_start >= p_period_start)
    and (p_period_end is null or payment.period_end <= p_period_end)
  order by payment.period_start, payment.employee_code, payment.advance_id
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.guest_list_cash_advance_loans(uuid, uuid, integer, integer) from public;
revoke all on function public.guest_list_cash_advance_payments(uuid, uuid, date, date, integer, integer) from public;

grant execute on function public.guest_list_cash_advance_loans(uuid, uuid, integer, integer) to anon, authenticated;
grant execute on function public.guest_list_cash_advance_payments(uuid, uuid, date, date, integer, integer) to anon, authenticated;

commit;
