export function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getAttendanceRemark(rate) {
  if (rate === 100) return 'Excellent attendance'
  return rate >= 60 ? 'Good attendance' : 'Poor attendance'
}

export function hasEarnedMonthlyCredit(presentDays, monthKey) {
  return presentDays >= (monthKey.endsWith('-02') ? 24 : 26)
}