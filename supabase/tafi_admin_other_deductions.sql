begin;

-- Run after tafi_complete_schema.sql, tafi_admin_management.sql,
-- branch_employee_contributions.sql, and branch_employee_other_deductions.sql.

alter table public.branch_employee_hdmf_loan
  alter column created_by_branch_admin_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete set null;

alter table public.branch_employee_hdmf_payment
  alter column created_by_branch_admin_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete set null;

alter table public.branch_employee_undertime_deduction
  alter column created_by_branch_admin_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete set null;

alter table public.branch_employee_other_deduction
  alter column created_by_branch_admin_id drop not null,
  add column if not exists created_by_tafi_admin_id uuid
    references public.tafi_admin(id) on delete set null;

create or replace function public.tafi_admin_create_hdmf_loan(
  p_session_token uuid,
  p_branch_id uuid,
  p_employee_code text,
  p_loan_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_loan_id uuid;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or nullif(trim(p_employee_code), '') is null
    or p_loan_amount is null or p_loan_amount <= 0 then
    raise exception 'Choose a branch and employee, then enter an HDMF loan amount greater than zero';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;
  if not exists (
    select 1 from public.employee as employee
    where employee.branch_id = p_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_hdmf_loan (
    branch_id, employee_code, loan_amount, created_by_tafi_admin_id
  )
  values (p_branch_id, trim(p_employee_code), p_loan_amount, v_admin_id)
  returning id into v_loan_id;

  return v_loan_id;
end;
$$;

create or replace function public.tafi_admin_list_hdmf_loans(
  p_session_token uuid,
  p_branch_id uuid
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  loan_amount numeric,
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
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branch as branch where branch.id = p_branch_id
  ) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select loan.id, loan.employee_code, employee.name, loan.loan_amount,
    coalesce(payments.amount_paid, 0),
    greatest(loan.loan_amount - coalesce(payments.amount_paid, 0), 0),
    loan.created_at
  from public.branch_employee_hdmf_loan as loan
  join public.employee as employee
    on employee.branch_id = loan.branch_id
    and employee.employee_code = loan.employee_code
  left join lateral (
    select sum(payment.amount) as amount_paid
    from public.branch_employee_hdmf_payment as payment
    where payment.loan_id = loan.id
      and payment.branch_id = loan.branch_id
  ) as payments on true
  where loan.branch_id = p_branch_id
  order by loan.created_at desc, employee.name, loan.id;
end;
$$;

create or replace function public.tafi_admin_create_hdmf_payment(
  p_session_token uuid,
  p_branch_id uuid,
  p_loan_id uuid,
  p_period_start date,
  p_period_end date,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_loan public.branch_employee_hdmf_loan%rowtype;
  v_amount_paid numeric;
  v_payment_id uuid;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_loan_id is null
    or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start or p_period_end > p_period_start + 6
    or p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid branch, HDMF loan, payroll week, and repayment amount';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  select loan.* into v_loan
  from public.branch_employee_hdmf_loan as loan
  where loan.id = p_loan_id and loan.branch_id = p_branch_id
  for update;
  if not found then
    raise exception 'HDMF loan was not found in this branch';
  end if;

  select coalesce(sum(payment.amount), 0) into v_amount_paid
  from public.branch_employee_hdmf_payment as payment
  where payment.loan_id = v_loan.id and payment.branch_id = p_branch_id;

  if p_amount > v_loan.loan_amount - v_amount_paid then
    raise exception 'Repayment cannot exceed the remaining HDMF loan balance';
  end if;

  insert into public.branch_employee_hdmf_payment (
    branch_id, loan_id, employee_code, period_start, period_end,
    amount, created_by_tafi_admin_id
  )
  values (
    p_branch_id, v_loan.id, v_loan.employee_code, p_period_start, p_period_end,
    p_amount, v_admin_id
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.tafi_admin_list_hdmf_payments(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  id uuid,
  loan_id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'A valid branch and repayment date range are required';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select payment.id, payment.loan_id, payment.employee_code, employee.name,
    payment.period_start, payment.period_end, payment.amount, payment.created_at
  from public.branch_employee_hdmf_payment as payment
  join public.employee as employee
    on employee.branch_id = payment.branch_id
    and employee.employee_code = payment.employee_code
  where payment.branch_id = p_branch_id
    and payment.period_start >= p_period_start
    and payment.period_end <= p_period_end
  order by payment.period_start desc, employee.name, payment.created_at desc;
end;
$$;

create or replace function public.tafi_admin_list_undertime_records(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  undertime_minutes integer,
  amount numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'A valid branch and undertime date range are required';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null
    or p_limit < 1 or p_limit > 500 then
    raise exception 'Undertime deduction page offset and limit are invalid';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select deduction.id, deduction.employee_code, employee.name,
    deduction.period_start, deduction.period_end,
    deduction.undertime_minutes, deduction.amount, deduction.updated_at
  from public.branch_employee_undertime_deduction as deduction
  join public.employee as employee
    on employee.branch_id = deduction.branch_id
    and employee.employee_code = deduction.employee_code
  where deduction.branch_id = p_branch_id
    and deduction.period_start >= p_period_start
    and deduction.period_end <= p_period_end
  order by deduction.period_start, employee.name, deduction.employee_code
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_save_undertime_minutes(
  p_session_token uuid,
  p_branch_id uuid,
  p_employee_code text,
  p_undertime_date date,
  p_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_daily_rate numeric;
  v_amount numeric;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or nullif(trim(p_employee_code), '') is null
    or p_undertime_date is null
    or p_minutes is null or p_minutes < 1 then
    raise exception 'Enter a branch, employee, undertime date, and positive whole number of minutes';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  select employee.daily_rate into v_daily_rate
  from public.employee as employee
  where employee.branch_id = p_branch_id
    and employee.employee_code = trim(p_employee_code)
    and employee.employment_status = 'active';

  if not found then
    raise exception 'Active employee was not found in this branch';
  end if;
  if v_daily_rate is null or v_daily_rate <= 0 then
    raise exception 'The employee must have a valid daily rate before undertime can be calculated';
  end if;

  v_amount := round(v_daily_rate / 8 / 60 * p_minutes, 2);

  insert into public.branch_employee_undertime_deduction (
    branch_id, employee_code, period_start, period_end,
    amount, undertime_minutes, created_by_tafi_admin_id
  )
  values (
    p_branch_id, trim(p_employee_code), p_undertime_date, p_undertime_date,
    v_amount, p_minutes, v_admin_id
  )
  on conflict (branch_id, employee_code, period_start) do update
  set period_end = excluded.period_end,
    amount = excluded.amount,
    undertime_minutes = excluded.undertime_minutes,
    created_by_branch_admin_id = null,
    created_by_tafi_admin_id = excluded.created_by_tafi_admin_id,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.tafi_admin_list_other_deductions(
  p_session_token uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  description text,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tafi_admin_session as admin_session
    where admin_session.session_token = p_session_token
      and admin_session.expires_at > now()
  ) then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null or p_period_start is null or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'A valid branch and deduction date range are required';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null
    or p_limit < 1 or p_limit > 500 then
    raise exception 'Other deduction page offset and limit are invalid';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;

  return query
  select deduction.id, deduction.employee_code, employee.name,
    deduction.period_start, deduction.period_end, deduction.description,
    deduction.amount, deduction.created_at
  from public.branch_employee_other_deduction as deduction
  join public.employee as employee
    on employee.branch_id = deduction.branch_id
    and employee.employee_code = deduction.employee_code
  where deduction.branch_id = p_branch_id
    and deduction.period_start between p_period_start and p_period_end
  order by deduction.period_start desc, employee.name, deduction.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;

create or replace function public.tafi_admin_create_other_deduction(
  p_session_token uuid,
  p_branch_id uuid,
  p_employee_code text,
  p_period_start date,
  p_period_end date,
  p_description text,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_deduction_id uuid;
begin
  select admin_session.tafi_admin_id into v_admin_id
  from public.tafi_admin_session as admin_session
  where admin_session.session_token = p_session_token
    and admin_session.expires_at > now();

  if not found then
    raise exception 'Invalid or expired TAFI Admin session' using errcode = '28000';
  end if;
  if p_branch_id is null
    or nullif(trim(p_employee_code), '') is null
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
    or p_period_end > p_period_start + 6 then
    raise exception 'Choose a valid employee and payroll week';
  end if;
  if nullif(trim(p_description), '') is null or length(trim(p_description)) > 200 then
    raise exception 'Enter a description of up to 200 characters';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Deduction amount must be greater than zero';
  end if;
  if not exists (select 1 from public.branch as branch where branch.id = p_branch_id) then
    raise exception 'Selected branch was not found';
  end if;
  if not exists (
    select 1
    from public.employee as employee
    where employee.branch_id = p_branch_id
      and employee.employee_code = trim(p_employee_code)
      and employee.employment_status = 'active'
  ) then
    raise exception 'Active employee was not found in this branch';
  end if;

  insert into public.branch_employee_other_deduction (
    branch_id, employee_code, period_start, period_end,
    description, amount, created_by_tafi_admin_id
  )
  values (
    p_branch_id, trim(p_employee_code), p_period_start, p_period_end,
    trim(p_description), p_amount, v_admin_id
  )
  returning id into v_deduction_id;

  return v_deduction_id;
end;
$$;

revoke all on function public.tafi_admin_create_hdmf_loan(uuid, uuid, text, numeric) from public;
revoke all on function public.tafi_admin_list_hdmf_loans(uuid, uuid) from public;
revoke all on function public.tafi_admin_create_hdmf_payment(uuid, uuid, uuid, date, date, numeric) from public;
revoke all on function public.tafi_admin_list_hdmf_payments(uuid, uuid, date, date) from public;
revoke all on function public.tafi_admin_list_undertime_records(uuid, uuid, date, date, integer, integer) from public;
revoke all on function public.tafi_admin_save_undertime_minutes(uuid, uuid, text, date, integer) from public;
revoke all on function public.tafi_admin_list_other_deductions(uuid, uuid, date, date, integer, integer) from public;
revoke all on function public.tafi_admin_create_other_deduction(uuid, uuid, text, date, date, text, numeric) from public;

grant execute on function public.tafi_admin_create_hdmf_loan(uuid, uuid, text, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_hdmf_loans(uuid, uuid) to anon, authenticated;
grant execute on function public.tafi_admin_create_hdmf_payment(uuid, uuid, uuid, date, date, numeric) to anon, authenticated;
grant execute on function public.tafi_admin_list_hdmf_payments(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.tafi_admin_list_undertime_records(uuid, uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.tafi_admin_save_undertime_minutes(uuid, uuid, text, date, integer) to anon, authenticated;
grant execute on function public.tafi_admin_list_other_deductions(uuid, uuid, date, date, integer, integer) to anon, authenticated;
grant execute on function public.tafi_admin_create_other_deduction(uuid, uuid, text, date, date, text, numeric) to anon, authenticated;

commit;
