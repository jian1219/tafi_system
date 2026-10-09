import { useEffect, useMemo, useState } from 'react'
import {
  listBranchAttendance,
  listBranchAttendanceHistory,
  listBranchCashAdvancePayments,
  listBranchEmployeeContributions,
  listBranchHdmfPayments,
  listBranchOtherDeductions,
  listBranchUndertimeDeductions,
  listBranchPayrollAdditions,
  listBranchWeeklyPayrollSnapshots,
  saveBranchWeeklyPayrollSnapshot
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const today = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
const monthDayCount = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
const monthName = today.toLocaleDateString(undefined, { month: 'long' })
const reportYear = today.getFullYear()
const weekCount = Math.ceil(monthDayCount / 7)
const statusLabels = {
  present: 'Present',
  present_late: 'Late',
  absent: 'Absent',
  maternity_leave: 'Maternity Leave',
  paternity_leave: 'Paternity Leave',
  authorized_leave: 'Authorized Leave',
  birthday_leave: 'Birthday Leave',
  vl_with_pay: 'VL with Pay',
  vl_without_pay: 'VL without Pay',
  day_off: 'Day Off',
  not_marked: 'Not marked'
}
const reportStatusLabels = {
  ...statusLabels,
  present_late: 'Present (Late)'
}
const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const formatDate = (dateKey, options = { month: 'long', day: 'numeric', year: 'numeric' }) =>
  new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, options)

const groupAttendanceByWeek = (records) => {
  const weeks = new Map()

  for (const record of records) {
    const [year, month, day] = record.attendance_date.split('-').map(Number)
    const weekNumber = Math.ceil(day / 7)
    const monthKey = `${year}-${String(month).padStart(2, '0')}`
    const key = `${monthKey}-week-${weekNumber}`
    const monthDate = new Date(year, month - 1, 1)
    const monthDayCount = new Date(year, month, 0).getDate()
    const startDay = (weekNumber - 1) * 7 + 1
    const endDay = Math.min(weekNumber * 7, monthDayCount)

    if (!weeks.has(key)) {
      weeks.set(key, {
        key,
        label: `${monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · Week ${weekNumber} (${monthDate.toLocaleDateString(undefined, { month: 'long' })} ${startDay}–${endDay})`,
        startDay,
        endDay,
        monthKey,
        records: [],
        dates: Array.from({ length: endDay - startDay + 1 }, (_, index) =>
          `${monthKey}-${String(startDay + index).padStart(2, '0')}`
        )
      })
    }

    weeks.get(key).records.push(record)
  }

  return [...weeks.values()].sort((left, right) => right.key.localeCompare(left.key))
}

