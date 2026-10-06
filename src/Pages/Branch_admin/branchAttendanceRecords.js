const attendanceStorageKey = 'tafi-daily-attendance'

function readAllAttendance() {
  try {
    const savedAttendance = window.localStorage.getItem(attendanceStorageKey)
    if (!savedAttendance) return {}

    const parsedAttendance = JSON.parse(savedAttendance)
    return parsedAttendance && typeof parsedAttendance === 'object' && !Array.isArray(parsedAttendance)
      ? parsedAttendance
      : {}
  } catch {
    return {}
  }
}

export function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getAttendanceForDate(dateKey) {
  return readAllAttendance()[dateKey] ?? {}
}

export function saveAttendanceForDate(dateKey, attendance) {
  try {
    const allAttendance = readAllAttendance()
    allAttendance[dateKey] = attendance
    window.localStorage.setItem(attendanceStorageKey, JSON.stringify(allAttendance))
    return true
  } catch {
    return false
  }
}