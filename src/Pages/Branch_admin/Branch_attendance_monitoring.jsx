import { useMemo, useState } from 'react'
import { getBranchEmployees } from './branchEmployees'
import { getAttendanceForDate, getLocalDateKey, saveAttendanceForDate } from './branchAttendanceRecords'

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

export const monthRecords = [
  { no: 1, name: 'Arban Ella Marie Layao', id: 'EMP-001', position: 'Cashier', days: ['P','P','P','A','L','P','P','P','A','P','P','P','L','P','P','P','A','P','P','P','P','P','A','P','P','P','P','L','P','P','P'] },
  { no: 2, name: 'Guinombay Reynard Coguit', id: 'EMP-002', position: 'Sales Associate', days: ['P','L','P','P','A','P','P','P','P','L','P','A','P','P','P','P','P','A','P','P','P','P','P','L','A','P','P','P','P','P','A'] },
  { no: 3, name: 'Mandang Susan Madrid', id: 'EMP-003', position: 'Inventory Clerk', days: ['P','P','P','A','P','P','L','P','A','P','P','P','P','L','P','A','P','P','P','P','A','P','P','P','P','L','P','P','A','P','P'] },
  { no: 4, name: 'Orbita Erlyn Torres', id: 'EMP-004', position: 'Customer Service', days: ['A','P','P','P','P','A','P','L','P','P','P','A','P','P','P','L','P','P','P','A','P','P','P','P','A','P','P','P','P','L','P'] },
  { no: 5, name: 'Osigan Regie Alabat', id: 'EMP-005', position: 'Warehouse Staff', days: ['P','P','A','P','L','P','P','P','A','P','P','P','P','A','P','P','P','L','P','P','A','P','P','P','P','P','A','P','P','L','P'] },
  { no: 6, name: 'Polison James Darrel Boiser', id: 'EMP-006', position: 'Supervisor', days: ['P','P','P','P','L','A','P','P','P','P','A','P','P','P','P','L','P','A','P','P','P','P','P','A','L','P','P','P','P','P','A'] },
  { no: 7, name: 'Sabate Anthony Campilan', id: 'EMP-007', position: 'Utility Staff', days: ['P','A','P','P','P','P','L','P','A','P','P','P','A','P','P','P','P','P','A','L','P','P','P','P','A','P','P','P','P','A','P'] },
  { no: 8, name: 'Sabanal John Paul', id: 'EMP-008', position: 'Delivery Staff', days: ['P','L','P','A','P','P','P','A','P','P','P','A','P','P','L','P','P','P','A','P','P','P','P','L','P','A','P','P','P','P','A'] },
  { no: 9, name: 'Satorre Kate Francis', id: 'EMP-009', position: 'Accounts Staff', days: ['P','P','P','P','A','P','P','P','A','P','P','P','L','A','P','P','P','P','P','A','P','P','L','P','P','A','P','P','P','P','P'] },
  { no: 10, name: 'Singgolan Reymart Lahindao', id: 'EMP-010', position: 'Stock Associate', days: ['A','P','P','L','P','P','A','P','P','P','P','L','A','P','P','P','A','P','P','P','P','P','A','P','P','P','P','A','P','P','L'] }
]

export default function BranchAttendanceMonitoring() {
  const [activeTab, setActiveTab] = useState('daily')
  const [attendanceDateKey] = useState(() => getLocalDateKey(new Date()))
  const [employees, setEmployees] = useState(() =>
    getBranchEmployees().map(({ id, name, position, todayStatus, dailyRate }) => {
      const savedRecord = getAttendanceForDate(attendanceDateKey)[id]
      const initialStatus = savedRecord?.status ?? (todayStatus === 'Late' ? 'Present (Late)' : todayStatus)
      return {
        id,
        name,
        position,
        dailyRate,
        status: initialStatus,
        lateMinutes: savedRecord?.lateMinutes ?? 0
      }
    })
  )

  const totalPresent = employees.filter((employee) => ['Present', 'Present (Late)'].includes(employee.status)).length
  const totalLate = employees.filter((employee) => employee.status === 'Present (Late)').length
  const totalAbsent = employees.filter((employee) => employee.status === 'Absent').length

  const weeklyRecords = useMemo(
    () => [
      { range: 'Week 1', present: 42, late: 6, absent: 9 },
      { range: 'Week 2', present: 46, late: 4, absent: 7 },
      { range: 'Week 3', present: 44, late: 5, absent: 8 },
      { range: 'Week 4', present: 48, late: 3, absent: 6 }
    ],
    []
  )

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

  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  const saveAttendance = () => {
    const incompleteLateEntry = employees.find((employee) =>
      employee.status === 'Present (Late)' && (!Number.isInteger(employee.lateMinutes) || employee.lateMinutes < 1)
    )

    if (incompleteLateEntry) {
      setSaveError(`Enter a whole number of late minutes for ${incompleteLateEntry.name} before saving.`)
      setSaveMessage('')
      return
    }

    const records = Object.fromEntries(employees.map((employee) => [employee.id, {
      status: employee.status,
      lateMinutes: employee.status === 'Present (Late)' ? employee.lateMinutes : 0
    }]))

    if (!saveAttendanceForDate(attendanceDateKey, records)) {
      setSaveError('Attendance could not be saved in this browser. Check available storage and try again.')
      setSaveMessage('')
      return
    }

    setSaveError('')
    setSaveMessage('Attendance and late minutes saved.')
  }

  const summary = useMemo(() => {
    const total = monthRecords.length
    const present = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'P').length, 0)
    const late = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'L').length, 0)
    const absent = monthRecords.reduce((sum, employee) => sum + employee.days.filter((day) => day === 'A').length, 0)
    const rate = Math.round((present / (total * 31)) * 100)

    return { present, late, absent, rate }
  }, [])

  return (
    <div className="attendance-monitoring-shell">
      <div className="attendance-header-strip">
        <div className="branch-title">Bansasi Branch</div>
      </div>

      <div className="attendance-monitoring-bar">
        <h3>Attendance Monitoring</h3>
      </div>

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
              <button type="button" className="save-button" onClick={saveAttendance}>Save attendance</button>
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
            <div className="month-select">January</div>
            <div className="summary-inline">
              <span>Present: <strong>{summary.present}</strong></span>
              <span>Late: <strong>{summary.late}</strong></span>
              <span>Absent: <strong>{summary.absent}</strong></span>
              <span>Rate: <strong>{summary.rate}%</strong></span>
            </div>
          </div>

          <div className="attendance-grid-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th rowSpan="2">No.</th>
                  <th rowSpan="2">Employee ID</th>
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
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
                  const employeeRate = Math.round((presentCount / 31) * 100)

                  return (
                    <tr key={employee.id}>
                      <td>{employee.no}</td>
                      <td>{employee.id}</td>
                      {employee.days.map((value, index) => (
                        <td key={`${employee.id}-${index}`} className={`status-cell ${value.toLowerCase()}`}>
                          {value === 'P' ? '✓' : value === 'L' ? '!' : value === 'A' ? 'A' : '•'}
                        </td>
                      ))}
                      <td>{presentCount}</td>
                      <td>{lateCount}</td>
                      <td>{absentCount}</td>
                      <td>{employeeRate}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