const csvCell = (value) => {
  const text = String(value ?? '')
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

const createCsv = (rows) => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`

const getPeriod = (periodType, weekIndex) => {
  const startDay = periodType === 'weekly' ? weekIndex * 7 + 1 : 1
  const endDay = periodType === 'weekly'
    ? Math.min((weekIndex + 1) * 7, monthDayCount)
    : monthDayCount

  return {
    startDay,
    endDay,
    startDate: getLocalDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), startDay)),
    endDate: getLocalDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), endDay))
  }
}

const periodDescription = (periodType, weekIndex) => {
  const { startDay, endDay } = getPeriod(periodType, weekIndex)
  return periodType === 'weekly'
    ? `Week ${weekIndex + 1} (${monthName} ${startDay}-${endDay}, ${reportYear})`
    : `${monthName} ${reportYear}`
}

const downloadCsv = (fileName, rows) => {
  const blob = new Blob([createCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}

function PeriodControls({ periodType, onPeriodTypeChange, weekIndex, onWeekChange, id }) {
  return (
    <div className="report-controls">
      <label>
        <span>Report period</span>
        <select value={periodType} onChange={(event) => onPeriodTypeChange(event.target.value)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      {periodType === 'weekly' && (
        <label>
          <span>Week</span>
          <select value={weekIndex} onChange={(event) => onWeekChange(Number(event.target.value))}>
            {Array.from({ length: weekCount }, (_, index) => {
              const period = getPeriod('weekly', index)
              return (
                <option key={`${id}-week-${index}`} value={index}>
                  Week {index + 1}: {monthName} {period.startDay}-{period.endDay}
                </option>
              )
            })}
          </select>
        </label>
      )}
      <p className="report-period-note">Source records: {monthName} {reportYear}</p>
    </div>
  )
}

export default function BranchReport({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [attendancePeriodType, setAttendancePeriodType] = useState('weekly')
  const [attendanceWeekIndex, setAttendanceWeekIndex] = useState(0)
  const [payrollPeriodType, setPayrollPeriodType] = useState('weekly')
  const [payrollWeekIndex, setPayrollWeekIndex] = useState(0)
  const [attendanceMessage, setAttendanceMessage] = useState('')
  const [payrollMessage, setPayrollMessage] = useState('')
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [historyRecords, setHistoryRecords] = useState([])
  const [payrollSnapshots, setPayrollSnapshots] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [payrollHistoryError, setPayrollHistoryError] = useState('')
  const [savingPayrollWeekKey, setSavingPayrollWeekKey] = useState('')
  const [payrollSnapshotMessage, setPayrollSnapshotMessage] = useState('')
  const [expandedWeekKey, setExpandedWeekKey] = useState('')
  const historyWeeks = useMemo(() => groupAttendanceByWeek(historyRecords), [historyRecords])
  const payrollSnapshotsByStartDate = useMemo(
    () => new Map(payrollSnapshots.map((snapshot) => [snapshot.period_start, snapshot])),
    [payrollSnapshots]
  )

  useEffect(() => {
    let isCurrent = true

    const loadHistory = async () => {
      if (!branchAdmin?.session_token) {
        setHistoryError('Your login session is missing. Sign out and sign in again after applying the Supabase SQL.')
        setIsLoadingHistory(false)
        return
      }

      const [
        { data: attendanceHistory, error: attendanceError },
        { data: savedPayroll, error: payrollError }
      ] = await Promise.all([
        listBranchAttendanceHistory(branchAdmin.session_token),
        listBranchWeeklyPayrollSnapshots(branchAdmin.session_token)
      ])
      if (!isCurrent) return

      if (attendanceError) setHistoryError(attendanceError.message)
      else {
        setHistoryRecords(attendanceHistory ?? [])
        setHistoryError('')
      }
      if (payrollError) setPayrollHistoryError(payrollError.message)
      else {
        setPayrollSnapshots(savedPayroll ?? [])
        setPayrollHistoryError('')
      }
      setIsLoadingHistory(false)
    }

    loadHistory()
    return () => {
      isCurrent = false
    }
  }, [branchAdmin?.session_token])

  const savePayrollSnapshot = async (week) => {
    if (!branchAdmin?.session_token) {
      setPayrollSnapshotMessage('Your login session is missing. Sign out and sign in again after applying the Supabase SQL.')
      return
    }

    const periodStart = week.dates[0]
    const periodEnd = week.dates[week.dates.length - 1]
    setSavingPayrollWeekKey(week.key)
    setPayrollSnapshotMessage('')

    const { error } = await saveBranchWeeklyPayrollSnapshot(
      branchAdmin?.session_token,
      periodStart,
      periodEnd
    )

    if (error) {
      setPayrollSnapshotMessage(`Could not save payroll snapshot: ${error.message}`)
      setSavingPayrollWeekKey('')
      return
    }

    const { data, error: refreshError } = await listBranchWeeklyPayrollSnapshots(branchAdmin?.session_token)
    setSavingPayrollWeekKey('')
    if (refreshError) {
      setPayrollHistoryError(`Payroll was saved, but history could not refresh: ${refreshError.message}`)
      return
    }

    setPayrollSnapshots(data ?? [])
    setPayrollSnapshotMessage('Weekly payroll snapshot saved. Attendance, rates, payroll additions, mandatory contributions, HDMF repayments, undertime, other deductions, and cash advance deductions are now preserved.')
  }

  const loadPeriodData = async (period) => {
    if (!branchAdmin?.session_token) {
      throw new Error('Your login session is missing. Sign out and sign in again after applying the Supabase SQL.')
    }

    const [
      { employees, error: employeeError },
      { data: attendance, error: attendanceError },
      { data: contributions, error: contributionError },
      { data: cashAdvancePayments, error: cashAdvanceError },
      { data: hdmfPayments, error: hdmfPaymentError },
      { data: undertimeDeductions, error: undertimeError },
      { data: otherDeductions, error: otherDeductionsError },
      { data: payrollAdditions, error: additionsError }
    ] = await Promise.all([
      getBranchEmployees(branchAdmin.session_token),
      listBranchAttendance(branchAdmin.session_token, period.startDate, period.endDate),
      listBranchEmployeeContributions(branchAdmin.session_token),
      listBranchCashAdvancePayments(branchAdmin.session_token, period.startDate, period.endDate),
      listBranchHdmfPayments(branchAdmin.session_token, period.startDate, period.endDate),
      listBranchUndertimeDeductions(branchAdmin.session_token, period.startDate, period.endDate),
      listBranchOtherDeductions(branchAdmin.session_token, period.startDate, period.endDate),
      listBranchPayrollAdditions(branchAdmin.session_token, period.startDate, period.endDate)
    ])
    const error = employeeError ?? attendanceError ?? contributionError ?? cashAdvanceError
      ?? hdmfPaymentError ?? undertimeError ?? otherDeductionsError ?? additionsError
    if (error) throw error

    return {
      employees,
      attendance: attendance ?? [],
      contributions: contributions ?? [],
      cashAdvancePayments: cashAdvancePayments ?? [],
      hdmfPayments: hdmfPayments ?? [],
      undertimeDeductions: undertimeDeductions ?? [],
      otherDeductions: otherDeductions ?? [],
      payrollAdditions: payrollAdditions ?? []
    }
  }

  const generateAttendanceReport = async () => {
    setIsLoadingReport(true)
    setAttendanceMessage('')
    try {
      const period = getPeriod(attendancePeriodType, attendanceWeekIndex)
      const { employees, attendance } = await loadPeriodData(period)
      const dayNumbers = Array.from({ length: period.endDay - period.startDay + 1 }, (_, index) => period.startDay + index)
      const recordsByEmployeeAndDate = new Map(
        attendance.map((record) => [`${record.employee_code}:${record.attendance_date}`, record.status])
      )
      const rows = [[
        'Employee ID',
        'Employee Name',
        'Position',
        ...dayNumbers.map((day) => `${monthName} ${day}`),
        'Present',
        'Late',
        'Absent'
      ]]

      for (const employee of employees) {
        const statuses = dayNumbers.map((day) => {
          const attendanceDate = getPeriod('monthly', 0).startDate.slice(0, 8) + String(day).padStart(2, '0')
          return statusLabels[recordsByEmployeeAndDate.get(`${employee.id}:${attendanceDate}`)] ?? ''
        })
        rows.push([
          employee.id,
          employee.name,
          employee.position,
          ...statuses,
          statuses.filter((status) => status === 'Present').length,
          statuses.filter((status) => status === 'Late').length,
          statuses.filter((status) => status === 'Absent').length
        ])
      }

      const description = periodDescription(attendancePeriodType, attendanceWeekIndex)
      const suffix = attendancePeriodType === 'weekly' ? `week-${attendanceWeekIndex + 1}` : 'monthly'
      downloadCsv(`attendance-${suffix}-${monthName.toLowerCase()}-${reportYear}.csv`, rows)
      setAttendanceMessage(`Downloaded attendance report for ${description}.`)
    } catch (error) {
      setAttendanceMessage(`Could not generate attendance report: ${error.message}`)
    } finally {
      setIsLoadingReport(false)
    }
  }

  const generatePayrollReport = async () => {
    setIsLoadingReport(true)
    setPayrollMessage('')
    try {
      const period = getPeriod(payrollPeriodType, payrollWeekIndex)
      const { employees, attendance, contributions, cashAdvancePayments, hdmfPayments, undertimeDeductions, otherDeductions, payrollAdditions } = await loadPeriodData(period)
      const attendanceByEmployee = new Map()
      for (const record of attendance) {
        const records = attendanceByEmployee.get(record.employee_code) ?? []
        records.push(record)
        attendanceByEmployee.set(record.employee_code, records)
      }
      const contributionsByEmployee = new Map(contributions.map((record) => [record.employee_code, record]))
      const cashAdvanceDeductionByEmployee = new Map()
      for (const payment of cashAdvancePayments) {
        cashAdvanceDeductionByEmployee.set(
          payment.employee_code,
          (cashAdvanceDeductionByEmployee.get(payment.employee_code) ?? 0) + Number(payment.amount)
        )
      }
      const hdmfDeductionByEmployee = new Map()
      for (const payment of hdmfPayments) {
        hdmfDeductionByEmployee.set(
          payment.employee_code,
          (hdmfDeductionByEmployee.get(payment.employee_code) ?? 0) + Number(payment.amount)
        )
      }
      const undertimeDeductionByEmployee = new Map()
      for (const deduction of undertimeDeductions) {
        undertimeDeductionByEmployee.set(
          deduction.employee_code,
          (undertimeDeductionByEmployee.get(deduction.employee_code) ?? 0) + Number(deduction.amount)
        )
      }
      const otherDeductionByEmployeeAndWeek = new Map()
      for (const deduction of otherDeductions) {
        const key = `${deduction.employee_code}:${deduction.period_start}`
        otherDeductionByEmployeeAndWeek.set(
          key,
          (otherDeductionByEmployeeAndWeek.get(key) ?? 0) + Number(deduction.amount)
        )
      }
      const payrollAdditionsByEmployee = new Map()
      for (const addition of payrollAdditions) {
        const totals = payrollAdditionsByEmployee.get(addition.employee_code) ?? {
          holiday_regular_pay: 0,
          overtime_pay: 0,
          special_nonworking_holiday: 0
        }
        totals[addition.addition_type] += Number(addition.amount)
        payrollAdditionsByEmployee.set(addition.employee_code, totals)
      }
      const periodWeeks = payrollPeriodType === 'weekly'
        ? 1
        : Math.ceil((period.endDay - period.startDay + 1) / 7)
      const rows = [[
        'Employee ID', 'Employee Name', 'Employment Status', 'Monthly Rate (PHP)',
        'Daily Rate (PHP)', 'Working Days (Present)', 'Absent', 'Total Number of Days',
        'Basic Salary (PHP)', 'Regular Holiday (PHP)', 'Overtime (PHP)',
        'Special Non-working Holiday (PHP)', 'Salary Credit (PHP)', 'SSS (PHP)',
        'PhilHealth (PHP)', 'Pag-IBIG (PHP)', 'HDMF Loan (PHP)', 'CA (PHP)',
        'Late (PHP)', 'Und (PHP)', 'Others (PHP)', 'Total Deduction (PHP)', 'Final Net Pay (PHP)',
        'Record Status'
      ]]
      let estimatedNetTotal = 0
      let calculatedEmployees = 0

      for (const employee of employees) {
        const records = attendanceByEmployee.get(employee.id) ?? []
        const presentDays = records.filter(
          (record) => record.status === 'present' || record.status === 'present_late'
        ).length
        const absentDays = records.filter((record) => record.status === 'absent').length
        const hasAttendance = records.some((record) => record.status !== 'not_marked')
        const dailyRate = Number.isFinite(employee.dailyRate) ? employee.dailyRate : null
        const monthlyRate = dailyRate === null ? null : dailyRate * 26
        const basicSalary = hasAttendance && dailyRate !== null ? presentDays * dailyRate : null
        const contribution = contributionsByEmployee.get(employee.id)
        const sss = contribution ? Number(contribution.sss) * periodWeeks : null
        const philhealth = contribution ? Number(contribution.philhealth) * periodWeeks : null
        const pagibig = contribution ? Number(contribution.pagibig) * periodWeeks : null
        const cashAdvanceDeduction = cashAdvanceDeductionByEmployee.get(employee.id) ?? 0
        const hdmfLoanDeduction = hdmfDeductionByEmployee.get(employee.id) ?? 0
        const additions = payrollAdditionsByEmployee.get(employee.id) ?? {
          holiday_regular_pay: 0,
          overtime_pay: 0,
          special_nonworking_holiday: 0
        }
        const totalAdditions = additions.holiday_regular_pay + additions.overtime_pay
          + additions.special_nonworking_holiday
        const lateMinutes = records.reduce(
          (total, record) => total + (record.status === 'present_late' ? Number(record.late_minutes) : 0),
          0
        )
        const lateDeduction = dailyRate === null
          ? 0
          : Math.round((dailyRate / 8 / 60 * lateMinutes) * 100) / 100
        const undertimeDeduction = undertimeDeductionByEmployee.get(employee.id) ?? 0
        let otherDeduction = 0
        for (let weekStartDay = period.startDay; weekStartDay <= period.endDay; weekStartDay += 7) {
          const weekStart = getLocalDateKey(new Date(
            monthStart.getFullYear(),
            monthStart.getMonth(),
            weekStartDay
          ))
          const manualKey = `${employee.id}:${weekStart}`
          otherDeduction += otherDeductionByEmployeeAndWeek.get(manualKey) ?? 0
        }
        const deductionTotal = sss === null
          ? null
          : sss + philhealth + pagibig + hdmfLoanDeduction + cashAdvanceDeduction
            + lateDeduction + undertimeDeduction + otherDeduction
        const salaryCredit = basicSalary === null ? null : basicSalary + totalAdditions
        const net = salaryCredit !== null && deductionTotal !== null
          ? salaryCredit - deductionTotal
          : null

        if (net !== null) {
          estimatedNetTotal += net
          calculatedEmployees += 1
        }

        rows.push([
          employee.id,
          employee.name,
          employee.employmentClassification,
          monthlyRate ?? '',
          dailyRate ?? '',
          hasAttendance ? presentDays : '',
          hasAttendance ? absentDays : '',
          hasAttendance ? presentDays + absentDays : '',
          basicSalary ?? '',
          additions.holiday_regular_pay,
          additions.overtime_pay,
          additions.special_nonworking_holiday,
          salaryCredit ?? '',
          sss ?? '',
          philhealth ?? '',
          pagibig ?? '',
          hdmfLoanDeduction,
          cashAdvanceDeduction,
          lateDeduction,
          undertimeDeduction,
          otherDeduction,
          deductionTotal ?? '',
          net ?? '',
          basicSalary === null ? 'Needs rate or attendance' : !contribution ? 'Needs contributions' : 'Estimated'
        ])
      }

      rows.push([])
      rows.push(['Estimated net total for calculated employees', calculatedEmployees ? estimatedNetTotal.toFixed(2) : 'Awaiting complete data'])
      rows.push(['Calculation', 'Monthly rate = daily rate × 26. Working days include Present and Present (Late); basic salary = daily rate × working days. Salary credit = basic salary + Regular Holiday + Overtime + Special Non-working Holiday. Late = daily rate ÷ 8 ÷ 60 × recorded late minutes. Others are employee-specific deductions entered with a description. Total deduction = SSS + PhilHealth + Pag-IBIG + HDMF loan + CA + Late + Und + Others. Final net pay = Salary credit − Total deduction.'])

      const description = periodDescription(payrollPeriodType, payrollWeekIndex)
      const suffix = payrollPeriodType === 'weekly' ? `week-${payrollWeekIndex + 1}` : 'monthly'
      downloadCsv(`payroll-${suffix}-${monthName.toLowerCase()}-${reportYear}.csv`, rows)
      setPayrollMessage(`Downloaded payroll report for ${description}.`)
    } catch (error) {
      setPayrollMessage(`Could not generate payroll report: ${error.message}`)
    } finally {
      setIsLoadingReport(false)
    }
  }

  return (
    <section className="branch-report-page">
      <header className="branch-report-header">
        <p className="employee-info-eyebrow">{branchName}</p>
        <h3>Branch Reports</h3>
        <p className="employee-info-description">Review saved weekly history and export attendance or payroll records.</p>
      </header>

      <section className="report-section report-history-section">
        <div className="report-section-heading">
          <div>
            <h4>Weekly report history</h4>
            <p>Saved attendance is grouped by month and week. Save a payroll snapshot to preserve that week’s pay and deductions.</p>
          </div>
        </div>

        {isLoadingHistory && <p className="report-history-message" role="status">Loading saved report history…</p>}
        {historyError && <p className="report-history-message error" role="alert">Could not load report history: {historyError}</p>}
        {payrollHistoryError && <p className="report-history-message error" role="alert">Could not load payroll snapshots: {payrollHistoryError}</p>}
        {payrollSnapshotMessage && <p className="report-history-message" role="status">{payrollSnapshotMessage}</p>}
        {!isLoadingHistory && !historyError && historyWeeks.length === 0 && (
          <p className="report-history-message">No attendance history has been saved yet. Save attendance to create weekly reports.</p>
        )}

        {historyWeeks.length > 0 && (
          <div className="report-history-list">
            {historyWeeks.map((week) => {
              const employeeGroups = new Map()
              for (const record of week.records) {
                const employeeRecords = employeeGroups.get(record.employee_code) ?? []
                employeeRecords.push(record)
                employeeGroups.set(record.employee_code, employeeRecords)
              }
              const isExpanded = expandedWeekKey === week.key
              const presentCount = week.records.filter((record) => record.status === 'present').length
              const lateCount = week.records.filter((record) => record.status === 'present_late').length
              const absentCount = week.records.filter((record) => record.status === 'absent').length
              const payrollSnapshot = payrollSnapshotsByStartDate.get(week.dates[0])
              const isSavingPayroll = savingPayrollWeekKey === week.key

              return (
                <article className="report-history-week" key={week.key}>
                  <button
                    type="button"
                    className="report-history-week-toggle"
                    onClick={() => setExpandedWeekKey(isExpanded ? '' : week.key)}
                    aria-expanded={isExpanded}
                    aria-controls={`report-history-${week.key}`}
                  >
                    <span>
                      <strong>{week.label}</strong>
                      <small>
                        {employeeGroups.size} employees · {presentCount} present · {lateCount} late · {absentCount} absent records
                      </small>
                    </span>
                    <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                  </button>

                  {isExpanded && (
                    <div className="report-history-details" id={`report-history-${week.key}`}>
                      <section className="report-weekly-payroll-snapshot">
                        <div className="report-weekly-payroll-heading">
                          <div>
                            <h5>Weekly payroll snapshot</h5>
                            <p>
                              {payrollSnapshot
                                ? `Saved ${formatDate(payrollSnapshot.created_at.slice(0, 10))}. This snapshot does not change when attendance, rates, or contributions are edited.`
                                : 'Save this week’s payroll to keep a permanent record of its attendance, rates, and deductions.'}
                            </p>
                          </div>
                          {!payrollSnapshot && (
                            <button
                              type="button"
                              className="report-download-button"
                              onClick={() => savePayrollSnapshot(week)}
                              disabled={isSavingPayroll || isLoadingHistory || Boolean(historyError) || Boolean(payrollHistoryError)}
                            >
                              {isSavingPayroll ? 'Saving payroll…' : 'Save weekly payroll'}
                            </button>
                          )}
                        </div>
                        {payrollSnapshot && (
                          <>
                            <div className="report-weekly-payroll-totals">
                              <span>Gross: <strong>{formatCurrency(payrollSnapshot.total_gross)}</strong></span>
                              <span>Deductions: <strong>{formatCurrency(payrollSnapshot.total_deductions)}</strong></span>
                              <span>Net pay: <strong>{formatCurrency(payrollSnapshot.net_total)}</strong></span>
                            </div>
                            <div className="report-history-table-wrap" role="region" aria-label={`${week.label} saved payroll`} tabIndex="0">
                              <table className="report-history-table report-payroll-snapshot-table">
                                <thead>
                                  <tr>
                                    <th>Employee</th>
                                    <th>Employee ID</th>
                                    <th>Present</th>
                                    <th>Late</th>
                                    <th>Absent</th>
                                    <th>Weekly gross</th>
                                    <th>SSS</th>
                                    <th>PhilHealth</th>
                                    <th>Holiday regular pay</th>
                                    <th>Overtime pay</th>
                                    <th>Special non-working holiday</th>
                                    <th>Pag-IBIG</th>
                                    <th>Cash advance deduction</th>
                                    <th>HDMF loan deduction</th>
                                    <th>Undertime deduction</th>
                                    <th>Others</th>
                                    <th>Final net pay</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(payrollSnapshot.employees ?? []).map((employee) => (
                                    <tr key={employee.employee_code}>
                                      <td>{employee.employee_name}</td>
                                      <td>{employee.employee_code}</td>
                                      <td>{employee.present_days}</td>
                                      <td>{employee.late_days}</td>
                                      <td>{employee.absent_days}</td>
                                      <td>{formatCurrency(employee.weekly_gross)}</td>
                                      <td>{formatCurrency(employee.sss)}</td>
                                      <td>{formatCurrency(employee.philhealth)}</td>
                                      <td>{formatCurrency(employee.holiday_regular_pay ?? 0)}</td>
                                      <td>{formatCurrency(employee.overtime_pay ?? 0)}</td>
                                      <td>{formatCurrency(employee.special_nonworking_holiday_pay ?? 0)}</td>
                                      <td>{formatCurrency(employee.pagibig)}</td>
                                      <td>{formatCurrency(employee.cash_advance_deduction ?? 0)}</td>
                                      <td>{formatCurrency(employee.hdmf_loan_deduction ?? 0)}</td>
                                      <td>{formatCurrency(employee.undertime_deduction ?? 0)}</td>
                                      <td>{formatCurrency(employee.other_deduction ?? 0)}</td>
                                      <td>{formatCurrency(employee.net_pay)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </section>

                      <div className="report-history-table-wrap" role="region" aria-label={`${week.label} attendance details`} tabIndex="0">
                        <table className="report-history-table">
                          <thead>
                            <tr>
                              <th>Employee</th>
                              <th>Employee ID</th>
                              {week.dates.map((dateKey) => <th key={dateKey}>{formatDate(dateKey, { day: 'numeric' })}</th>)}
                              <th>Present</th>
                              <th>Late</th>
                              <th>Absent</th>
                              <th>Late minutes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...employeeGroups.entries()].map(([employeeCode, records]) => {
                              const employee = records[0]
                              const recordsByDate = new Map(records.map((record) => [record.attendance_date, record]))
                              const present = records.filter((record) => record.status === 'present').length
                              const late = records.filter((record) => record.status === 'present_late').length
                              const absent = records.filter((record) => record.status === 'absent').length
                              const lateMinutes = records.reduce((total, record) => total + record.late_minutes, 0)

                              return (
                                <tr key={employeeCode}>
                                  <td>{employee.employee_name}</td>
                                  <td>{employeeCode}</td>
                                  {week.dates.map((dateKey) => {
                                    const record = recordsByDate.get(dateKey)
                                    return (
                                      <td key={dateKey}>
                                        {record ? reportStatusLabels[record.status] ?? record.status : '—'}
                                      </td>
                                    )
                                  })}
                                  <td>{present}</td>
                                  <td>{late}</td>
                                  <td>{absent}</td>
                                  <td>{lateMinutes}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="report-section">
        <div className="report-section-heading">
          <div>
            <h4>Attendance report</h4>
            <p>Export daily attendance statuses and period totals.</p>
          </div>
          <button type="button" className="report-download-button" onClick={generateAttendanceReport} disabled={isLoadingReport}>
            {isLoadingReport ? 'Preparing…' : 'Download attendance CSV'}
          </button>
        </div>
        <PeriodControls
          id="attendance"
          periodType={attendancePeriodType}
          onPeriodTypeChange={setAttendancePeriodType}
          weekIndex={attendanceWeekIndex}
          onWeekChange={setAttendanceWeekIndex}
        />
        {attendanceMessage && <p className="report-download-message" role="status">{attendanceMessage}</p>}
      </section>

      <section className="report-section">
        <div className="report-section-heading">
          <div>
            <h4>Payroll report</h4>
            <p>Export the complete payroll columns, including employee status, pay rates, attendance, additions, deductions, salary credit, and final net pay.</p>
          </div>
          <button type="button" className="report-download-button" onClick={generatePayrollReport} disabled={isLoadingReport}>
            {isLoadingReport ? 'Preparing…' : 'Download payroll CSV'}
          </button>
        </div>
        <PeriodControls
          id="payroll"
          periodType={payrollPeriodType}
          onPeriodTypeChange={setPayrollPeriodType}
          weekIndex={payrollWeekIndex}
          onWeekChange={setPayrollWeekIndex}
        />
        {payrollMessage && <p className="report-download-message" role="status">{payrollMessage}</p>}
      </section>

      <p className="report-data-note">
        Monthly payroll estimates count saved weekly contribution amounts once per seven-day period in the selected month. HDMF repayments are counted in their assigned payroll weeks.
      </p>
    </section>
  )
}
