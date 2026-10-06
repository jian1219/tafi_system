import { useMemo, useState } from 'react'
import { getBranchEmployees } from './branchEmployees'
import { monthRecords } from './Branch_attendance_monitoring'

const formatCurrency = (amount) => amount.toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const attendanceMonthLength = monthRecords.reduce(
  (longestMonth, record) => Math.max(longestMonth, record.days.length),
  0
)

const payrollWeeks = Array.from(
  { length: Math.max(1, Math.ceil(attendanceMonthLength / 7)) },
  (_, index) => ({
    index,
    startDay: index * 7 + 1,
    endDay: Math.min((index + 1) * 7, attendanceMonthLength)
  })
)

export default function BranchPayroll({ branchName = 'Bansasi Branch' }) {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0)
  const [employees] = useState(getBranchEmployees)
  const selectedWeek = payrollWeeks[selectedWeekIndex]

  const payrollRows = useMemo(() => employees.map((employee) => {
    const attendance = monthRecords.find((record) => record.id === employee.id)
    const weekDays = attendance
      ? attendance.days.slice(selectedWeek.startDay - 1, selectedWeek.endDay)
      : []
    const presentDays = weekDays.filter((day) => day === 'P').length
    const lateDays = weekDays.filter((day) => day === 'L').length
    const absentDays = weekDays.filter((day) => day === 'A').length
    const dailyRate = Number.isFinite(employee.dailyRate) ? employee.dailyRate : null
    const weeklyGross = attendance && dailyRate !== null
      ? (presentDays + lateDays) * dailyRate
      : null

    return {
      ...employee,
      hasAttendance: Boolean(attendance),
      presentDays,
      lateDays,
      absentDays,
      dailyRate,
      weeklyGross
    }
  }), [employees, selectedWeek])

  const estimatedTotal = payrollRows.reduce((total, employee) => total + (employee.weeklyGross ?? 0), 0)
  const incompleteCount = payrollRows.filter((employee) => employee.weeklyGross === null).length
  const calculatedCount = payrollRows.length - incompleteCount

  return (
    <section className="branch-payroll-shell">
      <header className="branch-payroll-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Weekly Payroll</h3>
          <p className="employee-info-description">Weekly gross estimate based on recorded attendance and employee daily rates.</p>
        </div>
        <label className="payroll-period-control">
          <span>Payroll week</span>
          <select
            value={selectedWeekIndex}
            onChange={(event) => setSelectedWeekIndex(Number(event.target.value))}
          >
            {payrollWeeks.map((week) => (
              <option key={week.index} value={week.index}>
                Week {week.index + 1} · January {week.startDay}–{week.endDay}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="payroll-summary-grid">
        <div className="payroll-summary-card">
          <span>Selected period</span>
          <strong>January {selectedWeek.startDay}–{selectedWeek.endDay}</strong>
        </div>
        <div className="payroll-summary-card">
          <span>Estimated gross for calculated rows</span>
          <strong>{calculatedCount === 0 ? 'Awaiting data' : formatCurrency(estimatedTotal)}</strong>
        </div>
        <div className="payroll-summary-card">
          <span>Needs rate or attendance</span>
          <strong>{incompleteCount} employees</strong>
        </div>
      </div>

      <div className="weekly-payroll-table-wrap">
        <table className="weekly-payroll-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Position</th>
              <th>Present</th>
              <th>Late</th>
              <th>Absent</th>
              <th>Daily rate</th>
              <th>Estimated gross</th>
              <th>Record status</th>
            </tr>
          </thead>
          <tbody>
            {payrollRows.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <strong>{employee.name}</strong>
                  <span className="payroll-employee-id">{employee.id}</span>
                </td>
                <td>{employee.position}</td>
                <td>{employee.hasAttendance ? employee.presentDays : '—'}</td>
                <td>{employee.hasAttendance ? employee.lateDays : '—'}</td>
                <td>{employee.hasAttendance ? employee.absentDays : '—'}</td>
                <td>{employee.dailyRate === null ? 'Not set' : formatCurrency(employee.dailyRate)}</td>
                <td className="weekly-payroll-amount">
                  {employee.weeklyGross === null ? '—' : formatCurrency(employee.weeklyGross)}
                </td>
                <td>
                  <span className={`payroll-record-status ${employee.weeklyGross === null ? 'incomplete' : 'ready'}`}>
                    {employee.weeklyGross === null ? 'Needs data' : 'Calculated'}
                  </span>
                </td>
              </tr>
            ))}
            {payrollRows.length === 0 && (
              <tr><td className="employee-empty-state" colSpan="8">No branch employees have been added.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="payroll-calculation-note">
        Estimate uses present and late days multiplied by the saved daily rate. It does not include overtime, allowances, deductions, or confirmed payment records.
      </p>
    </section>
  )
}
