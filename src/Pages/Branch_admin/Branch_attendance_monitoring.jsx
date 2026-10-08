import { useEffect, useMemo, useState } from 'react'
import { listBranchAttendance, saveBranchAttendance } from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const attendanceOptions = [
  'Not marked',
  'Present',
  'Present (Late)',
  'Absent',
  'Maternity Leave',
  'Paternity Leave',
  'Authorized Leave',
  'Birthday Leave',
  'VL with Pay',
  'VL without Pay',
  'Day Off'
]

const statusFromDatabase = {
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

const statusToDatabase = Object.fromEntries(
  Object.entries(statusFromDatabase).map(([databaseStatus, label]) => [label, databaseStatus])
)

const statusCodes = {
  present: 'P',
  present_late: 'L',
  absent: 'A',
  maternity_leave: 'V',
  paternity_leave: 'V',
  authorized_leave: 'V',
  birthday_leave: 'V',
  vl_with_pay: 'V',
  vl_without_pay: 'V',
  day_off: 'O'
}

export default function BranchAttendanceMonitoring({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [activeTab, setActiveTab] = useState('daily')
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0)
  const [attendanceDateKey] = useState(() => getLocalDateKey(new Date()))
  const [dailyAttendanceDateKey, setDailyAttendanceDateKey] = useState(attendanceDateKey)
  const date = new Date(`${attendanceDateKey}T12:00:00`)
  const year = Number(attendanceDateKey.slice(0, 4))
  const monthIndex = Number(attendanceDateKey.slice(5, 7)) - 1
  const monthKey = attendanceDateKey.slice(0, 7)
  const monthStartDate = new Date(year, monthIndex, 1)
  const monthEndDate = new Date(year, monthIndex + 1, 0)
  const monthStart = getLocalDateKey(monthStartDate)
  const monthEnd = getLocalDateKey(monthEndDate)
  const daysInMonth = monthEndDate.getDate()
  const sessionToken = branchAdmin?.session_token
  const selectedAttendanceDate = new Date(`${dailyAttendanceDateKey}T12:00:00`)
  const selectedAttendanceMonthStart = getLocalDateKey(new Date(
    selectedAttendanceDate.getFullYear(),
    selectedAttendanceDate.getMonth(),
    1
  ))
  const selectedAttendanceMonthEnd = getLocalDateKey(new Date(
    selectedAttendanceDate.getFullYear(),
    selectedAttendanceDate.getMonth() + 1,
    0
  ))
  const [employees, setEmployees] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [isLoading, setIsLoading] = useState(Boolean(branchAdmin?.session_token))
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadAttendanceData = async () => {
      const attendanceRequests = selectedAttendanceMonthStart === monthStart
        ? [listBranchAttendance(sessionToken, monthStart, monthEnd)]
        : [
          listBranchAttendance(sessionToken, monthStart, monthEnd),
          listBranchAttendance(sessionToken, selectedAttendanceMonthStart, selectedAttendanceMonthEnd)
        ]
      const [{ employees: loadedEmployees, error: employeeError }, ...attendanceResults] = await Promise.all([
        getBranchEmployees(sessionToken),
        ...attendanceRequests
      ])
      if (!isCurrent) return

      const attendanceError = attendanceResults.find((result) => result.error)?.error
      const error = employeeError ?? attendanceError
      if (error) {
        setSaveError(error.message)
        setEmployees([])
        setIsLoading(false)
        return
      }

      const loadedRecords = [...new Map(
        attendanceResults.flatMap((result) => result.data ?? [])
          .map((record) => [`${record.employee_code}:${record.attendance_date}`, record])
      ).values()]
      const recordsForToday = Object.fromEntries(
        loadedRecords
          .filter((record) => record.attendance_date === dailyAttendanceDateKey)
          .map((record) => [record.employee_code, record])
      )
      setEmployees(loadedEmployees.map((employee) => {
        const record = recordsForToday[employee.id]
        return {
          ...employee,
          status: statusFromDatabase[record?.status] ?? 'Not marked',
          lateMinutes: record?.late_minutes ?? 0
        }
      }))
      setAttendanceRecords(loadedRecords)
      setSaveError('')
      setIsLoading(false)
    }

    if (sessionToken) loadAttendanceData()

    return () => {
      isCurrent = false
    }
  }, [
    sessionToken,
    dailyAttendanceDateKey,
    selectedAttendanceMonthStart,
    selectedAttendanceMonthEnd,
    monthStart,
    monthEnd
  ])

  const monthRecords = useMemo(() => employees.map((employee, index) => {
    const recordsForEmployee = Object.fromEntries(
      attendanceRecords
        .filter((record) =>
          record.employee_code === employee.id
          && record.attendance_date.startsWith(`${monthKey}-`)
        )
        .map((record) => [Number(record.attendance_date.slice(-2)), record.status])
    )
    const days = Array.from({ length: daysInMonth }, (_, dayIndex) =>
      statusCodes[recordsForEmployee[dayIndex + 1]] ?? ''
    )
    return { no: index + 1, id: employee.id, name: employee.name, days }
  }), [employees, attendanceRecords, daysInMonth, monthKey])

  const totalPresent = employees.filter((employee) => ['Present', 'Present (Late)'].includes(employee.status)).length
  const totalLate = employees.filter((employee) => employee.status === 'Present (Late)').length
  const totalAbsent = employees.filter((employee) => employee.status === 'Absent').length

  const weeklyRecords = useMemo(() => {
    const monthDate = new Date(`${attendanceDateKey}T12:00:00`)
    return Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, weekIndex) => {
      const firstDay = weekIndex * 7 + 1
      const lastDay = Math.min(firstDay + 6, daysInMonth)
      const weekDays = Array.from({ length: lastDay - firstDay + 1 }, (_, dayIndex) => {
        const day = firstDay + dayIndex
        return { day, date: new Date(monthDate.getFullYear(), monthDate.getMonth(), day) }
      })
      const weekAttendance = attendanceRecords.filter((record) => {
        const day = Number(record.attendance_date.slice(-2))
        return record.attendance_date.startsWith(`${monthKey}-`)
          && day >= firstDay
          && day <= lastDay
      })
      return {
        label: `Week ${weekIndex + 1}`,
        firstDay,
        lastDay,
        days: weekDays,
        present: weekAttendance.filter((record) => record.status === 'present').length,
        late: weekAttendance.filter((record) => record.status === 'present_late').length,
        absent: weekAttendance.filter((record) => record.status === 'absent').length
      }
    })
  }, [attendanceRecords, attendanceDateKey, daysInMonth, monthKey])

  const selectedWeek = weeklyRecords[selectedWeekIndex] ?? weeklyRecords[0]
  const weeklySummary = selectedWeek ? {
    present: selectedWeek.present,
    late: selectedWeek.late,
    absent: selectedWeek.absent,
    rate: employees.length
      ? Math.round((selectedWeek.present / (employees.length * selectedWeek.days.length)) * 100)
      : 0
  } : { present: 0, late: 0, absent: 0, rate: 0 }

  const updateStatus = (employeeId, status) => {
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === employeeId
          ? { ...employee, status, lateMinutes: status === 'Present (Late)' ? employee.lateMinutes : 0 }
          : employee
      )
    )
  }

  const updateLateMinutes = (employeeId, minutes) => {
    setEmployees((current) =>
      current.map((employee) => employee.id === employeeId
        ? { ...employee, lateMinutes: minutes === '' ? 0 : Math.max(0, Number(minutes)) }
        : employee)
    )
  }

  const getLateDeduction = (employee) => {
    if (!Number.isFinite(employee.dailyRate) || !Number.isInteger(employee.lateMinutes) || employee.lateMinutes < 1) return null
    return (employee.dailyRate / 8 / 60) * employee.lateMinutes
  }

  const formatCurrency = (amount) => amount.toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  })

  const saveAttendance = async () => {
    const incompleteLateEntry = employees.find((employee) =>
      employee.status === 'Present (Late)' && (!Number.isInteger(employee.lateMinutes) || employee.lateMinutes < 1)
    )

    if (incompleteLateEntry) {
      setSaveError(`Enter a whole number of late minutes for ${incompleteLateEntry.name} before saving.`)
      setSaveMessage('')
      return
    }

    const records = employees.map((employee) => ({
      employee_code: employee.id,
      status: statusToDatabase[employee.status] ?? 'not_marked',
      late_minutes: employee.status === 'Present (Late)' ? employee.lateMinutes : 0
    }))
    const { error } = await saveBranchAttendance(sessionToken, dailyAttendanceDateKey, records)
    if (error) {
      setSaveError(error.message)
      setSaveMessage('')
      return
    }

    setAttendanceRecords((current) => [
      ...current.filter((record) => record.attendance_date !== dailyAttendanceDateKey),
      ...records.map((record) => ({ ...record, attendance_date: dailyAttendanceDateKey }))
    ])
    setSaveError('')
    setSaveMessage('Attendance and late minutes saved.')
  }

  const summary = useMemo(() => {
    const total = employees.length
    const present = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'P').length, 0)
    const late = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'L').length, 0)
    const absent = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'A').length, 0)
    const rate = total ? Math.round((present / (total * daysInMonth)) * 100) : 0

    return { present, late, absent, rate }
  }, [employees.length, monthRecords, daysInMonth])

  return (
    <div className="attendance-monitoring-shell">
      <div className="attendance-header-strip">
        <div className="branch-title">{branchName}</div>
      </div>

      <div className="attendance-monitoring-bar">
        <h3>Attendance Monitoring</h3>
      </div>
      {!sessionToken && <p className="payroll-contribution-message error" role="alert">Your login session is missing. Sign out and sign in again after applying the Supabase SQL.</p>}
      {isLoading && <p className="payroll-contribution-message" role="status">Loading employees and attendance…</p>}

      <div className="attendance-monitoring-tabs">
        <button
          type="button"
          className={activeTab === 'daily' ? 'monitoring-tab active' : 'monitoring-tab'}
          onClick={() => setActiveTab('daily')}
        >
          Daily Attendance
        </button>
        <button
          type="button"
          className={activeTab === 'weekly' ? 'monitoring-tab active' : 'monitoring-tab'}
          onClick={() => setActiveTab('weekly')}
        >
          Weekly Records
        </button>
        <button
          type="button"
          className={activeTab === 'monthly' ? 'monitoring-tab active' : 'monitoring-tab'}
          onClick={() => setActiveTab('monthly')}
        >
          All Month Records
        </button>
      </div>

      {activeTab === 'daily' ? (
        <>
          <div className="attendance-legend-box">
            <div className="legend-title">Attendance for selected date:</div>
            <div className="legend-items">
              <span className="legend-item"><i className="legend-box present" /> Present</span>
              <span className="legend-item"><i className="legend-box late" /> Present (Late)</span>
              <span className="legend-item"><i className="legend-box absent" /> Absent</span>
              <span className="legend-item"><i className="legend-box leave" /> Leave</span>
            </div>
          </div>

          <div className="daily-summary-grid">
            <div className="summary-box compact">
              <span>Total Staff</span>
              <strong>{employees.length}</strong>
            </div>
            <div className="summary-box compact present-card">
              <span>Present (incl. late)</span>
              <strong>{isLoading ? '—' : totalPresent}</strong>
            </div>
            <div className="summary-box compact late-card">
              <span>Late</span>
              <strong>{isLoading ? '—' : totalLate}</strong>
            </div>
            <div className="summary-box compact absent-card">
              <span>Absent</span>
              <strong>{isLoading ? '—' : totalAbsent}</strong>
            </div>
          </div>

          <div className="submit-panel">
            <div className="submit-panel-header">
              <h4>
                Mark attendance for {selectedAttendanceDate.toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </h4>
              <label className="attendance-date-control">
                <span>Attendance date</span>
                <input
                  type="date"
                  value={dailyAttendanceDateKey}
                  max={attendanceDateKey}
                  onChange={(event) => {
                    if (!event.target.value) return
                    setIsLoading(true)
                    setDailyAttendanceDateKey(event.target.value)
                    setSaveMessage('')
                    setSaveError('')
                  }}
                />
              </label>
            </div>
            <p className="late-deduction-formula">
              Late deduction = daily rate ÷ 8 ÷ 60 × minutes late
            </p>

            <div className="attendance-submit-list">
              {isLoading ? (
                <p className="payroll-contribution-message" role="status">Loading attendance for the selected date…</p>
              ) : employees.map((employee) => (
                <div className="attendance-row" key={employee.id}>
                  <div className="employee-meta">
                    <div className="employee-avatar">{employee.name.charAt(0)}</div>
                    <div>
                      <strong>{employee.name}</strong>
                      <span>{employee.position}</span>
                    </div>
                  </div>

                  <div className="attendance-row-controls">
                    <select
                      value={employee.status}
                      onChange={(event) => {
                        updateStatus(employee.id, event.target.value)
                        setSaveMessage('')
                        setSaveError('')
                      }}
                      className="status-select"
                    >
                      {attendanceOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    {employee.status === 'Present (Late)' && (
                      <>
                        <label className="late-minutes-field">
                          <span>Minutes late</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={employee.lateMinutes || ''}
                            onChange={(event) => {
                              updateLateMinutes(employee.id, event.target.value)
                              setSaveMessage('')
                              setSaveError('')
                            }}
                            aria-label={`Minutes late for ${employee.name}`}
                          />
                        </label>
                        <div className="late-deduction-value">
                          <span>Deduction</span>
                          <strong>
                            {getLateDeduction(employee) === null
                              ? !Number.isFinite(employee.dailyRate) ? 'Set daily rate' : 'Enter minutes'
                              : formatCurrency(getLateDeduction(employee))}
                          </strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="submit-action-row">
              <div className="attendance-save-feedback">
                {saveError && <span className="attendance-save-error" role="alert">{saveError}</span>}
                {saveMessage && <span className="attendance-save-success" role="status">{saveMessage}</span>}
              </div>
              <button type="button" className="save-button" onClick={saveAttendance} disabled={isLoading || employees.length === 0}>
                Save attendance
              </button>
            </div>
          </div>
        </>
      ) : activeTab === 'weekly' ? (
        <>
          <div className="attendance-legend-box">
            <div className="legend-title">Weekly performance overview:</div>
            <div className="legend-items">
              <span className="legend-item"><i className="legend-box present" /> Present</span>
              <span className="legend-item"><i className="legend-box late" /> Late</span>
              <span className="legend-item"><i className="legend-box absent" /> Absent</span>
            </div>
          </div>

          <div className="weekly-summary-grid">
            {weeklyRecords.map((week, weekIndex) => (
              <button
                key={week.label}
                type="button"
                className={`weekly-card${selectedWeekIndex === weekIndex ? ' selected' : ''}`}
                aria-pressed={selectedWeekIndex === weekIndex}
                onClick={() => setSelectedWeekIndex(weekIndex)}
              >
                <span className="week-label">{week.label}</span>
                <span className="week-date-range">
                  {week.days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {' – '}
                  {week.days[week.days.length - 1].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="week-card-prompt">View this week’s attendance</span>
                <span className="week-stat-row"><span>Present</span><strong>{week.present}</strong></span>
                <span className="week-stat-row"><span>Late</span><strong>{week.late}</strong></span>
                <span className="week-stat-row"><span>Absent</span><strong>{week.absent}</strong></span>
              </button>
            ))}
          </div>

          {selectedWeek && (
            <>
              <div className="monitoring-toolbar">
                <div className="month-select">
                  {selectedWeek.label}: {selectedWeek.days[0].date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                  {' – '}
                  {selectedWeek.days[selectedWeek.days.length - 1].date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="summary-inline">
                  <span>Present: <strong>{weeklySummary.present}</strong></span>
                  <span>Late: <strong>{weeklySummary.late}</strong></span>
                  <span>Absent: <strong>{weeklySummary.absent}</strong></span>
                  <span>Rate: <strong>{weeklySummary.rate}%</strong></span>
                </div>
              </div>

              <div className="attendance-grid-wrap" role="region" aria-label={`${selectedWeek.label} attendance records`} tabIndex="0">
                <table className="attendance-table weekly-attendance-table">
                  <colgroup>
                    <col className="attendance-col-number" />
                    <col className="attendance-col-name" />
                    <col className="attendance-col-id" />
                    {selectedWeek.days.map(({ day }) => <col key={`week-col-${day}`} className="attendance-col-day" />)}
                    <col className="attendance-col-total" />
                    <col className="attendance-col-total" />
                    <col className="attendance-col-total" />
                    <col className="attendance-col-rate" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Employee name</th>
                      <th>Employee ID</th>
                      {selectedWeek.days.map(({ day, date: weekDate }) => (
                        <th
                          key={`week-day-${day}`}
                          title={weekDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        >
                          <span>{weekDate.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                          <strong>{weekDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
                        </th>
                      ))}
                      <th>Total Present</th>
                      <th>Total Late</th>
                      <th>Total Absent</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRecords.map((employee) => {
                      const weekDays = employee.days.slice(selectedWeek.firstDay - 1, selectedWeek.lastDay)
                      const presentCount = weekDays.filter((value) => value === 'P').length
                      const lateCount = weekDays.filter((value) => value === 'L').length
                      const absentCount = weekDays.filter((value) => value === 'A').length
                      const employeeRate = Math.round((presentCount / selectedWeek.days.length) * 100)

                      return (
                        <tr key={employee.id}>
                          <td>{employee.no}</td>
                          <td className="attendance-employee-name">{employee.name}</td>
                          <td>{employee.id}</td>
                          {weekDays.map((value, index) => (
                            <td key={`${employee.id}-week-${index}`} className={`status-cell ${value.toLowerCase()}`}>
                              {value === 'P' ? '✓' : value === 'L' ? '!' : value === 'A' ? 'A' : value === 'V' ? 'V' : value === 'O' ? 'O' : ''}
                            </td>
                          ))}
                          <td>{presentCount}</td>
                          <td>{lateCount}</td>
                          <td>{absentCount}</td>
                          <td>{employeeRate}%</td>
                        </tr>
                      )
                    })}
                    {!isLoading && monthRecords.length === 0 && (
                      <tr><td className="employee-empty-state" colSpan={selectedWeek.days.length + 7}>No employees have been added to this branch.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="attendance-legend-box">
            <div className="legend-title">Monthly record:</div>
            <div className="legend-items">
              <span className="legend-item"><i className="legend-box present" /> Present</span>
              <span className="legend-item"><i className="legend-box late" /> Late</span>
              <span className="legend-item"><i className="legend-box absent" /> Absent</span>
              <span className="legend-item"><i className="legend-box leave" /> Leave</span>
            </div>
          </div>

          <div className="monitoring-toolbar">
            <div className="month-select">{date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <div className="summary-inline">
              <span>Present: <strong>{summary.present}</strong></span>
              <span>Late: <strong>{summary.late}</strong></span>
              <span>Absent: <strong>{summary.absent}</strong></span>
              <span>Rate: <strong>{summary.rate}%</strong></span>
            </div>
          </div>

          <div className="attendance-grid-wrap" role="region" aria-label="Monthly attendance records" tabIndex="0">
            <table className="attendance-table monthly-attendance-table">
              <colgroup>
                <col className="attendance-col-number" />
                <col className="attendance-col-name" />
                <col className="attendance-col-id" />
                {Array.from({ length: daysInMonth }, (_, index) => (
                  <col key={`month-col-${index + 1}`} className="attendance-col-day" />
                ))}
                <col className="attendance-col-total" />
                <col className="attendance-col-total" />
                <col className="attendance-col-total" />
                <col className="attendance-col-rate" />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan="2">No.</th>
                  <th rowSpan="2">Employee name</th>
                  <th rowSpan="2">Employee ID</th>
                  {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
                    <th key={`day-${day}`}>{day}</th>
                  ))}
                  <th rowSpan="2">Total Present</th>
                  <th rowSpan="2">Total Late</th>
                  <th rowSpan="2">Total Absent</th>
                  <th rowSpan="2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {monthRecords.map((employee) => {
                  const presentCount = employee.days.filter((value) => value === 'P').length
                  const lateCount = employee.days.filter((value) => value === 'L').length
                  const absentCount = employee.days.filter((value) => value === 'A').length
                  const employeeRate = Math.round((presentCount / daysInMonth) * 100)

                  return (
                    <tr key={employee.id}>
                      <td>{employee.no}</td>
                      <td className="attendance-employee-name">{employee.name}</td>
                      <td>{employee.id}</td>
                      {employee.days.map((value, index) => (
                        <td key={`${employee.id}-${index}`} className={`status-cell ${value.toLowerCase()}`}>
                          {value === 'P' ? '✓' : value === 'L' ? '!' : value === 'A' ? 'A' : value === 'V' ? 'V' : value === 'O' ? 'O' : ''}
                        </td>
                      ))}
                      <td>{presentCount}</td>
                      <td>{lateCount}</td>
                      <td>{absentCount}</td>
                      <td>{employeeRate}%</td>
                    </tr>
                  )
                })}
                {!isLoading && monthRecords.length === 0 && (
                  <tr><td className="employee-empty-state" colSpan={daysInMonth + 7}>No employees have been added to this branch.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
