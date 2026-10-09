import { useCallback, useEffect, useState } from 'react'
import {
  createBranchHdmfLoan,
  createBranchHdmfPayment,
  createBranchOtherDeduction,
  listBranchHdmfLoans,
  listBranchHdmfPayments,
  listBranchOtherDeductions,
  listBranchUndertimeDeductions,
  saveBranchUndertimeMinutes
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const today = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
const monthDayCount = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
const monthName = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const payrollWeeks = Array.from({ length: Math.ceil(monthDayCount / 7) }, (_, index) => {
  const startDay = index * 7 + 1
  const endDay = Math.min((index + 1) * 7, monthDayCount)
  return {
    index,
    startDate: getLocalDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), startDay)),
    endDate: getLocalDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), endDay)),
    label: `Week ${index + 1} · ${monthName.split(' ')[0]} ${startDay}–${endDay}`
  }
})

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

export default function BranchOtherDeduction({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [employees, setEmployees] = useState([])
  const [loans, setLoans] = useState([])
  const [payments, setPayments] = useState([])
  const [undertimeDeductions, setUndertimeDeductions] = useState([])
  const [otherDeductions, setOtherDeductions] = useState([])
  const [employeeCode, setEmployeeCode] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [selectedLoanId, setSelectedLoanId] = useState('')
  const [weekIndex, setWeekIndex] = useState(0)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [undertimeEmployeeCode, setUndertimeEmployeeCode] = useState('')
  const [undertimeDate, setUndertimeDate] = useState(getLocalDateKey(today))
  const [undertimeMinutes, setUndertimeMinutes] = useState('')
  const [otherEmployeeCode, setOtherEmployeeCode] = useState('')
  const [otherWeekIndex, setOtherWeekIndex] = useState(0)
  const [otherDescription, setOtherDescription] = useState('')
  const [otherAmount, setOtherAmount] = useState('')
  const [activeTab, setActiveTab] = useState('hdmf')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const sessionToken = branchAdmin?.session_token

  const fetchData = useCallback(async () => {
    if (!sessionToken) return { employees: [], loans: [], payments: [], error: null }

    const [
      { employees: loadedEmployees, error: employeeError },
      { data: loadedLoans, error: loanError },
      { data: loadedPayments, error: paymentError },
      { data: loadedUndertime, error: undertimeError },
      { data: loadedOtherDeductions, error: otherDeductionsError }
    ] = await Promise.all([
      getBranchEmployees(sessionToken),
      listBranchHdmfLoans(sessionToken),
      listBranchHdmfPayments(sessionToken),
      listBranchUndertimeDeductions(
        sessionToken,
        getLocalDateKey(monthStart),
        getLocalDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
      ),
      listBranchOtherDeductions(
        sessionToken,
        getLocalDateKey(monthStart),
        getLocalDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
      )
    ])

    return {
      employees: loadedEmployees,
      loans: loadedLoans ?? [],
      payments: loadedPayments ?? [],
      undertimeDeductions: loadedUndertime ?? [],
      otherDeductions: loadedOtherDeductions ?? [],
      error: employeeError ?? loanError ?? paymentError ?? undertimeError ?? otherDeductionsError
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

      const result = await fetchData()
      if (!isCurrent) return
      if (result.error) {
        setError(result.error.message)
        setStatus('error')
        return
      }

      setEmployees(result.employees)
      setLoans(result.loans)
      setPayments(result.payments)
      setUndertimeDeductions(result.undertimeDeductions)
      setOtherDeductions(result.otherDeductions)
      setEmployeeCode((current) => current || result.employees[0]?.id || '')
      setUndertimeEmployeeCode((current) => current || result.employees[0]?.id || '')
      setOtherEmployeeCode((current) => current || result.employees[0]?.id || '')
      setSelectedLoanId((current) => current || result.loans.find((loan) => Number(loan.balance) > 0)?.id || '')
      setError('')
      setStatus('ready')
    }

    loadData()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, fetchData])

  const selectedLoan = loans.find((loan) => loan.id === selectedLoanId)
  const openLoans = loans.filter((loan) => Number(loan.balance) > 0)
  const selectedUndertimeEmployee = employees.find((employee) => employee.id === undertimeEmployeeCode)
  const undertimeMinutesValue = Number(undertimeMinutes)
  const calculatedUndertimeDeduction = selectedUndertimeEmployee
    && Number.isFinite(selectedUndertimeEmployee.dailyRate)
    && selectedUndertimeEmployee.dailyRate > 0
    && Number.isSafeInteger(undertimeMinutesValue)
    && undertimeMinutesValue > 0
    ? Math.round((selectedUndertimeEmployee.dailyRate / 8 / 60 * undertimeMinutesValue) * 100) / 100
    : null

  const refreshData = async (successMessage) => {
    const result = await fetchData()
    if (result.error) {
      setError(`Saved, but the deduction list could not refresh: ${result.error.message}`)
      setStatus('error')
      return false
    }

    setEmployees(result.employees)
    setLoans(result.loans)
    setPayments(result.payments)
    setUndertimeDeductions(result.undertimeDeductions)
    setOtherDeductions(result.otherDeductions)
    setSelectedLoanId((current) => {
      if (result.loans.some((loan) => loan.id === current && Number(loan.balance) > 0)) return current
      return result.loans.find((loan) => Number(loan.balance) > 0)?.id || ''
    })
    setError('')
    setMessage(successMessage)
    setStatus('ready')
    return true
  }

  const handleCreateLoan = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const amount = Number(loanAmount)
    if (!sessionToken || !employeeCode || !Number.isFinite(amount) || amount <= 0) {
      setError('Choose an employee and enter an HDMF loan amount greater than zero.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await createBranchHdmfLoan(sessionToken, {
      employeeCode,
      loanAmount: amount
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    setLoanAmount('')
    setStatus('loading')
    await refreshData('HDMF loan saved. Record each agreed repayment in the weekly payment form.')
    setIsSaving(false)
  }

  const handleCreatePayment = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const amount = Number(paymentAmount)
    const week = payrollWeeks[weekIndex]
    const balance = Number(selectedLoan?.balance)
    if (!sessionToken || !selectedLoan || !week || !Number.isFinite(amount)
      || amount <= 0 || amount > balance) {
      setError('Choose an open HDMF loan and enter a payment greater than zero and no more than its remaining balance.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await createBranchHdmfPayment(sessionToken, {
      loanId: selectedLoan.id,
      periodStart: week.startDate,
      periodEnd: week.endDate,
      amount
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    setPaymentAmount('')
    setStatus('loading')
    await refreshData('HDMF payment saved and included in payroll for the selected week.')
    setIsSaving(false)
  }

  const handleSaveUndertime = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const minutes = Number(undertimeMinutes)
    if (!sessionToken || !undertimeEmployeeCode || !undertimeDate
      || undertimeMinutes.trim() === '' || !Number.isSafeInteger(minutes)
      || minutes <= 0 || minutes > 2147483647) {
      setError('Choose an employee and undertime date, then enter a whole number of minutes greater than zero.')
      return
    }
    if (!Number.isFinite(selectedUndertimeEmployee?.dailyRate) || selectedUndertimeEmployee.dailyRate <= 0) {
      setError('The selected employee must have a valid daily rate before undertime can be calculated.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await saveBranchUndertimeMinutes(sessionToken, {
      employeeCode: undertimeEmployeeCode,
      undertimeDate,
      minutes
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    setUndertimeMinutes('')
    setStatus('loading')
    await refreshData('Undertime minutes saved and calculated deduction included in payroll.')
    setIsSaving(false)
  }

  const handleSaveOtherDeduction = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const amount = Number(otherAmount)
    const week = payrollWeeks[otherWeekIndex]
    if (!sessionToken || !otherEmployeeCode || !week
      || !otherDescription.trim() || otherDescription.trim().length > 200
      || otherAmount.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
      setError('Choose an employee and payroll week, enter a description of up to 200 characters, and enter an amount greater than zero.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await createBranchOtherDeduction(sessionToken, {
      employeeCode: otherEmployeeCode,
      periodStart: week.startDate,
      periodEnd: week.endDate,
      description: otherDescription.trim(),
      amount
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    setOtherDescription('')
    setOtherAmount('')
    setStatus('loading')
    await refreshData('Other deduction saved and included in payroll for the selected week.')
    setIsSaving(false)
  }

  return (
    <section className="branch-other-deduction-page">
      <header className="branch-other-deduction-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Branch Other Deduction</h3>
          <p className="employee-info-description">
            Manage optional HDMF loan balances and record the employee’s agreed partial or full repayment for each payroll week.
          </p>
        </div>
      </header>

      <div className="other-deduction-tabs" role="tablist" aria-label="Other deduction types">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'hdmf'}
          className={activeTab === 'hdmf' ? 'active' : ''}
          onClick={() => setActiveTab('hdmf')}
        >
          HDMF Loan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'undertime'}
          className={activeTab === 'undertime' ? 'active' : ''}
          onClick={() => setActiveTab('undertime')}
        >
          Undertime Deduction
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'others'}
          className={activeTab === 'others' ? 'active' : ''}
          onClick={() => setActiveTab('others')}
        >
          Others
        </button>
      </div>

      {status === 'loading' && <p className="other-deduction-message" role="status">Loading employee deductions…</p>}
      {!sessionToken && <p className="other-deduction-message error" role="alert">Your login session is missing. Sign out and sign in again after applying the Supabase SQL.</p>}
      {error && <p className="other-deduction-message error" role="alert">{error}</p>}
      {message && <p className="other-deduction-message" role="status">{message}</p>}

      {activeTab === 'hdmf' ? (
        <>
      <section className="other-deduction-panel">
        <h4>Record an HDMF loan</h4>
        <form className="other-deduction-form" onSubmit={handleCreateLoan}>
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
            <span>Total HDMF loan (PHP)</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={loanAmount}
              onChange={(event) => setLoanAmount(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isSaving || status !== 'ready' || employees.length === 0}>
            {isSaving ? 'Saving…' : 'Save loan'}
          </button>
        </form>
      </section>

      <section className="other-deduction-panel">
        <h4>Record a weekly HDMF repayment</h4>
        <p className="other-deduction-help">The employee may pay a chosen weekly amount or the full remaining balance. A loan cannot be overpaid.</p>
        <form className="other-deduction-form" onSubmit={handleCreatePayment}>
          <label>
            <span>Open HDMF loan</span>
            <select
              value={selectedLoanId}
              onChange={(event) => {
                setSelectedLoanId(event.target.value)
                setPaymentAmount('')
              }}
              required
              disabled={status !== 'ready' || openLoans.length === 0}
            >
              {openLoans.length === 0 && <option value="">No open loans</option>}
              {openLoans.map((loan) => (
                <option key={loan.id} value={loan.id}>
                  {loan.employee_name} · {loan.employee_code} · balance {formatCurrency(loan.balance)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Payroll week</span>
            <select value={weekIndex} onChange={(event) => setWeekIndex(Number(event.target.value))}>
              {payrollWeeks.map((week) => <option key={week.index} value={week.index}>{week.label}</option>)}
            </select>
          </label>
          <label>
            <span>Deduct this week (PHP)</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={selectedLoan?.balance || undefined}
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
              required
            />
          </label>
          <button
            type="button"
            className="other-deduction-full-payment"
            onClick={() => setPaymentAmount(selectedLoan ? Number(selectedLoan.balance).toFixed(2) : '')}
            disabled={!selectedLoan || isSaving || status !== 'ready'}
          >
            Pay full balance
          </button>
          <button type="submit" disabled={isSaving || status !== 'ready' || !selectedLoan}>
            {isSaving ? 'Saving…' : 'Save repayment'}
          </button>
        </form>
        {selectedLoan && (
          <p className="other-deduction-balance">
            Original loan {formatCurrency(selectedLoan.loan_amount)} · paid {formatCurrency(selectedLoan.amount_paid)} · remaining {formatCurrency(selectedLoan.balance)}
          </p>
        )}
      </section>

      <div className="other-deduction-history-heading">
        <div>
          <h4>HDMF loan balances</h4>
          <p>Repayments are applied only to their selected payroll week.</p>
        </div>
      </div>
      <div className="other-deduction-table-wrap" role="region" aria-label="HDMF loan balances" tabIndex="0">
        <table className="other-deduction-table">
          <thead>
            <tr><th>Employee</th><th>Loan amount</th><th>Paid</th><th>Remaining balance</th><th>Recorded</th></tr>
          </thead>
          <tbody>
            {loans.map((loan) => (
              <tr key={loan.id}>
                <td><strong>{loan.employee_name}</strong><span>{loan.employee_code}</span></td>
                <td>{formatCurrency(loan.loan_amount)}</td>
                <td>{formatCurrency(loan.amount_paid)}</td>
                <td>{formatCurrency(loan.balance)}</td>
                <td>{formatDate(loan.created_at.slice(0, 10))}</td>
              </tr>
            ))}
            {status === 'ready' && loans.length === 0 && (
              <tr><td className="employee-empty-state" colSpan="5">No HDMF loans have been recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="other-deduction-history-heading">
        <div>
          <h4>HDMF repayment history</h4>
          <p>Each repayment is listed with the week it is deducted from payroll.</p>
        </div>
      </div>
      <div className="other-deduction-table-wrap" role="region" aria-label="HDMF repayment history" tabIndex="0">
        <table className="other-deduction-table">
          <thead>
            <tr><th>Employee</th><th>Payroll week</th><th>Repayment</th><th>Recorded</th></tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td><strong>{payment.employee_name}</strong><span>{payment.employee_code}</span></td>
                <td>{formatDate(payment.period_start)}–{formatDate(payment.period_end)}</td>
                <td>{formatCurrency(payment.amount)}</td>
                <td>{formatDate(payment.created_at.slice(0, 10))}</td>
              </tr>
            ))}
            {status === 'ready' && payments.length === 0 && (
              <tr><td className="employee-empty-state" colSpan="4">No HDMF repayments have been recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
        </>
      ) : activeTab === 'undertime' ? (
        <>
          <section className="other-deduction-panel">
            <h4>Record employee undertime</h4>
            <p className="other-deduction-help">
              Enter the date and minutes of undertime. The deduction is calculated as daily rate ÷ 8 ÷ 60 × undertime minutes.
            </p>
            <form className="other-deduction-form" onSubmit={handleSaveUndertime}>
              <label>
                <span>Employee</span>
                <select
                  value={undertimeEmployeeCode}
                  onChange={(event) => setUndertimeEmployeeCode(event.target.value)}
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
                <span>Undertime date</span>
                <input
                  type="date"
                  value={undertimeDate}
                  onChange={(event) => setUndertimeDate(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Undertime minutes</span>
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  value={undertimeMinutes}
                  onChange={(event) => setUndertimeMinutes(event.target.value)}
                  required
                />
              </label>
              {calculatedUndertimeDeduction !== null && (
                <p className="other-deduction-help">
                  Calculated deduction: {formatCurrency(calculatedUndertimeDeduction)}
                </p>
              )}
              <button type="submit" disabled={isSaving || status !== 'ready' || employees.length === 0}>
                {isSaving ? 'Saving…' : 'Save undertime'}
              </button>
            </form>
          </section>
          <div className="other-deduction-history-heading">
            <div>
              <h4>Undertime deduction history</h4>
              <p>{monthName} · Each entry records undertime minutes on its specific date.</p>
            </div>
          </div>
          <div className="other-deduction-table-wrap" role="region" aria-label="Undertime deduction history" tabIndex="0">
            <table className="other-deduction-table">
              <thead>
                <tr><th>Employee</th><th>Undertime date</th><th>Minutes</th><th>Deduction</th><th>Last updated</th></tr>
              </thead>
              <tbody>
                {undertimeDeductions.map((deduction) => (
                  <tr key={deduction.id}>
                    <td><strong>{deduction.employee_name}</strong><span>{deduction.employee_code}</span></td>
                    <td>{formatDate(deduction.period_start)}</td>
                    <td>{deduction.undertime_minutes ?? '—'}</td>
                    <td>{formatCurrency(deduction.amount)}</td>
                    <td>{formatDate(deduction.updated_at.slice(0, 10))}</td>
                  </tr>
                ))}
                {status === 'ready' && undertimeDeductions.length === 0 && (
                  <tr><td className="employee-empty-state" colSpan="5">No undertime deductions have been entered this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <section className="other-deduction-panel">
            <h4>Record an employee deduction</h4>
            <p className="other-deduction-help">
              Add a description and amount for the selected employee and payroll week. Each saved entry appears in payroll under Others.
            </p>
            <form className="other-deduction-form" onSubmit={handleSaveOtherDeduction}>
              <label>
                <span>Employee</span>
                <select
                  value={otherEmployeeCode}
                  onChange={(event) => setOtherEmployeeCode(event.target.value)}
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
                <span>Payroll week</span>
                <select
                  value={otherWeekIndex}
                  onChange={(event) => setOtherWeekIndex(Number(event.target.value))}
                >
                  {payrollWeeks.map((week) => (
                    <option key={week.index} value={week.index}>{week.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Description</span>
                <input
                  type="text"
                  maxLength="200"
                  value={otherDescription}
                  onChange={(event) => setOtherDescription(event.target.value)}
                  placeholder="e.g. Uniform deduction"
                  required
                />
              </label>
              <label>
                <span>Deduction amount (PHP)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={otherAmount}
                  onChange={(event) => setOtherAmount(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={isSaving || status !== 'ready' || employees.length === 0}>
                {isSaving ? 'Saving…' : 'Save deduction'}
              </button>
            </form>
          </section>
          <div className="other-deduction-history-heading">
            <div>
              <h4>Other deductions this month</h4>
              <p>Each entry is included in the employee’s total deduction for its selected payroll week.</p>
            </div>
          </div>
          <div className="other-deduction-table-wrap" role="region" aria-label="Other deduction history" tabIndex="0">
            <table className="other-deduction-table">
              <thead>
                <tr><th>Employee</th><th>Payroll week</th><th>Description</th><th>Deduction</th><th>Recorded</th></tr>
              </thead>
              <tbody>
                {otherDeductions.map((deduction) => (
                  <tr key={deduction.id}>
                    <td><strong>{deduction.employee_name}</strong><span>{deduction.employee_code}</span></td>
                    <td>{formatDate(deduction.period_start)}–{formatDate(deduction.period_end)}</td>
                    <td>{deduction.description}</td>
                    <td>{formatCurrency(deduction.amount)}</td>
                    <td>{formatDate(deduction.created_at.slice(0, 10))}</td>
                  </tr>
                ))}
                {status === 'ready' && otherDeductions.length === 0 && (
                  <tr><td className="employee-empty-state" colSpan="5">No other deductions have been entered this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}