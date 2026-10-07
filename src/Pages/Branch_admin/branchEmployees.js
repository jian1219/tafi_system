import { listBranchEmployees } from '../../lib/supabase'

const statusLabels = {
  not_marked: 'Not marked',
  present: 'Present',
  present_late: 'Present (Late)',
  absent: 'Absent',
  maternity_leave: 'Maternity Leave',
  paternity_leave: 'Paternity Leave',
  authorized_leave: 'Authorized Leave',
  birthday_leave: 'Birthday Leave',
  vl_with_pay: 'VL with Pay',
  vl_without_pay: 'VL without Pay',
  day_off: 'Day Off'
}

export async function getBranchEmployees(sessionToken) {
  const { data, error } = await listBranchEmployees(sessionToken)
  return {
    employees: (data ?? []).map((employee) => ({
      id: employee.employee_code,
      name: employee.name,
      position: employee.employee_position,
      dailyRate: Number(employee.daily_rate),
      todayStatus: statusLabels[employee.today_status] ?? 'Not marked',
      address: employee.address ?? '',
      gender: employee.gender ?? '',
      birthday: employee.birthday ?? '',
      sssNumber: employee.sss_number ?? '',
      pagibigNumber: employee.pagibig_number ?? '',
      philhealthNumber: employee.philhealth_number ?? '',
      employmentClassification: employee.employment_classification ?? ''
    })),
    error
  }
}
