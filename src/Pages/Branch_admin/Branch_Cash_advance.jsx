import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createBranchCashAdvanceLoan,
  listBranchCashAdvanceLoans,
  listBranchCashAdvancePayments,
  saveBranchCashAdvanceWeeklyDeductions
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const formatDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

const getPayrollWeeks = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number)
  const dayCount = new Date(year, month, 0).getDate()
  return Array.from({ length: Math.ceil(dayCount / 7) }, (_, index) => {
    const startDay = index * 7 + 1
    const endDay = Math.min((index + 1) * 7, dayCount)
    return {
      index,
      startDate: getLocalDateKey(new Date(year, month - 1, startDay)),
      endDate: getLocalDateKey(new Date(year, month - 1, endDay))
    }
  })
}

const getPaymentKey = (loanId, periodStart) => `${loanId}:${periodStart}`

export default function BranchCashAdvance({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [employees, setEmployees] = useState([])
  const [advances, setAdvances] = useState([])
  const [weeklyDeductions, setWeeklyDeductions] = useState({})
  const [employeeCode, setEmployeeCode] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => getLocalDateKey(today))
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [savingAdvanceId, setSavingAdvanceId] = useState('')
  const sessionToken = branchAdmin?.session_token
  const payrollWeeks = useMemo(() => getPayrollWeeks(selectedMonth), [selectedMonth])

  const fetchData = useCallback(async (monthKey) => {
    if (!sessionToken) return { employees: [], advances: [], payments: [], error: null }
    const [year, month] = monthKey.split('-').map(Number)
    const monthStart = getLocalDateKey(new Date(year, month - 1, 1))
    const monthEnd = getLocalDateKey(new Date(year, month, 0))
    const [
      { employees: loadedEmployees, error: employeeError },
      { data: loadedAdvances, error: advanceError },
      { data: loadedPayments, error: paymentError }
    ] = await Promise.all([
      getBranchEmployees(sessionToken),
      listBranchCashAdvanceLoans(sessionToken),
      listBranchCashAdvancePayments(sessionToken, monthStart, monthEnd)
    ])
    return {
      employees: loadedEmployees,
      advances: loadedAdvances ?? [],
      payments: loadedPayments ?? [],
      error: employeeError ?? advanceError ?? paymentError
    }
  }, [sessionToken])

  useEffect(() => {
    let isCurrent = true

    const loadData = async () => {
      if (!sessionToken) {
        setError('Your login session is missing. Apply the Supabase contribution SQL, then sign out and sign in again.')
        setStatus('error')
        return
      }

      const result = await fetchData(selectedMonth)
      if (!isCurrent) return
      if (result.error) {
        setError(result.error.message)
        setStatus('error')
        return
      }

      setEmployees(result.employees)
      setAdvances(result.advances)
      setEmployeeCode((current) => current || result.employees[0]?.id || '')
      setWeeklyDeductions(Object.fromEntries(
        result.payments.map((payment) => [
          getPaymentKey(payment.advance_id, payment.period_start),
          String(payment.amount)
        ])
      ))
      setError('')
      setStatus('ready')
    }

    loadData()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, selectedMonth, fetchData])

  const refreshData = async (monthKey = selectedMonth) => {
    const result = await fetchData(monthKey)
    if (result.error) {
      setError(`Saved, but the cash advance monitor could not refresh: ${result.error.message}`)
      setStatus('error')
      return false
    }

    setEmployees(result.employees)
    setAdvances(result.advances)
    setWeeklyDeductions(Object.fromEntries(
      result.payments.map((payment) => [
        getPaymentKey(payment.advance_id, payment.period_start),
        String(payment.amount)
      ])
    ))
    setError('')
    return true
  }

  const handleCreateAdvance = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const amount = Number(advanceAmount)
    if (!sessionToken || !employeeCode || !advanceDate || !Number.isFinite(amount) || amount <= 0) {
      setError('Choose an employee, enter the cash advance date, and enter an amount greater than zero.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await createBranchCashAdvanceLoan(sessionToken, {
      employeeCode,
      advanceDate,
      advanceAmount: amount
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    setAdvanceAmount('')
    setStatus('loading')
    const refreshed = await refreshData()
    if (refreshed) {
      setMessage('Cash advance saved. Enter each weekly repayment in the monitoring table.')
      setStatus('ready')
    }
    setIsSaving(false)
  }

  const saveWeeklyDeductions = async (advance) => {
    setError('')
    setMessage('')
    const deductions = payrollWeeks.map((week) => {
      const rawAmount = weeklyDeductions[getPaymentKey(advance.id, week.startDate)] ?? ''
      return {
        periodStart: week.startDate,
        periodEnd: week.endDate,
        amount: rawAmount.trim() === '' ? 0 : Number(rawAmount)
      }
    })
    if (deductions.some(({ amount }) => !Number.isFinite(amount) || amount < 0)) {
      setError(`Enter valid non-negative weekly amounts for ${advance.employee_name}.`)
      return
    }

    setSavingAdvanceId(advance.id)
    const { error: saveError } = await saveBranchCashAdvanceWeeklyDeductions(
      sessionToken,
      advance.id,
      deductions
    )
    if (saveError) {
      setError(`Could not save weekly deductions for ${advance.employee_name}: ${saveError.message}`)
      setSavingAdvanceId('')
      return
    }

    const refreshed = await refreshData()
    if (refreshed) setMessage(`Weekly deductions saved for ${advance.employee_name}.`)
    setSavingAdvanceId('')
  }

  const monthLabel = new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })

  return (
    <section className="branch-cash-advance-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Branch Cash Advance</h3>
          <p className="employee-info-description">
            Track each employee’s cash advance and enter a partial deduction for each payroll week until the balance is paid.
          </p>
        </div>
      </header>

      <form className="cash-advance-form" onSubmit={handleCreateAdvance}>
        <label>
          <span>Employee</span>
          <select
            value={employeeCode}
            onChange={(event) => setEmployeeCode(event.target.value)}
            required
            disabled={status !== 'ready' || employees.length === 0}
          >
            {employees.length === 0 && <option value="">No employees available</option>}
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name} · {employee.id}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Date cash advance</span>
          <input
            type="date"
            value={advanceDate}
            onChange={(event) => setAdvanceDate(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Cash advance amount (PHP)</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={advanceAmount}
            onChange={(event) => setAdvanceAmount(event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={isSaving || status !== 'ready' || employees.length === 0}>
          {isSaving ? 'Saving…' : 'Save cash advance'}
        </button>
      </form>

      {status === 'loading' && <p className="cash-advance-message" role="status">Loading employees and cash advance monitoring…</p>}
      {error && <p className="cash-advance-message error" role="alert">{error}</p>}
      {message && <p className="cash-advance-message" role="status">{message}</p>}

      <div className="cash-advance-history-heading cash-advance-monitor-heading">
        <div>
          <h4>Cash advance repayment monitoring</h4>
          <p>Enter each week’s amount, then save that employee’s weekly deduction schedule.</p>
        </div>
        <label className="cash-advance-month-control">
          <span>Monitoring month</span>
          <input
            type="month"
            value={selectedMonth}
            required
            disabled={isSaving || Boolean(savingAdvanceId)}
            onChange={(event) => {
              if (!event.target.value) return
              setSelectedMonth(event.target.value)
              setMessage('')
              setError('')
              setStatus('loading')
            }}
          />
        </label>
      </div>
      <div className="cash-advance-table-wrap" role="region" aria-label="Cash advance repayment monitoring" tabIndex="0">
        <table className="cash-advance-table cash-advance-monitor-table">
          <thead>
            <tr>
              <th>Employee name</th>
              <th>Date cash advance</th>
              <th>Cash advance amount</th>
              {payrollWeeks.map((week) => (
                <th key={week.startDate}>Week {week.index + 1}<small>{formatDate(week.startDate)}–{formatDate(week.endDate)}</small></th>
              ))}
              <th>Total deducted</th>
              <th>Remaining balance</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {advances.map((advance) => (
              <tr key={advance.id}>
                <td>
                  <strong>{advance.employee_name}</strong>
                  <span className="payroll-employee-id">{advance.employee_code}</span>
                </td>
                <td>{formatDate(advance.advance_date)}</td>
                <td>{formatCurrency(advance.advance_amount)}</td>
                {payrollWeeks.map((week) => {
                  const key = getPaymentKey(advance.id, week.startDate)
                  return (
                    <td key={week.startDate}>
                      <input
                        className="cash-advance-week-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={weeklyDeductions[key] ?? ''}
                        onChange={(event) => setWeeklyDeductions((current) => ({
                          ...current,
                          [key]: event.target.value
                        }))}
                        aria-label={`Week ${week.index + 1} cash advance deduction for ${advance.employee_name}`}
                        disabled={Number(advance.balance) <= 0 || Boolean(savingAdvanceId)}
                      />
                    </td>
                  )
                })}
                <td>{formatCurrency(advance.amount_paid)}</td>
                <td>{formatCurrency(advance.balance)}</td>
                <td>
                  <span className={`cash-advance-status ${Number(advance.balance) <= 0 ? 'paid' : 'unpaid'}`}>
                    {Number(advance.balance) <= 0 ? 'Paid' : 'Unpaid'}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="cash-advance-save-button"
                    onClick={() => saveWeeklyDeductions(advance)}
                    disabled={status !== 'ready' || isSaving || Boolean(savingAdvanceId)}
                  >
                    {savingAdvanceId === advance.id ? 'Saving…' : 'Save weeks'}
                  </button>
                </td>
              </tr>
            ))}
            {status === 'ready' && advances.length === 0 && (
              <tr><td className="employee-empty-state" colSpan={7 + payrollWeeks.length}>No cash advances have been recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="cash-advance-month-note">Showing weekly deductions for {monthLabel}. Choose a different month to review or update another month’s repayments.</p>
    </section>
  )
}
