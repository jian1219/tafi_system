import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import {
  createBranchCashAdvanceLoan,
  listBranchCashAdvanceLoans,
  listBranchCashAdvancePayments,
  saveBranchCashAdvanceWeeklyDeductions,
  updateBranchCashAdvanceLoanAmount
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'
import { getPayrollPeriods } from '../../lib/payrollPeriods'

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

const getPaymentKey = (loanId, periodStart) => `${loanId}:${periodStart}`
const cashAdvanceEditWindowDays = 3
const canEditCashAdvanceOnDate = (advanceDate, todayDateKey) => {
  const advanceDay = Date.parse(`${advanceDate}T00:00:00Z`)
  const todayDay = Date.parse(`${todayDateKey}T00:00:00Z`)
  const daysSinceAdvance = (todayDay - advanceDay) / 86400000
  return Number.isInteger(daysSinceAdvance)
    && daysSinceAdvance >= 0
    && daysSinceAdvance <= cashAdvanceEditWindowDays
}

export default function BranchCashAdvance({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [employees, setEmployees] = useState([])
  const [advances, setAdvances] = useState([])
  const [weeklyDeductions, setWeeklyDeductions] = useState({})
  const [employeeCode, setEmployeeCode] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => getLocalDateKey(today))
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState('all')
  const [todayDateKey, setTodayDateKey] = useState(() => getLocalDateKey(today))
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [savingAdvanceId, setSavingAdvanceId] = useState('')
  const [editingAdvanceId, setEditingAdvanceId] = useState('')
  const [editingAdvanceAmount, setEditingAdvanceAmount] = useState('')
  const [updatingAdvanceId, setUpdatingAdvanceId] = useState('')
  const sessionToken = branchAdmin?.session_token
  const payrollWeeks = useMemo(() => getPayrollPeriods(selectedMonth), [selectedMonth])
  const openPayrollWeeks = payrollWeeks.filter((week) => week.endDate >= todayDateKey)
  const filteredAdvances = useMemo(
    () => advances.filter((advance) => {
      if (advanceStatusFilter === 'all') return true
      const isPaid = Number(advance.balance) <= 0
      return advanceStatusFilter === 'paid' ? isPaid : !isPaid
    }),
    [advanceStatusFilter, advances]
  )

  useEffect(() => {
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timeout = window.setTimeout(() => setTodayDateKey(getLocalDateKey(new Date())), nextMidnight.getTime() - now.getTime())
    return () => window.clearTimeout(timeout)
  }, [todayDateKey])

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

  const canEditAdvance = (advance) => canEditCashAdvanceOnDate(advance.advance_date, todayDateKey)

  const startEditingAdvance = (advance) => {
    setEditingAdvanceId(advance.id)
    setEditingAdvanceAmount(String(advance.advance_amount))
    setError('')
    setMessage('')
  }

  const saveAdvanceAmount = async (event, advance) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const amountText = editingAdvanceAmount.trim()
    const amount = Number(amountText)
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount)
      || amount <= 0 || amount > 9999999999.99) {
      setError('Enter an amount greater than zero with no more than two decimal places.')
      return
    }

    setUpdatingAdvanceId(advance.id)
    const { error: updateError } = await updateBranchCashAdvanceLoanAmount(
      sessionToken,
      advance.id,
      amount
    )
    setUpdatingAdvanceId('')
    if (updateError) {
      setError(updateError.message)
      return
    }

    setEditingAdvanceId('')
    setStatus('loading')
    const refreshed = await refreshData()
    if (refreshed) {
      setMessage('Cash advance amount updated.')
      setStatus('ready')
    }
  }

  const saveWeeklyDeductions = async (advance) => {
    setError('')
    setMessage('')
    const deductions = openPayrollWeeks.map((week) => {
      const rawAmount = weeklyDeductions[getPaymentKey(advance.id, week.startDate)] ?? ''
      return {
        periodStart: week.startDate,
        periodEnd: week.endDate,
        amount: rawAmount.trim() === '' ? 0 : Number(rawAmount)
      }
    })
    if (deductions.length === 0) return
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
        <div className="cash-advance-monitor-filters">
          <label className="cash-advance-month-control">
            <span>Monitoring month</span>
            <input
              type="month"
              value={selectedMonth}
              required
              disabled={isSaving || Boolean(savingAdvanceId) || Boolean(updatingAdvanceId)}
              onChange={(event) => {
                if (!event.target.value) return
                setSelectedMonth(event.target.value)
                setMessage('')
                setError('')
                setStatus('loading')
              }}
            />
          </label>
          <label className="cash-advance-month-control">
            <span>Payment status</span>
            <select
              value={advanceStatusFilter}
              onChange={(event) => setAdvanceStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
        </div>
      </div>
      <div className="cash-advance-table-wrap" role="region" aria-label="Cash advance repayment monitoring" tabIndex="0">
        <table className="cash-advance-table cash-advance-monitor-table">
          <thead>
            <tr>
              <th>Employee name</th>
              <th>Date cash advance</th>
              <th>Cash advance amount</th>
              {payrollWeeks.map((week) => (
                <th key={week.startDate}>{week.label}<small>{formatDate(week.startDate)}–{formatDate(week.endDate)}</small></th>
              ))}
              <th>Total deducted</th>
              <th>Remaining balance</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredAdvances.map((advance) => (
              <tr key={advance.id}>
                <td>
                  <strong>{advance.employee_name}</strong>
                  <span className="payroll-employee-id">{advance.employee_code}</span>
                </td>
                <td>{formatDate(advance.advance_date)}</td>
                <td>
                  {editingAdvanceId === advance.id && canEditAdvance(advance) ? (
                    <form className="cash-advance-amount-editor" onSubmit={(event) => saveAdvanceAmount(event, advance)}>
                      <input
                        className="cash-advance-week-input"
                        type="number"
                        min="0.01"
                        max="9999999999.99"
                        step="0.01"
                        value={editingAdvanceAmount}
                        onChange={(event) => setEditingAdvanceAmount(event.target.value)}
                        aria-label={`Cash advance amount for ${advance.employee_name}`}
                        disabled={updatingAdvanceId === advance.id}
                      />
                      <button
                        type="submit"
                        className="cash-advance-amount-icon"
                        aria-label={`Save cash advance amount for ${advance.employee_name}`}
                        disabled={updatingAdvanceId === advance.id}
                      >
                        <Check size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="cash-advance-amount-icon"
                        aria-label={`Cancel cash advance amount edit for ${advance.employee_name}`}
                        onClick={() => setEditingAdvanceId('')}
                        disabled={updatingAdvanceId === advance.id}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <div className="cash-advance-amount-display">
                      <span>{formatCurrency(advance.advance_amount)}</span>
                      {canEditAdvance(advance) && (
                        <button
                          type="button"
                          className="cash-advance-amount-icon"
                          aria-label={`Edit cash advance amount for ${advance.employee_name}`}
                          title="Edit cash advance amount"
                          onClick={() => startEditingAdvance(advance)}
                          disabled={status !== 'ready' || Boolean(updatingAdvanceId) || Boolean(savingAdvanceId)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
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
                        aria-label={`${week.label} cash advance deduction for ${advance.employee_name}`}
                        disabled={week.endDate < todayDateKey || Number(advance.balance) <= 0 || Boolean(savingAdvanceId) || Boolean(updatingAdvanceId)}
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
                    disabled={status !== 'ready' || isSaving || Boolean(savingAdvanceId) || Boolean(updatingAdvanceId) || openPayrollWeeks.length === 0}
                  >
                    {savingAdvanceId === advance.id ? 'Saving…' : 'Save weeks'}
                  </button>
                </td>
              </tr>
            ))}
            {status === 'ready' && filteredAdvances.length === 0 && (
              <tr>
                <td className="employee-empty-state" colSpan={7 + payrollWeeks.length}>
                  {advances.length === 0
                    ? 'No cash advances have been recorded.'
                    : `No ${advanceStatusFilter} cash advances found.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="cash-advance-month-note">Showing weekly deductions for {monthLabel}. Choose a different month to review or update another month’s repayments.</p>
    </section>
  )
}
