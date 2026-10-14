export const statusCodes = {
  present: 'P',
  present_late: 'L',
  absent: 'A',
  maternity_leave: 'ML',
  paternity_leave: 'PL',
  authorized_leave: 'AL',
  birthday_leave: 'BL',
  vl_with_pay: 'VLP',
  vl_without_pay: 'VLwP',
  day_off: 'DAY OFF'
}

export const statusCodeClassNames = {
  P: 'p',
  L: 'l',
  A: 'a',
  ML: 'ml',
  PL: 'pl',
  AL: 'authorized-leave',
  BL: 'bl',
  VLP: 'vlp',
  VLwP: 'vlwp',
  'DAY OFF': 'day-off'
}

export const recordLegend = [
  { className: 'present', label: 'Present (✓)' },
  { className: 'late', label: 'Present (Late)' },
  { className: 'absent', label: 'Absent (A)' },
  { className: 'day-off', label: 'Day off (DAY OFF)' },
  { className: 'vlp', label: 'Vacation leave with pay (VLP)' },
  { className: 'vlwp', label: 'Vacation leave without pay (VLwP)' },
  { className: 'ml', label: 'Maternity leave (ML)' },
  { className: 'pl', label: 'Paternity leave (PL)' },
  { className: 'bl', label: 'Birthday leave (BL)' },
  { className: 'authorized-leave', label: 'Authorized leave (AL)' }
]
