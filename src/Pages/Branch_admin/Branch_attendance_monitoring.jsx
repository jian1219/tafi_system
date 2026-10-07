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
  const [attendanceDateKey] = useState(() => getLocalDateKey(new Date()))
  const date = new Date(`${attendanceDateKey}T12:00:00`)
  const monthStartDate = new Date(date.getFullYear(), date.getMonth(), 1)
  const monthEndDate = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const monthStart = getLocalDateKey(monthStartDate)
  const monthEnd = getLocalDateKey(monthEndDate)
  const daysInMonth = monthEndDate.getDate()
  const sessionToken = branchAdmin?.session_token
  const [employees, setEmployees] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [isLoading, setIsLoading] = useState(Boolean(branchAdmin?.session_token))
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadAttendanceData = async () => {
      const [{ employees: loadedEmployees, error: employeeError }, { data, error: attendanceError }] = await Promise.all([
        getBranchEmployees(sessionToken),
        listBranchAttendance(sessionToken, monthStart, monthEnd)
      ])
      if (!isCurrent) return

      const error = employeeError ?? attendanceError
      if (error) {
        setSaveError(error.message)
        setIsLoading(false)
        return
      }

      const loadedRecords = data ?? []
      const recordsForToday = Object.fromEntries(
        loadedRecords
          .filter((record) => record.attendance_date === attendanceDateKey)
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
  }, [sessionToken, attendanceDateKey, monthStart, monthEnd])

  const monthRecords = useMemo(() => employees.map((employee, index) => {
    const recordsForEmployee = Object.fromEntries(
      attendanceRecords
        .filter((record) => record.employee_code === employee.id)
        .map((record) => [Number(record.attendance_date.slice(-2)), record.status])
    )
    const days = Array.from({ length: daysInMonth }, (_, dayIndex) =>
      statusCodes[recordsForEmployee[dayIndex + 1]] ?? ''
    )
    return { no: index + 1, id: employee.id, days }
  }), [employees, attendanceRecords, daysInMonth])

  const totalPresent = employees.filter((employee) => ['Present', 'Present (Late)'].includes(employee.status)).length
  const totalLate = employees.filter((employee) => employee.status === 'Present (Late)').length
  const totalAbsent = employees.filter((employee) => employee.status === 'Absent').length

  const weeklyRecords = useMemo(() => Array.from(
    { length: Math.ceil(daysInMonth / 7) },
    (_, weekIndex) => {
      const firstDay = weekIndex * 7 + 1
      const lastDay = Math.min(firstDay + 6, daysInMonth)
      const weekAttendance = attendanceRecords.filter((record) => {
        const day = Number(record.attendance_date.slice(-2))
        return day >= firstDay && day <= lastDay
      })
      return {
        range: `Week ${weekIndex + 1}`,
        present: weekAttendance.filter((record) => record.status === 'present').length,
        late: weekAttendance.filter((record) => record.status === 'present_late').length,
        absent: weekAttendance.filter((record) => record.status === 'absent').length
      }
    }
  ), [attendanceRecords, daysInMonth])

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
    const { error } = await saveBranchAttendance(sessionToken, attendanceDateKey, records)
    if (error) {
      setSaveError(error.message)
      setSaveMessage('')
      return
    }

    setAttendanceRecords((current) => [
      ...current.filter((record) => record.attendance_date !== attendanceDateKey),
      ...records.map((record) => ({ ...record, attendance_date: attendanceDateKey }))
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
            <div className="legend-title">Today’s status:</div>
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
              <strong>{totalPresent}</strong>
            </div>
            <div className="summary-box compact late-card">
              <span>Late</span>
              <strong>{totalLate}</strong>
            </div>
            <div className="summary-box compact absent-card">
              <span>Absent</span>
              <strong>{totalAbsent}</strong>
            </div>
          </div>

          <div className="submit-panel">
            <div className="submit-panel-header">
              <h4>Mark attendance for today</h4>
              <span className="date-badge">
                {new Date(`${attendanceDateKey}T12:00:00`).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </span>
            </div>
            <p className="late-deduction-formula">
              Late deduction = daily rate ÷ 8 ÷ 60 × minutes late
            </p>

            <div className="attendance-submit-list">
              {employees.map((employee) => (
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
            {weeklyRecords.map((week) => (
              <div key={week.range} className="weekly-card">
                <div className="week-label">{week.range}</div>
                <div className="week-stat-row">
                  <span>Present</span>
                  <strong>{week.present}</strong>
                </div>
                <div className="week-stat-row">
                  <span>Late</span>
                  <strong>{week.late}</strong>
                </div>
                <div className="week-stat-row">
                  <span>Absent</span>
                  <strong>{week.absent}</strong>
                </div>
              </div>
            ))}
          </div>
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
            <table className="attendance-table">
              <thead>
                <tr>
                  <th rowSpan="2">No.</th>
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
                  <tr><td className="employee-empty-state" colSpan={daysInMonth + 6}>No employees have been added to this branch.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
