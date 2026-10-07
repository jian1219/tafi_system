import { useCallback, useEffect, useMemo, useState } from 'react'
import { listBranchPayrollAdditions, saveBranchPayrollAddition } from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const additionTypes = [
  { key: 'holiday_regular_pay', label: 'Holiday Regular Pay' },
  { key: 'overtime_pay', label: 'Overtime Pay' },
  { key: 'special_nonworking_holiday', label: 'Special Non-working Holiday' }
]

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

const getAdditionKey = (employeeCode, periodStart, additionType) =>
  `${employeeCode}:${periodStart}:${additionType}`

export default function BranchOtherAdditionPay({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [employees, setEmployees] = useState([])
  const [additions, setAdditions] = useState([])
  const [amounts, setAmounts] = useState({})
  const [employeeCode, setEmployeeCode] = useState('')
  const [weekIndex, setWeekIndex] = useState(0)
  const [activeType, setActiveType] = useState(additionTypes[0].key)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const sessionToken = branchAdmin?.session_token
  const payrollWeeks = useMemo(() => getPayrollWeeks(selectedMonth), [selectedMonth])
  const selectedType = additionTypes.find((type) => type.key === activeType) ?? additionTypes[0]

  const fetchData = useCallback(async (monthKey) => {
    if (!sessionToken) return { employees: [], additions: [], error: null }
    const [year, month] = monthKey.split('-').map(Number)
    const periodStart = getLocalDateKey(new Date(year, month - 1, 1))
    const periodEnd = getLocalDateKey(new Date(year, month, 0))
    const [
      { employees: loadedEmployees, error: employeeError },
      { data: loadedAdditions, error: additionsError }
    ] = await Promise.all([
      getBranchEmployees(sessionToken),
      listBranchPayrollAdditions(sessionToken, periodStart, periodEnd)
    ])
    return {
      employees: loadedEmployees,
      additions: loadedAdditions ?? [],
      error: employeeError ?? additionsError
    }
  }, [sessionToken])

  useEffect(() => {
    let isCurrent = true

    const loadData = async () => {
      if (!sessionToken) {
        setError('Your login session is missing. Sign out and sign in again after applying the Supabase SQL.')
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
      setAdditions(result.additions)
      setEmployeeCode((current) => current || result.employees[0]?.id || '')
      setAmounts(Object.fromEntries(result.additions.map((addition) => [
        getAdditionKey(addition.employee_code, addition.period_start, addition.addition_type),
        String(addition.amount)
      ])))
      setError('')
      setStatus('ready')
    }

    loadData()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, selectedMonth, fetchData])

  const selectedWeek = payrollWeeks[weekIndex]
  const selectedAmountKey = selectedWeek
    ? getAdditionKey(employeeCode, selectedWeek.startDate, activeType)
    : ''
  const monthLabel = new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
  const visibleAdditions = additions.filter((addition) => addition.addition_type === activeType)

  const saveAddition = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const rawAmount = amounts[selectedAmountKey] ?? ''
    const amount = Number(rawAmount)
    if (!sessionToken || !employeeCode || !selectedWeek || rawAmount.trim() === ''
      || !Number.isFinite(amount) || amount < 0) {
      setError('Choose an employee and payroll week, then enter an amount of zero or more.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await saveBranchPayrollAddition(sessionToken, {
      employeeCode,
      periodStart: selectedWeek.startDate,
      periodEnd: selectedWeek.endDate,
      additionType: activeType,
      amount
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    const result = await fetchData(selectedMonth)
    if (result.error) {
      setError(`Addition saved, but the list could not refresh: ${result.error.message}`)
      setStatus('error')
    } else {
      setEmployees(result.employees)
      setAdditions(result.additions)
      setAmounts(Object.fromEntries(result.additions.map((addition) => [
        getAdditionKey(addition.employee_code, addition.period_start, addition.addition_type),
        String(addition.amount)
      ])))
      setStatus('ready')
      setMessage(`${selectedType.label} saved and included in the selected week’s payroll.`)
    }
    setIsSaving(false)
  }

  return (
    <section className="branch-other-deduction-page">
      <header className="branch-other-deduction-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Branch Other Addition</h3>
          <p className="employee-info-description">
            Add employee earnings for holiday regular pay, overtime, and special non-working holidays. Saved amounts are added to payroll for their selected week.
          </p>
        </div>
      </header>

      <div className="other-deduction-tabs" role="tablist" aria-label="Payroll addition type">
        {additionTypes.map((type) => (
          <button
            key={type.key}
            type="button"
            role="tab"
            aria-selected={activeType === type.key}
            className={activeType === type.key ? 'active' : ''}
            onClick={() => {
              setActiveType(type.key)
              setError('')
              setMessage('')
            }}
          >
            {type.label}
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="other-deduction-message" role="status">Loading employee additions…</p>}
      {!sessionToken && <p className="other-deduction-message error" role="alert">Your login session is missing. Sign out and sign in again after applying the Supabase SQL.</p>}
      {error && <p className="other-deduction-message error" role="alert">{error}</p>}
      {message && <p className="other-deduction-message" role="status">{message}</p>}

      <section className="other-deduction-panel">
        <h4>Enter {selectedType.label}</h4>
        <p className="other-deduction-help">Enter the amount to add to the employee’s payroll for the selected week. Saving again updates that category for the same employee and week.</p>
        <form className="other-deduction-form" onSubmit={saveAddition}>
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
            <span>Payroll week</span>
            <select
              value={weekIndex}
              onChange={(event) => setWeekIndex(Number(event.target.value))}
            >
              {payrollWeeks.map((week) => (
                <option key={week.startDate} value={week.index}>
                  Week {week.index + 1} · {formatDate(week.startDate)}–{formatDate(week.endDate)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{selectedType.label} (PHP)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amounts[selectedAmountKey] ?? ''}
              onChange={(event) => setAmounts((current) => ({
                ...current,
                [selectedAmountKey]: event.target.value
              }))}
              required
            />
          </label>
          <button type="submit" disabled={isSaving || status !== 'ready' || employees.length === 0}>
            {isSaving ? 'Saving…' : `Save ${selectedType.label}`}
          </button>
        </form>
      </section>

      <div className="other-deduction-history-heading other-addition-history-heading">
        <div>
          <h4>{selectedType.label} history</h4>
          <p>Showing entries for {monthLabel}.</p>
        </div>
        <label className="cash-advance-month-control">
          <span>Payroll month</span>
          <input
            type="month"
            value={selectedMonth}
            required
            disabled={isSaving}
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

      <div className="other-deduction-table-wrap" role="region" aria-label={`${selectedType.label} entries`} tabIndex="0">
        <table className="other-deduction-table">
          <thead>
            <tr><th>Employee</th><th>Payroll week</th><th>Added amount</th><th>Last updated</th></tr>
          </thead>
          <tbody>
            {visibleAdditions.map((addition) => (
              <tr key={addition.id}>
                <td><strong>{addition.employee_name}</strong><span>{addition.employee_code}</span></td>
                <td>{formatDate(addition.period_start)}–{formatDate(addition.period_end)}</td>
                <td>{formatCurrency(addition.amount)}</td>
                <td>{formatDate(addition.updated_at.slice(0, 10))}</td>
              </tr>
            ))}
            {status === 'ready' && visibleAdditions.length === 0 && (
              <tr><td className="employee-empty-state" colSpan="4">No {selectedType.label.toLowerCase()} entries for this month.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
