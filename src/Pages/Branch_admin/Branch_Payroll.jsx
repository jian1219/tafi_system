import { useEffect, useMemo, useState } from 'react'
import {
  listBranchAttendance,
  listBranchCashAdvancePayments,
  listBranchEmployeeContributions,
  listBranchHdmfPayments,
  listBranchUndertimeDeductions,
  listBranchPayrollAdditions
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const formatCurrency = (amount) => amount.toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const currentDate = new Date()
const payrollMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
const attendanceMonthLength = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
const payrollMonthLabel = currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

const payrollWeeks = Array.from(
  { length: Math.max(1, Math.ceil(attendanceMonthLength / 7)) },
  (_, index) => ({
    index,
    startDay: index * 7 + 1,
    endDay: Math.min((index + 1) * 7, attendanceMonthLength)
  })
)

export default function BranchPayroll({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0)
  const [employees, setEmployees] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [contributions, setContributions] = useState({})
  const [cashAdvances, setCashAdvances] = useState({})
  const [hdmfPayments, setHdmfPayments] = useState({})
  const [undertimeDeductions, setUndertimeDeductions] = useState({})
  const [payrollAdditions, setPayrollAdditions] = useState({})
  const [contributionStatus, setContributionStatus] = useState('loading')
  const [contributionError, setContributionError] = useState('')
  const selectedWeek = payrollWeeks[selectedWeekIndex] ?? payrollWeeks[0]
  const sessionToken = branchAdmin?.session_token
  const selectedStartDate = getLocalDateKey(new Date(
    payrollMonthStart.getFullYear(),
    payrollMonthStart.getMonth(),
    selectedWeek.startDay
  ))
  const selectedEndDate = getLocalDateKey(new Date(
    payrollMonthStart.getFullYear(),
    payrollMonthStart.getMonth(),
    selectedWeek.endDay
  ))

  useEffect(() => {
    let isCurrent = true

    const loadContributions = async () => {
      if (!sessionToken) {
        setContributionError('Apply the Supabase contribution SQL, then sign out and sign in again to calculate take-home pay.')
        setContributionStatus('error')
        return
      }

      const [
        { employees: loadedEmployees, error: employeeError },
        { data: contributionData, error: contributionLoadError },
        { data: loadedAttendance, error: attendanceError },
        { data: loadedCashAdvancePayments, error: cashAdvanceError },
        { data: loadedHdmfPayments, error: hdmfPaymentError },
        { data: loadedUndertimeDeductions, error: undertimeError },
        { data: loadedPayrollAdditions, error: additionsError }
      ] = await Promise.all([
        getBranchEmployees(sessionToken),
        listBranchEmployeeContributions(sessionToken),
        listBranchAttendance(sessionToken, selectedStartDate, selectedEndDate),
        listBranchCashAdvancePayments(sessionToken, selectedStartDate, selectedEndDate),
        listBranchHdmfPayments(sessionToken, selectedStartDate, selectedEndDate),
        listBranchUndertimeDeductions(sessionToken, selectedStartDate, selectedEndDate),
        listBranchPayrollAdditions(sessionToken, selectedStartDate, selectedEndDate)
      ])
      if (!isCurrent) return

      const error = employeeError ?? contributionLoadError ?? attendanceError ?? cashAdvanceError
        ?? hdmfPaymentError ?? undertimeError ?? additionsError
      if (error) {
        setContributionError(error.message)
        setContributionStatus('error')
        return
      }

      setEmployees(loadedEmployees)
      setAttendanceRecords(loadedAttendance ?? [])
      setCashAdvances(Object.fromEntries(
        (loadedCashAdvancePayments ?? []).reduce((totals, record) => {
          totals.set(
            record.employee_code,
            (totals.get(record.employee_code) ?? 0) + Number(record.amount)
          )
          return totals
        }, new Map())
      ))
      setHdmfPayments(Object.fromEntries(
        (loadedHdmfPayments ?? []).reduce((totals, record) => {
          totals.set(
            record.employee_code,
            (totals.get(record.employee_code) ?? 0) + Number(record.amount)
          )
          return totals
        }, new Map())
      ))
      setUndertimeDeductions(Object.fromEntries(
        (loadedUndertimeDeductions ?? []).map((record) => [
          record.employee_code,
          Number(record.amount)
        ])
      ))
      setPayrollAdditions(Object.fromEntries(
        (loadedPayrollAdditions ?? []).reduce((totals, addition) => {
          const current = totals.get(addition.employee_code) ?? {
            holiday_regular_pay: 0,
            overtime_pay: 0,
            special_nonworking_holiday: 0
          }
          current[addition.addition_type] += Number(addition.amount)
          totals.set(addition.employee_code, current)
          return totals
        }, new Map())
      ))
      setContributions(Object.fromEntries(
        (contributionData ?? []).map((record) => [
          record.employee_code,
          {
            sss: Number(record.sss),
            philhealth: Number(record.philhealth),
            pagibig: Number(record.pagibig)
          }
        ])
      ))
      setContributionError('')
      setContributionStatus('ready')
    }

    loadContributions()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, selectedStartDate, selectedEndDate])

  const payrollRows = useMemo(() => employees.map((employee) => {
    const employeeRecords = attendanceRecords.filter((record) =>
      record.employee_code === employee.id
      && record.attendance_date >= selectedStartDate
      && record.attendance_date <= selectedEndDate
    )
    const presentDays = employeeRecords.filter(
      (record) => record.status === 'present' || record.status === 'present_late'
    ).length
    const absentDays = employeeRecords.filter((record) => record.status === 'absent').length
    const hasAttendance = employeeRecords.some((record) => record.status !== 'not_marked')
    const dailyRate = Number.isFinite(employee.dailyRate) ? employee.dailyRate : null
    const monthlyRate = dailyRate === null ? null : dailyRate * 26
    const basicSalary = hasAttendance && dailyRate !== null
      ? presentDays * dailyRate
      : null
    const contribution = contributions[employee.id]
    const sss = contribution?.sss ?? 0
    const philhealth = contribution?.philhealth ?? 0
    const pagibig = contribution?.pagibig ?? 0
    const cashAdvanceDeduction = cashAdvances[employee.id] ?? 0
    const hdmfLoanDeduction = hdmfPayments[employee.id] ?? 0
    const additions = payrollAdditions[employee.id] ?? {
      holiday_regular_pay: 0,
      overtime_pay: 0,
      special_nonworking_holiday: 0
    }
    const totalAdditions = additions.holiday_regular_pay + additions.overtime_pay
      + additions.special_nonworking_holiday
    const lateMinutes = employeeRecords.reduce(
      (total, record) => total + (record.status === 'present_late' ? Number(record.late_minutes) : 0),
      0
    )
    const lateDeduction = dailyRate === null
      ? 0
      : Math.round((dailyRate / 8 / 60 * lateMinutes) * 100) / 100
    const undertimeDeduction = undertimeDeductions[employee.id] ?? 0
    const totalDeductions = sss + philhealth + pagibig + cashAdvanceDeduction
      + hdmfLoanDeduction + lateDeduction + undertimeDeduction
    const salaryCredit = basicSalary === null
      ? null
      : basicSalary + totalAdditions

    return {
      ...employee,
      hasAttendance,
      presentDays,
      absentDays,
      totalDays: hasAttendance ? presentDays + absentDays : null,
      dailyRate,
      monthlyRate,
      basicSalary,
      salaryCredit,
      hasContributions: Boolean(contribution),
      sss,
      philhealth,
      pagibig,
      cashAdvanceDeduction,
      hdmfLoanDeduction,
      lateDeduction,
      undertimeDeduction,
      totalDeductions,
      ...additions,
      totalAdditions,
      weeklyNet: contributionStatus === 'ready' && contribution && salaryCredit !== null
        ? salaryCredit - totalDeductions
        : null
    }
  }), [employees, attendanceRecords, selectedStartDate, selectedEndDate, contributions, cashAdvances, hdmfPayments, undertimeDeductions, payrollAdditions, contributionStatus])

  const estimatedTotal = payrollRows.reduce((total, employee) =>
    total + (employee.salaryCredit ?? 0), 0)
  const incompleteCount = payrollRows.filter((employee) => employee.basicSalary === null).length
  const calculatedCount = payrollRows.length - incompleteCount
  const estimatedDeductions = payrollRows.reduce(
    (total, employee) => total + (employee.basicSalary === null || !employee.hasContributions ? 0 : employee.totalDeductions),
    0
  )
  const missingContributionCount = payrollRows.filter(
    (employee) => employee.basicSalary !== null && !employee.hasContributions
  ).length
  const estimatedNetTotal = payrollRows.reduce((total, employee) => total + (employee.weeklyNet ?? 0), 0)

  return (
    <section className="branch-payroll-shell">
      <header className="branch-payroll-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Weekly Payroll</h3>
          <p className="employee-info-description">Payroll shows monthly rate, attendance-based basic salary, additional earnings, deductions, and estimated final net pay for the selected week.</p>
        </div>
        <label className="payroll-period-control">
          <span>Payroll week</span>
          <select
            value={selectedWeekIndex}
            onChange={(event) => setSelectedWeekIndex(Number(event.target.value))}
          >
            {payrollWeeks.map((week) => (
              <option key={week.index} value={week.index}>
                Week {week.index + 1} · {payrollMonthLabel.split(' ')[0]} {week.startDay}–{week.endDay}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="payroll-summary-grid">
        <div className="payroll-summary-card">
          <span>Selected period</span>
          <strong>{payrollMonthLabel.split(' ')[0]} {selectedWeek.startDay}–{selectedWeek.endDay}</strong>
        </div>
        <div className="payroll-summary-card">
          <span>Estimated salary credit</span>
          <strong>{calculatedCount === 0 ? 'Awaiting data' : formatCurrency(estimatedTotal)}</strong>
        </div>
        <div className="payroll-summary-card">
          <span>Needs rate or attendance</span>
          <strong>{incompleteCount} employees</strong>
        </div>
        <div className="payroll-summary-card">
          <span>Total weekly deductions</span>
          <strong>{contributionStatus !== 'ready' ? 'Unavailable' : formatCurrency(estimatedDeductions)}</strong>
          {contributionStatus === 'ready' && missingContributionCount > 0 && (
            <small>{missingContributionCount} employees need contribution entries</small>
          )}
        </div>
        <div className="payroll-summary-card">
          <span>Estimated net pay</span>
          <strong>
            {contributionStatus !== 'ready' || calculatedCount === 0 || missingContributionCount > 0
              ? 'Awaiting complete data'
              : formatCurrency(estimatedNetTotal)}
          </strong>
        </div>
      </div>

      {contributionStatus === 'loading' && (
        <p className="payroll-contribution-message" role="status">Loading weekly contribution amounts…</p>
      )}
      {contributionStatus === 'error' && (
        <p className="payroll-contribution-message error" role="alert">
          Could not calculate final pay: {contributionError}
        </p>
      )}

      <div className="weekly-payroll-table-wrap" role="region" aria-label="Weekly payroll details" tabIndex="0">
        <table className="weekly-payroll-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Employee name</th>
              <th>Employment status</th>
              <th>Monthly rate</th>
              <th>Daily rate</th>
              <th>Working days (present)</th>
              <th>Absent</th>
              <th>Total number of days</th>
              <th>Basic salary</th>
              <th>Regular holiday</th>
              <th>Overtime</th>
              <th>Special non-working holiday</th>
              <th>Salary credit</th>
              <th>SSS</th>
              <th>PhilHealth</th>
              <th>Pag-IBIG</th>
              <th>HDMF loan</th>
              <th>CA</th>
              <th>Late</th>
              <th>Und</th>
              <th>Total deduction</th>
              <th>Final net pay</th>
              <th>Record status</th>
            </tr>
          </thead>
          <tbody>
            {payrollRows.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.id}</td>
                <td><strong>{employee.name}</strong></td>
                <td>{employee.employmentClassification || '—'}</td>
                <td>{employee.monthlyRate === null ? 'Not set' : formatCurrency(employee.monthlyRate)}</td>
                <td>{employee.dailyRate === null ? 'Not set' : formatCurrency(employee.dailyRate)}</td>
                <td>{employee.hasAttendance ? employee.presentDays : '—'}</td>
                <td>{employee.hasAttendance ? employee.absentDays : '—'}</td>
                <td>{employee.totalDays ?? '—'}</td>
                <td className="weekly-payroll-amount">
                  {employee.basicSalary === null ? '—' : formatCurrency(employee.basicSalary)}
                </td>
                <td>{formatCurrency(employee.holiday_regular_pay)}</td>
                <td>{formatCurrency(employee.overtime_pay)}</td>
                <td>{formatCurrency(employee.special_nonworking_holiday)}</td>
                <td className="weekly-payroll-amount">
                  {employee.salaryCredit === null ? '—' : formatCurrency(employee.salaryCredit)}
                </td>
                <td>{employee.hasContributions ? formatCurrency(employee.sss) : '—'}</td>
                <td>{employee.hasContributions ? formatCurrency(employee.philhealth) : '—'}</td>
                <td>{employee.hasContributions ? formatCurrency(employee.pagibig) : '—'}</td>
                <td>{formatCurrency(employee.hdmfLoanDeduction)}</td>
                <td>{formatCurrency(employee.cashAdvanceDeduction)}</td>
                <td>{formatCurrency(employee.lateDeduction)}</td>
                <td>{formatCurrency(employee.undertimeDeduction)}</td>
                <td>{employee.hasContributions ? formatCurrency(employee.totalDeductions) : '—'}</td>
                <td className="weekly-payroll-amount">
                  {employee.weeklyNet === null ? '—' : formatCurrency(employee.weeklyNet)}
                </td>
                <td>
                  <span className={`payroll-record-status ${employee.basicSalary === null || contributionStatus !== 'ready' ? 'incomplete' : 'ready'}`}>
                    {employee.basicSalary === null
                      ? 'Needs data'
                      : contributionStatus !== 'ready'
                        ? 'Needs contributions'
                        : !employee.hasContributions
                          ? 'Set contributions'
                          : 'Calculated'}
                  </span>
                </td>
              </tr>
            ))}
            {payrollRows.length === 0 && (
              <tr><td className="employee-empty-state" colSpan="23">No branch employees have been added.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="payroll-calculation-note">
        Monthly rate is daily rate × 26. Working days include attendance marked Present or Present (Late); basic salary is daily rate × working days. Salary credit adds regular holiday, overtime, and special non-working holiday pay. Late deduction is daily rate ÷ 8 ÷ 60 × recorded late minutes; Und is the separately entered weekly undertime deduction. Total deduction includes SSS, PhilHealth, Pag-IBIG, HDMF loan, cash advance (CA), late, and Und. Final net pay is salary credit minus total deduction.
      </p>
    </section>
  )
}
