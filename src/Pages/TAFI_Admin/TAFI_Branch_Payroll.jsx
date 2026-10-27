import { useEffect, useMemo, useState } from 'react'
import {
  getGuestWeeklyPayrollData,
  getTafiAdminWeeklyPayrollData,
  listGuestEmployeeBranches,
  listTafiAdminBranches
} from '../../lib/supabase'
import { getAttendanceDayValue, getLocalDateKey } from '../Branch_admin/branchAttendanceRecords'
import { downloadPayrollWorkbook } from './payrollXlsxExport'
import { getPayrollPeriods } from '../../lib/payrollPeriods'

const formatCurrency = (amount) => amount.toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const sumByEmployee = (records) => Object.fromEntries(
  (records ?? []).reduce((totals, record) => {
    totals.set(
      record.employee_code,
      (totals.get(record.employee_code) ?? 0) + Number(record.amount)
    )
    return totals
  }, new Map())
)

const getEmploymentStatusLabel = (classification) => (
  typeof classification === 'string' && classification.trim()
    ? classification.trim()
    : 'Unspecified'
)

export default function TafiBranchPayroll({ sessionToken, readOnly = false }) {
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [branchStatus, setBranchStatus] = useState('loading')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0)
  const [selectedPayrollRowKey, setSelectedPayrollRowKey] = useState('')
  const [employees, setEmployees] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [contributions, setContributions] = useState({})
  const [cashAdvances, setCashAdvances] = useState({})
  const [hdmfPayments, setHdmfPayments] = useState({})
  const [undertimeDeductions, setUndertimeDeductions] = useState({})
  const [otherDeductions, setOtherDeductions] = useState({})
  const [payrollAdditions, setPayrollAdditions] = useState({})
  const [payrollStatus, setPayrollStatus] = useState('loading')
  const [payrollError, setPayrollError] = useState('')
  const [isDownloadingXlsx, setIsDownloadingXlsx] = useState(false)
  const [xlsxMessage, setXlsxMessage] = useState('')
  const [isXlsxOptionsOpen, setIsXlsxOptionsOpen] = useState(false)
  const [selectedXlsxClassifications, setSelectedXlsxClassifications] = useState([])

  const payrollMonthStart = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    return new Date(year, month - 1, 1)
  }, [selectedMonth])
  const payrollMonthLabel = payrollMonthStart.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
  const payrollWeeks = useMemo(() => getPayrollPeriods(selectedMonth), [selectedMonth])
  const selectedWeek = payrollWeeks[selectedWeekIndex] ?? payrollWeeks[0]
  const selectedStartDate = selectedWeek?.startDate ?? getLocalDateKey(payrollMonthStart)
  const selectedEndDate = selectedWeek?.endDate ?? selectedStartDate
  const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)

  useEffect(() => {
    let isCurrent = true

    const loadBranches = async () => {
      if (!sessionToken) {
        setPayrollError(`Your ${readOnly ? 'Guest' : 'TAFI Admin'} session is missing. Sign in again to load payroll data.`)
        setBranchStatus('error')
        setPayrollStatus('error')
        return
      }

      setBranchStatus('loading')
      const { data, error } = readOnly
        ? await listGuestEmployeeBranches(sessionToken)
        : await listTafiAdminBranches(sessionToken)
      if (!isCurrent) return

      if (error) {
        setPayrollError(error.message)
        setBranchStatus('error')
        setPayrollStatus('error')
        return
      }

      const loadedBranches = data ?? []
      setBranches(loadedBranches)
      setSelectedBranchId((currentBranchId) => (
        loadedBranches.some((branch) => branch.branch_id === currentBranchId)
          ? currentBranchId
          : loadedBranches[0]?.branch_id ?? ''
      ))
      setBranchStatus('ready')
      if (loadedBranches.length === 0) setPayrollStatus('ready')
    }

    loadBranches()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, readOnly])

  useEffect(() => {
    let isCurrent = true

    const loadPayroll = async () => {
      if (!selectedBranchId || branchStatus !== 'ready') return

      setPayrollStatus('loading')
      setPayrollError('')
      setEmployees([])
      setAttendanceRecords([])
      setContributions({})
      setCashAdvances({})
      setHdmfPayments({})
      setUndertimeDeductions({})
      setOtherDeductions({})
      setPayrollAdditions({})

      const getPayrollData = readOnly ? getGuestWeeklyPayrollData : getTafiAdminWeeklyPayrollData
      const { data, error } = await getPayrollData(
        sessionToken, selectedBranchId, selectedStartDate, selectedEndDate
      )
      if (!isCurrent) return

      if (error) {
        setPayrollError(error.message)
        setPayrollStatus('error')
        return
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        setPayrollError('The payroll service returned invalid data.')
        setPayrollStatus('error')
        return
      }

      setEmployees((data.employees ?? []).map((employee) => ({
        id: employee.employee_code,
        name: employee.employee_name,
        position: employee.position ?? '',
        dailyRate: Number(employee.daily_rate),
        employmentClassification: employee.employment_classification ?? ''
      })))
      setAttendanceRecords(data.attendance ?? [])
      setCashAdvances(sumByEmployee(data.cash_advance_payments))
      setHdmfPayments(sumByEmployee(data.hdmf_payments))
      setUndertimeDeductions(sumByEmployee(data.undertime_deductions))
      setOtherDeductions(sumByEmployee(data.other_deductions))
      setPayrollAdditions(Object.fromEntries(
        (data.payroll_additions ?? []).reduce((totals, addition) => {
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
        (data.contributions ?? []).map((record) => [
          record.employee_code,
          {
            sss: Number(record.sss),
            philhealth: Number(record.philhealth),
            pagibig: Number(record.pagibig)
          }
        ])
      ))
      setPayrollStatus('ready')
    }

    loadPayroll()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, readOnly, selectedBranchId, branchStatus, selectedStartDate, selectedEndDate])

  const payrollRows = useMemo(() => employees.map((employee) => {
    const employeeRecords = attendanceRecords.filter((record) =>
      record.employee_code === employee.id
      && record.attendance_date >= selectedStartDate
      && record.attendance_date <= selectedEndDate
    )
    const presentDays = employeeRecords.reduce(
      (total, record) => total + getAttendanceDayValue(record.status),
      0
    )
    const leaveWithPayDays = employeeRecords.filter((record) => record.status === 'vl_with_pay').length
    const paidDays = presentDays + leaveWithPayDays
    const hasAttendance = employeeRecords.some((record) => record.status !== 'not_marked')
    const dailyRate = Number.isFinite(employee.dailyRate) ? employee.dailyRate : null
    const monthlyRate = dailyRate === null ? null : dailyRate * 26
    const basicSalary = hasAttendance && dailyRate !== null ? paidDays * dailyRate : null
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
    const otherDeduction = otherDeductions[employee.id] ?? 0
    const totalDeductions = sss + philhealth + pagibig + cashAdvanceDeduction
      + hdmfLoanDeduction + lateDeduction + undertimeDeduction + otherDeduction
    const salaryCredit = basicSalary === null ? null : basicSalary + totalAdditions

    return {
      ...employee,
      hasAttendance,
      presentDays,
      leaveWithPayDays,
      totalDays: hasAttendance ? paidDays : null,
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
      otherDeduction,
      totalDeductions,
      ...additions,
      totalAdditions,
      weeklyNet: payrollStatus === 'ready' && contribution && salaryCredit !== null
        ? salaryCredit - totalDeductions
        : null
    }
  }), [employees, attendanceRecords, selectedStartDate, selectedEndDate, contributions, cashAdvances, hdmfPayments, undertimeDeductions, otherDeductions, payrollAdditions, payrollStatus])

  const xlsxEmploymentClassifications = useMemo(() => {
    const availableClassifications = new Set(
      payrollRows.map((employee) => getEmploymentStatusLabel(employee.employmentClassification))
    )
    const standardClassifications = ['Regular', 'Probationary', 'Trainee', 'OnCall', 'Unspecified']
    return [
      ...standardClassifications.filter((classification) => availableClassifications.has(classification)),
      ...[...availableClassifications]
        .filter((classification) => !standardClassifications.includes(classification))
        .sort((first, second) => first.localeCompare(second))
    ]
  }, [payrollRows])

  const estimatedTotal = payrollRows.reduce((total, employee) =>
    total + (employee.salaryCredit ?? 0), 0)
  const calculatedCount = payrollRows.filter((employee) => employee.basicSalary !== null).length
  const estimatedDeductions = payrollRows.reduce(
    (total, employee) => total + (employee.basicSalary === null || !employee.hasContributions ? 0 : employee.totalDeductions),
    0
  )
  const missingContributionCount = payrollRows.filter(
    (employee) => employee.basicSalary !== null && !employee.hasContributions
  ).length
  const estimatedNetTotal = payrollRows.reduce((total, employee) => total + (employee.weeklyNet ?? 0), 0)

  const openPayrollXlsxOptions = () => {
    if (payrollStatus !== 'ready' || !selectedBranchId || isDownloadingXlsx) return

    setSelectedXlsxClassifications(xlsxEmploymentClassifications)
    setIsXlsxOptionsOpen(true)
  }

  const downloadPayrollXlsx = async () => {
    if (payrollStatus !== 'ready' || !selectedBranchId || isDownloadingXlsx) return

    const selectedRows = payrollRows.filter((employee) =>
      selectedXlsxClassifications.includes(getEmploymentStatusLabel(employee.employmentClassification))
    )
    if (selectedRows.length === 0) return

    setIsXlsxOptionsOpen(false)
    setIsDownloadingXlsx(true)
    setXlsxMessage('')
    try {
      const fileName = await downloadPayrollWorkbook({
        payrollRows: selectedRows,
        branchName: selectedBranch?.branch_name ?? 'Branch',
        selectedMonth,
        selectedWeek,
        payrollMonthLabel,
        selectedStartDate,
        selectedEndDate
      })
      setXlsxMessage(`Downloaded ${fileName}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.'
      setXlsxMessage(`Could not create the Excel file: ${message}`)
    } finally {
      setIsDownloadingXlsx(false)
    }
  }

  return (
    <section className="branch-payroll-shell">
      <header className="branch-payroll-header">
        <div>
          <p className="employee-info-eyebrow">{selectedBranch?.branch_name ?? (readOnly ? 'Guest' : 'TAFI Admin')}</p>
          <h3>Weekly Payroll</h3>
          <p className="employee-info-description">Payroll shows monthly rate, attendance-based basic salary, additional earnings, deductions, and estimated final net pay for the selected branch and week.</p>
        </div>
        <div className="payroll-period-controls">
          <label className="payroll-period-control">
            <span>Branch</span>
            <select
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              disabled={branchStatus !== 'ready' || branches.length === 0}
            >
              {branches.length === 0 && <option value="">No branches available</option>}
              {branches.map((branch) => (
                <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
              ))}
            </select>
          </label>
          <label className="payroll-period-control">
            <span>Payroll month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                if (!event.target.value) return
                setSelectedMonth(event.target.value)
                setSelectedWeekIndex(0)
              }}
            />
          </label>
          <label className="payroll-period-control">
            <span>Payroll period</span>
            <select
              value={selectedWeekIndex}
              onChange={(event) => setSelectedWeekIndex(Number(event.target.value))}
            >
              {payrollWeeks.map((week) => (
                <option key={week.index} value={week.index}>
                  {week.label} · {payrollMonthLabel.split(' ')[0]} {week.startDay}–{week.endDay}
                </option>
              ))}
            </select>
          </label>
          {!readOnly && <button
            type="button"
            className="report-download-button"
            onClick={openPayrollXlsxOptions}
            disabled={payrollStatus !== 'ready' || !selectedBranchId || isDownloadingXlsx}
          >
            {isDownloadingXlsx ? 'Preparing XLSX…' : 'Download payroll XLSX'}
          </button>}
        </div>
      </header>

      {!readOnly && xlsxMessage && (
        <p
          className={`payroll-contribution-message${xlsxMessage.startsWith('Could not') ? ' error' : ''}`}
          role={xlsxMessage.startsWith('Could not') ? 'alert' : 'status'}
        >
          {xlsxMessage}
        </p>
      )}

      {!readOnly && isXlsxOptionsOpen && (
        <div
          className="payroll-xlsx-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsXlsxOptionsOpen(false)
          }}
        >
          <section
            className="payroll-xlsx-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payroll-xlsx-dialog-title"
          >
            <div className="payroll-xlsx-dialog-heading">
              <div>
                <h4 id="payroll-xlsx-dialog-title">Choose employment statuses</h4>
                <p>Select which employees to include in this payroll XLSX.</p>
              </div>
              <button
                type="button"
                className="payroll-xlsx-dialog-close"
                aria-label="Close employment status selection"
                onClick={() => setIsXlsxOptionsOpen(false)}
              >
                ×
              </button>
            </div>
            {xlsxEmploymentClassifications.length > 0 ? (
              <fieldset className="payroll-xlsx-status-list">
                <legend>Employment status</legend>
                {xlsxEmploymentClassifications.map((classification) => (
                  <label className="payroll-xlsx-status-option" key={classification}>
                    <input
                      type="checkbox"
                      checked={selectedXlsxClassifications.includes(classification)}
                      onChange={(event) => {
                        setSelectedXlsxClassifications((current) => (
                          event.target.checked
                            ? [...current, classification]
                            : current.filter((selected) => selected !== classification)
                        ))
                      }}
                    />
                    <span>{classification}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="payroll-xlsx-empty">There are no employees in this payroll period.</p>
            )}
            <div className="payroll-xlsx-dialog-actions">
              <button
                type="button"
                className="payroll-xlsx-cancel-button"
                onClick={() => setIsXlsxOptionsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="report-download-button"
                onClick={downloadPayrollXlsx}
                disabled={selectedXlsxClassifications.length === 0 || isDownloadingXlsx}
              >
                {isDownloadingXlsx ? 'Preparing XLSX…' : 'Download XLSX'}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="payroll-summary-grid">
        <div className="payroll-summary-card">
          <span>Selected period</span>
          <strong>{selectedWeek.label} · {payrollMonthLabel.split(' ')[0]} {selectedWeek.startDay}–{selectedWeek.endDay}</strong>
        </div>
        <div className="payroll-summary-card">
          <span>Estimated salary credit</span>
          <strong>{calculatedCount === 0 ? 'Awaiting data' : formatCurrency(estimatedTotal)}</strong>
        </div>
        <div className="payroll-summary-card">
          <span>Total weekly deductions</span>
          <strong>{payrollStatus !== 'ready' ? 'Unavailable' : formatCurrency(estimatedDeductions)}</strong>
          {payrollStatus === 'ready' && missingContributionCount > 0 && (
            <small>{missingContributionCount} employees need contribution entries</small>
          )}
        </div>
        <div className="payroll-summary-card">
          <span>Estimated net pay</span>
          <strong>
            {payrollStatus !== 'ready' || calculatedCount === 0 || missingContributionCount > 0
              ? 'Awaiting complete data'
              : formatCurrency(estimatedNetTotal)}
          </strong>
        </div>
      </div>

      {payrollStatus === 'loading' && (
        <p className="payroll-contribution-message" role="status">Loading weekly payroll data…</p>
      )}
      {payrollStatus === 'error' && (
        <p className="payroll-contribution-message error" role="alert">
          Could not calculate final pay: {payrollError}
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
              <th>Present days</th>
              <th>Leave with Pay</th>
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
              <th>Others</th>
              <th>Total deduction</th>
              <th>Final net pay</th>
              <th>Record status</th>
            </tr>
          </thead>
          <tbody>
            {payrollRows.map((employee) => {
              const rowKey = `${selectedBranchId}:${selectedStartDate}:${selectedEndDate}:${employee.id}`
              const isSelected = selectedPayrollRowKey === rowKey
              return (
              <tr
                key={employee.id}
                className={isSelected ? 'selected' : ''}
                aria-selected={isSelected}
                tabIndex="0"
                onClick={() => setSelectedPayrollRowKey(rowKey)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedPayrollRowKey(rowKey)
                  }
                }}
              >
                <td>{employee.id}</td>
                <td><strong>{employee.name}</strong></td>
                <td>{employee.employmentClassification || '—'}</td>
                <td>{employee.monthlyRate === null ? 'Not set' : formatCurrency(employee.monthlyRate)}</td>
                <td>{employee.dailyRate === null ? 'Not set' : formatCurrency(employee.dailyRate)}</td>
                <td>{employee.hasAttendance ? employee.presentDays : '—'}</td>
                <td>{employee.hasAttendance ? employee.leaveWithPayDays : '—'}</td>
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
                <td>{formatCurrency(employee.otherDeduction)}</td>
                <td>{employee.hasContributions ? formatCurrency(employee.totalDeductions) : '—'}</td>
                <td className="weekly-payroll-amount">
                  {employee.weeklyNet === null ? '—' : formatCurrency(employee.weeklyNet)}
                </td>
                <td>
                  <span className={`payroll-record-status ${employee.basicSalary === null || payrollStatus !== 'ready' ? 'incomplete' : 'ready'}`}>
                    {employee.basicSalary === null
                      ? 'Needs data'
                      : payrollStatus !== 'ready'
                        ? 'Needs contributions'
                        : !employee.hasContributions
                          ? 'Set contributions'
                          : 'Calculated'}
                  </span>
                </td>
              </tr>
              )
            })}
            {payrollRows.length === 0 && payrollStatus === 'ready' && (
              <tr><td className="employee-empty-state" colSpan="24">No active employees in this branch.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="payroll-calculation-note">
        Monthly rate is daily rate × 26. Total paid days include attendance marked Present, Present (Late), or Leave with Pay; basic salary is daily rate × total paid days. Salary credit adds regular holiday, overtime, and special non-working holiday pay. Late deduction is daily rate ÷ 8 ÷ 60 × recorded late minutes; Und is the separately entered weekly undertime deduction. Others includes employee-specific deductions entered with a description. Total deduction includes SSS, PhilHealth, Pag-IBIG, HDMF loan, cash advance (CA), late, Und, and Others. Final net pay is salary credit minus total deduction.
      </p>
    </section>
  )
}