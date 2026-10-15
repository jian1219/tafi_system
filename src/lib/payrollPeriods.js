export function getPayrollPeriods(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return []
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  const periods = []
  let startDay = 1
  let weekNumber = 1

  const addPeriod = (endDay, type) => {
    const dateKey = (day) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const period = {
      index: periods.length,
      type,
      startDay,
      endDay,
      startDate: dateKey(startDay),
      endDate: dateKey(endDay),
      label: type === 'week' ? `Week ${weekNumber}` : `Covered ${startDay}–${endDay}`
    }

    if (type === 'week') {
      period.weekNumber = weekNumber
      weekNumber += 1
    }
    periods.push(period)
    startDay = endDay + 1
  }

  if (firstDayOfWeek !== 0) {
    addPeriod(Math.min(7 - firstDayOfWeek, daysInMonth), 'covered')
  }

  while (startDay + 6 <= daysInMonth) {
    addPeriod(startDay + 6, 'week')
  }

  if (startDay <= daysInMonth) {
    addPeriod(daysInMonth, 'covered')
  }

  return periods
}
