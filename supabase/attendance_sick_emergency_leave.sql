begin;

alter table public.employee_attendance
  drop constraint if exists employee_attendance_status_check;

alter table public.employee_attendance
  add constraint employee_attendance_status_check
  check (status in (
    'not_marked',
    'present',
    'present_late',
    'half_day',
    'absent',
    'maternity_leave',
    'paternity_leave',
    'authorized_leave',
    'birthday_leave',
    'sick_leave',
    'emergency_leave',
    'vl_with_pay',
    'vl_without_pay',
    'day_off'
  ));

do $$
declare
  v_function regprocedure;
  v_definition text;
  v_old_statuses constant text :=
    '''birthday_leave'', ''vl_with_pay'', ''vl_without_pay'', ''day_off''';
  v_new_statuses constant text :=
    '''birthday_leave'', ''sick_leave'', ''emergency_leave'', ''vl_with_pay'', ''vl_without_pay'', ''day_off''';
begin
  foreach v_function in array array[
    'public.branch_admin_save_attendance(uuid,date,jsonb)'::regprocedure,
    'public.tafi_admin_save_attendance(uuid,uuid,date,jsonb)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_function);
    if position(v_old_statuses in v_definition) > 0 then
      execute replace(v_definition, v_old_statuses, v_new_statuses);
    elsif position(v_new_statuses in v_definition) = 0 then
      raise exception 'Attendance validation is not in the expected format for %', v_function;
    end if;
  end loop;
end;
$$;

commit;
