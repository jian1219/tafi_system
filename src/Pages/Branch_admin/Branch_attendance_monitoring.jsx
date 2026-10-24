import { useEffect, useMemo, useState } from 'react'
import {
  listBranchAttendance,
  getBranchAttendancePeriodControl,
  listBranchOvertimeHours,
  listBranchUndertimeDeductions,
  requestBranchAttendancePeriodUnlock,
  saveBranchAttendance
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import {
  getAttendanceDayValue,
  getAttendanceRemark,
  getLocalDateKey,
  hasEarnedMonthlyCredit
} from './branchAttendanceRecords'
import { getPayrollPeriods } from '../../lib/payrollPeriods'
import { recordLegend, statusCodeClassNames, statusCodes } from '../attendanceStatusDisplay'

const attendanceOptions = [
  'Not marked',
  'Present',
  'Present (Late)',
  'Half Day',
  'Absent',
  'Maternity Leave',
  'Paternity Leave',
  'Authorized Leave',
  'Birthday Leave',
  'Sick Leave',
  'Emergency Leave',
  'Leave with Pay',
  'VL without Pay',
  'Day Off'
]

const shiftOptions = [
  '9am-2pm | 6pm-9pm',
  '11am-4pm | 6pm-9pm',
  '1pm-9pm'
]

const shiftEligibleStatuses = ['Present', 'Present (Late)', 'Half Day']

const statusFromDatabase = {
  not_marked: 'Not marked',
  present: 'Present',
  present_late: 'Present (Late)',
  half_day: 'Half Day',
  absent: 'Absent',
  maternity_leave: 'Maternity Leave',
  paternity_leave: 'Paternity Leave',
  authorized_leave: 'Authorized Leave',
  birthday_leave: 'Birthday Leave',
  sick_leave: 'Sick Leave',
  emergency_leave: 'Emergency Leave',
  vl_with_pay: 'Leave with Pay',
  vl_without_pay: 'VL without Pay',
  day_off: 'Day Off'
}

const statusToDatabase = Object.fromEntries(
  Object.entries(statusFromDatabase).map(([databaseStatus, label]) => [label, databaseStatus])
)

export default function BranchAttendanceMonitoring({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [activeTab, setActiveTab] = useState('daily')
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0)
  const [attendanceDateKey] = useState(() => getLocalDateKey(new Date()))
  const [dailyAttendanceDateKey, setDailyAttendanceDateKey] = useState(attendanceDateKey)
  const [selectedRecordsMonth, setSelectedRecordsMonth] = useState(() => attendanceDateKey.slice(0, 7))
  const recordsYear = Number(selectedRecordsMonth.slice(0, 4))
  const recordsMonthIndex = Number(selectedRecordsMonth.slice(5, 7)) - 1
  const recordsMonthStartDate = new Date(recordsYear, recordsMonthIndex, 1)
  const recordsMonthEndDate = new Date(recordsYear, recordsMonthIndex + 1, 0)
  const monthKey = selectedRecordsMonth
  const monthStart = getLocalDateKey(recordsMonthStartDate)
  const monthEnd = getLocalDateKey(recordsMonthEndDate)
  const daysInMonth = recordsMonthEndDate.getDate()
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
  const [overtimeRecords, setOvertimeRecords] = useState([])
  const [undertimeRecords, setUndertimeRecords] = useState([])
  const [monthlyMetricsError, setMonthlyMetricsError] = useState('')
  const [isLoading, setIsLoading] = useState(Boolean(branchAdmin?.session_token))
  const [attendancePeriodControl, setAttendancePeriodControl] = useState(null)
  const [isLoadingPeriodControl, setIsLoadingPeriodControl] = useState(Boolean(sessionToken))
  const [isRequestingUnlock, setIsRequestingUnlock] = useState(false)
  const [periodControlError, setPeriodControlError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const isAttendancePeriodLocked = attendancePeriodControl?.is_locked === true
  const hasPendingUnlockRequest = Boolean(attendancePeriodControl?.pending_request_id)

  useEffect(() => {
    let isCurrent = true

    const loadAttendanceData = async () => {
      const attendanceMonths = new Map([
        [monthStart, monthEnd],
        [selectedAttendanceMonthStart, selectedAttendanceMonthEnd]
      ])
      const attendanceRequests = [...attendanceMonths].map(([start, end]) =>
        listBranchAttendance(sessionToken, start, end)
      )
      const [employeeResult, ...remainingResults] = await Promise.all([
        getBranchEmployees(sessionToken),
        ...attendanceRequests,
        listBranchOvertimeHours(sessionToken, monthStart, monthEnd),
        listBranchUndertimeDeductions(sessionToken, monthStart, monthEnd)
      ])
      if (!isCurrent) return

      const attendanceResults = remainingResults.slice(0, attendanceRequests.length)
      const overtimeResult = remainingResults[attendanceRequests.length]
      const undertimeResult = remainingResults[attendanceRequests.length + 1]
      const { employees: loadedEmployees, error: employeeError } = employeeResult
      const attendanceError = attendanceResults.find((result) => result.error)?.error
      const error = employeeError ?? attendanceError

      if (error) {
        setSaveError(error.message)
        setEmployees([])
        setIsLoading(false)
        return
      }

      const metricErrors = [overtimeResult.error, undertimeResult.error].filter(Boolean)
      setMonthlyMetricsError(metricErrors.map((metricError) => metricError.message).join(' '))
      setOvertimeRecords(overtimeResult.error ? null : overtimeResult.data ?? [])
      setUndertimeRecords(undertimeResult.error ? null : undertimeResult.data ?? [])
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
          shift: shiftEligibleStatuses.includes(statusFromDatabase[record?.status]) ? record?.shift ?? '' : '',
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

  useEffect(() => {
    if (!sessionToken) return undefined

    let isCurrent = true
    const loadPeriodControl = async () => {
      setIsLoadingPeriodControl(true)
      setPeriodControlError('')
      const { data, error } = await getBranchAttendancePeriodControl(
        sessionToken,
        dailyAttendanceDateKey
      )
      if (!isCurrent) return

      if (error) {
        setAttendancePeriodControl(null)
        setPeriodControlError(error.message)
      } else {
        setAttendancePeriodControl(data)
      }
      setIsLoadingPeriodControl(false)
    }

    loadPeriodControl()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, dailyAttendanceDateKey])

  const monthRecords = useMemo(() => employees.map((employee, index) => {
    const recordsForEmployee = new Map(
      attendanceRecords
        .filter((record) =>
          record.employee_code === employee.id
          && record.attendance_date.startsWith(`${monthKey}-`)
        )
        .map((record) => [Number(record.attendance_date.slice(-2)), record])
    )
    const days = Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const record = recordsForEmployee.get(dayIndex + 1)
      return statusCodes[record?.status] ?? ''
    })
    const lateMinutesByDay = Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const record = recordsForEmployee.get(dayIndex + 1)
      return record?.status === 'present_late' ? Number(record.late_minutes) || 0 : 0
    })
    const lateMinutes = [...recordsForEmployee.values()].reduce(
      (total, record) => total + (record.status === 'present_late' ? Number(record.late_minutes) || 0 : 0),
      0
    )
    const overtimeHours = overtimeRecords === null ? null : overtimeRecords
      .filter((record) => record.employee_code === employee.id)
      .reduce((total, record) => total + Number(record.hours || 0), 0)
    const undertimeMinutes = undertimeRecords === null ? null : undertimeRecords
      .filter((record) => record.employee_code === employee.id)
      .reduce((total, record) => total + Number(record.undertime_minutes || 0), 0)
    const presentDays = [...recordsForEmployee.values()].reduce(
      (total, record) => total + getAttendanceDayValue(record.status),
      0
    )
    const fullPresentDays = [...recordsForEmployee.values()].filter(
      (record) => record.status === 'present' || record.status === 'present_late'
    ).length
    const attendanceRate = Math.round((presentDays / daysInMonth) * 100)
    const earnedCredit = employee.employmentClassification === 'Regular'
      && hasEarnedMonthlyCredit(fullPresentDays, monthKey)
      ? 1.25
      : 0

    return {
      no: index + 1,
      id: employee.id,
      name: employee.name,
      days,
      lateMinutesByDay,
      lateMinutes,
      overtimeHours,
      undertimeMinutes,
      presentDays,
      totalDays: daysInMonth,
      attendanceRate,
      attendanceRemark: getAttendanceRemark(attendanceRate),
      earnedCredit
    }
  }), [employees, attendanceRecords, overtimeRecords, undertimeRecords, daysInMonth, monthKey])

  const totalPresent = employees.filter((employee) =>
    ['Present', 'Present (Late)', 'Half Day'].includes(employee.status)
  ).length
  const totalLate = employees.filter((employee) => employee.status === 'Present (Late)').length
  const totalAbsent = employees.filter((employee) => employee.status === 'Absent').length

  const weeklyRecords = useMemo(() => {
    return getPayrollPeriods(monthKey).map((period) => {
      const { startDay: firstDay, endDay: lastDay } = period
      const weekDays = Array.from({ length: lastDay - firstDay + 1 }, (_, dayIndex) => {
        const day = firstDay + dayIndex
        return { day, date: new Date(recordsYear, recordsMonthIndex, day) }
      })
      const weekAttendance = attendanceRecords.filter((record) => {
        const day = Number(record.attendance_date.slice(-2))
        return record.attendance_date.startsWith(`${monthKey}-`)
          && day >= firstDay
          && day <= lastDay
      })
      return {
        label: period.label,
        firstDay,
        lastDay,
        days: weekDays,
        present: weekAttendance.reduce(
          (total, record) => total + getAttendanceDayValue(record.status),
          0
        ),
        late: weekAttendance.filter((record) => record.status === 'present_late').length,
        absent: weekAttendance.filter((record) => record.status === 'absent').length
      }
    })
  }, [attendanceRecords, recordsYear, recordsMonthIndex, monthKey])

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
          ? {
              ...employee,
              status,
              shift: shiftEligibleStatuses.includes(status) ? employee.shift : '',
              lateMinutes: status === 'Present (Late)' ? employee.lateMinutes : 0
            }
          : employee
      )
    )
  }

  const updateShift = (employeeId, shift) => {
    setEmployees((current) => current.map((employee) => employee.id === employeeId
      ? { ...employee, shift }
      : employee))
    setSaveMessage('')
    setSaveError('')
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
    if (isAttendancePeriodLocked) {
      setSaveError('This attendance period is locked. Request TAFI Admin to unlock it before making changes.')
      setSaveMessage('')
      return
    }

    const missingShift = employees.find((employee) =>
      shiftEligibleStatuses.includes(employee.status) && !employee.shift
    )

    if (missingShift) {
      setSaveError(`Select a shift for ${missingShift.name} before saving attendance.`)
      setSaveMessage('')
      return
    }

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
      shift: shiftEligibleStatuses.includes(employee.status) ? employee.shift || null : null,
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
    setSaveMessage('Shift, attendance, and late minutes saved.')
  }

  const requestAttendancePeriodUnlock = async () => {
    setIsRequestingUnlock(true)
    setSaveError('')
    setSaveMessage('')
    const { data, error } = await requestBranchAttendancePeriodUnlock(
      sessionToken,
      dailyAttendanceDateKey
    )
    setIsRequestingUnlock(false)
    if (error) {
      setSaveError(error.message)
      return
    }

    setAttendancePeriodControl((current) => ({
      ...current,
      pending_request_id: data ?? true
    }))
    setSaveMessage('Unlock request sent to TAFI Admin.')
  }

  const checkAttendancePeriodUnlock = async () => {
    setIsRequestingUnlock(true)
    const { data, error } = await getBranchAttendancePeriodControl(
      sessionToken,
      dailyAttendanceDateKey
    )
    setIsRequestingUnlock(false)
    if (error) {
      setSaveError(error.message)
      return
    }

    setAttendancePeriodControl(data)
    setSaveError('')
    setSaveMessage(data?.is_locked
      ? 'The attendance period is still locked. The unlock request is pending with TAFI Admin.'
      : 'TAFI Admin unlocked this period. You can now update attendance.')
  }

  const summary = useMemo(() => {
    const total = employees.length
    const present = monthRecords.reduce((sum, employee) => sum + employee.presentDays, 0)
    const late = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'L').length, 0)
    const absent = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'A').length, 0)
    const rate = total ? Math.round((present / (total * daysInMonth)) * 100) : 0

    return { present, late, absent, rate }
  }, [employees.length, monthRecords, daysInMonth])

  const updateRecordsMonth = (month) => {
    if (!month) return
    setIsLoading(true)
    setSelectedRecordsMonth(month)
    setSelectedWeekIndex(0)
    setSaveError('')
  }

  const recordsMonthSelector = (
    <label className="attendance-month-select">
      <span>Month</span>
      <input
        type="month"
        value={selectedRecordsMonth}
        max={attendanceDateKey.slice(0, 7)}
        onChange={(event) => updateRecordsMonth(event.target.value)}
      />
    </label>
  )

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
            {periodControlError && (
              <p className="payroll-contribution-message error" role="alert">
                Could not verify whether this period is editable: {periodControlError}
              </p>
            )}
            {!periodControlError && isLoadingPeriodControl && (
              <p className="payroll-contribution-message" role="status">
                Checking whether this attendance period is editable…
              </p>
            )}
            {!periodControlError && !isLoadingPeriodControl && isAttendancePeriodLocked && (
              <p className="payroll-contribution-message error" role="status">
                This attendance period is locked. Attendance cannot be changed until TAFI Admin unlocks it.
                {hasPendingUnlockRequest && ' An unlock request is pending with TAFI Admin.'}
              </p>
            )}

            <div className="attendance-submit-list">
              {isLoading ? (
                <p className="payroll-contribution-message" role="status">Loading attendance for the selected date…</p>
              ) : employees.map((employee) => (
                <div className="attendance-row" key={employee.id}>
                  <div className="employee-meta">
                    <div className="employee-avatar">{employee.name.charAt(0)}</div>
                    <div>
                      <strong>{employee.name}</strong>
                      <span>{employee.position} · Employee ID: {employee.id}</span>
                    </div>
                  </div>

                  <div className="attendance-row-controls">
                    {shiftEligibleStatuses.includes(employee.status) && (
                      <label className="attendance-select-field">
                        <span>Shift</span>
                        <select
                          value={employee.shift}
                          onChange={(event) => updateShift(employee.id, event.target.value)}
                          className="shift-select"
                          aria-label={`Shift for ${employee.name}`}
                          disabled={
                            isAttendancePeriodLocked
                            || isLoadingPeriodControl
                            || Boolean(periodControlError)
                          }
                        >
                          <option value="">Select shift</option>
                          {shiftOptions.map((shift) => (
                            <option key={shift} value={shift}>{shift}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <select
                      value={employee.status}
                      onChange={(event) => {
                        updateStatus(employee.id, event.target.value)
                        setSaveMessage('')
                        setSaveError('')
                      }}
                      className="status-select"
                      disabled={
                        isAttendancePeriodLocked
                        || isLoadingPeriodControl
                        || Boolean(periodControlError)
                      }
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
                            disabled={
                              isAttendancePeriodLocked
                              || isLoadingPeriodControl
                              || Boolean(periodControlError)
                            }
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
              <button
                type="button"
                className="save-button"
                onClick={isAttendancePeriodLocked
                  ? hasPendingUnlockRequest
                    ? checkAttendancePeriodUnlock
                    : requestAttendancePeriodUnlock
                  : saveAttendance}
                disabled={
                  isLoading
                  || isLoadingPeriodControl
                  || Boolean(periodControlError)
                  || isRequestingUnlock
                  || employees.length === 0
                }
              >
                {isRequestingUnlock
                  ? 'Requesting…'
                  : isAttendancePeriodLocked
                    ? hasPendingUnlockRequest
                      ? 'Check unlock status'
                      : 'Request TAFI Admin to unlock'
                    : 'Save attendance'}
              </button>
            </div>
          </div>
        </>
      ) : activeTab === 'weekly' ? (
        <>
          <div className="attendance-legend-box">
            <div className="legend-title">Weekly performance overview:</div>
            <div className="legend-items">
              {recordLegend.map((item) => (
                <span className="legend-item" key={item.className}>
                  <i className={`legend-box ${item.className}`} /> {item.label}
                </span>
              ))}
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
                {recordsMonthSelector}
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
                      <th>Total Late (minutes)</th>
                      <th>Total Absent</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRecords.map((employee) => {
                      const weekDays = employee.days.slice(selectedWeek.firstDay - 1, selectedWeek.lastDay)
                      const presentCount = weekDays.filter((value) => value === 'P' || value === 'L').length
                      const lateMinutes = employee.lateMinutesByDay
                        .slice(selectedWeek.firstDay - 1, selectedWeek.lastDay)
                        .reduce((total, minutes) => total + minutes, 0)
                      const absentCount = weekDays.filter((value) => value === 'A').length
                      const employeeRate = Math.round((presentCount / selectedWeek.days.length) * 100)

                      return (
                        <tr key={employee.id}>
                          <td>{employee.no}</td>
                          <td className="attendance-employee-name">{employee.name}</td>
                          <td>{employee.id}</td>
                          {weekDays.map((value, index) => (
                            <td
                              key={`${employee.id}-week-${index}`}
                              className={`status-cell ${statusCodeClassNames[value] ?? ''}`}
                              title={value === 'L' ? `Present (Late): ${employee.lateMinutesByDay[selectedWeek.firstDay + index - 1]} minutes late` : undefined}
                            >
                              {value === 'P' ? '✓' : value === 'L' ? employee.lateMinutesByDay[selectedWeek.firstDay + index - 1] : value}
                            </td>
                          ))}
                          <td>{presentCount}</td>
                          <td>{lateMinutes}</td>
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
              {recordLegend.map((item) => (
                <span className="legend-item" key={item.className}>
                  <i className={`legend-box ${item.className}`} /> {item.label}
                </span>
              ))}
              <span className="legend-item">Excellent attendance: 100%</span>
              <span className="legend-item">Good attendance: 60%–99%</span>
              <span className="legend-item">Poor attendance: below 60%</span>
            </div>
          </div>

          <div className="monitoring-toolbar">
            {recordsMonthSelector}
            <div className="month-select">{recordsMonthStartDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
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
                <col className="attendance-col-total" />
                <col className="attendance-col-total" />
                <col className="attendance-col-total" />
                <col className="attendance-col-rate" />
                <col className="attendance-col-remarks" />
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
                  <th rowSpan="2">Total Late (minutes)</th>
                  <th rowSpan="2">Total Undertime (minutes)</th>
                  <th rowSpan="2">Total Overtime (hours)</th>
                  <th rowSpan="2">Earned Credit (days)</th>
                  <th rowSpan="2">Total Days</th>
                  <th rowSpan="2">Attendance Rate (%)</th>
                  <th rowSpan="2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {monthRecords.map((employee) => {
                  return (
                    <tr key={employee.id}>
                      <td>{employee.no}</td>
                      <td className="attendance-employee-name">{employee.name}</td>
                      <td>{employee.id}</td>
                      {employee.days.map((value, index) => (
                        <td
                          key={`${employee.id}-${index}`}
                          className={`status-cell ${statusCodeClassNames[value] ?? ''}`}
                          title={value === 'L' ? `Present (Late): ${employee.lateMinutesByDay[index]} minutes late` : undefined}
                        >
                          {value === 'P' ? '✓' : value === 'L' ? employee.lateMinutesByDay[index] : value}
                        </td>
                      ))}
                      <td>{employee.presentDays}</td>
                      <td>{employee.lateMinutes}</td>
                      <td>{employee.undertimeMinutes === null ? '—' : employee.undertimeMinutes}</td>
                      <td>{employee.overtimeHours === null ? '—' : employee.overtimeHours.toFixed(2)}</td>
                      <td>{employee.earnedCredit.toFixed(2)}</td>
                      <td>{employee.totalDays}</td>
                      <td>{employee.attendanceRate}%</td>
                      <td>{employee.attendanceRemark}</td>
                    </tr>
                  )
                })}
                {!isLoading && monthRecords.length === 0 && (
                  <tr><td className="employee-empty-state" colSpan={daysInMonth + 11}>No employees have been added to this branch.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {monthlyMetricsError && (
            <p className="payroll-contribution-message error" role="alert">
              Some monthly overtime or undertime totals could not be loaded: {monthlyMetricsError}
            </p>
          )}
        </>
      )}
    </div>
  )
}
