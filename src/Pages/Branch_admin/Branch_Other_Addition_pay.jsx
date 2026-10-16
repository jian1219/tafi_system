import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listBranchOvertimeHours,
  saveBranchOvertimeHours
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'
import { getPayrollPeriods } from '../../lib/payrollPeriods'

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const weekdays = [
  { key: 1, label: 'Monday' },
  { key: 2, label: 'Tuesday' },
  { key: 3, label: 'Wednesday' },
  { key: 4, label: 'Thursday' },
  { key: 5, label: 'Friday' },
  { key: 6, label: 'Saturday' },
  { key: 0, label: 'Sunday' }
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

const formatWeekdayDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  weekday: 'long'
})

const getPayrollWeeks = (monthKey) => {
  return getPayrollPeriods(monthKey)
}

const getWeekDates = (week) => {
  if (!week) return {}
  const dates = {}
  for (let date = new Date(`${week.startDate}T12:00:00`); date <= new Date(`${week.endDate}T12:00:00`); date.setDate(date.getDate() + 1)) {
    dates[date.getDay()] = getLocalDateKey(date)
  }
  return dates
}

const getOvertimeKey = (employeeCode, date) => `${employeeCode}:${date}`

export default function BranchOtherAdditionPay({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [employees, setEmployees] = useState([])
  const [savedOvertimeHours, setSavedOvertimeHours] = useState([])
  const [overtimeHours, setOvertimeHours] = useState({})
  const [employeeCode, setEmployeeCode] = useState('')
  const [weekIndex, setWeekIndex] = useState(0)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const sessionToken = branchAdmin?.session_token
  const payrollWeeks = useMemo(() => getPayrollWeeks(selectedMonth), [selectedMonth])

  const fetchData = useCallback(async (monthKey) => {
    if (!sessionToken) return { employees: [], overtimeHours: [], error: null }
    const [year, month] = monthKey.split('-').map(Number)
    const periodStart = getLocalDateKey(new Date(year, month - 1, 1))
    const periodEnd = getLocalDateKey(new Date(year, month, 0))
    const [
      { employees: loadedEmployees, error: employeeError },
      { data: loadedOvertimeHours, error: overtimeError }
    ] = await Promise.all([
      getBranchEmployees(sessionToken),
      listBranchOvertimeHours(sessionToken, periodStart, periodEnd)
    ])
    return {
      employees: loadedEmployees,
      overtimeHours: loadedOvertimeHours ?? [],
      error: employeeError ?? overtimeError
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
      setSavedOvertimeHours(result.overtimeHours)
      setEmployeeCode((current) => current || result.employees[0]?.id || '')
      setOvertimeHours(Object.fromEntries(result.overtimeHours.map((entry) => [
        getOvertimeKey(entry.employee_code, entry.overtime_date),
        String(entry.hours)
      ])))
      setError('')
      setStatus('ready')
    }

    loadData()
    return () => {
      isCurrent = false
    }
  }, [sessionToken, selectedMonth, fetchData])

  const selectedWeek = payrollWeeks[weekIndex] ?? payrollWeeks[0]
  const monthLabel = new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
  const selectedEmployee = employees.find((employee) => employee.id === employeeCode)
  const weekDates = getWeekDates(selectedWeek)
  const selectedWeekOvertime = weekdays.flatMap((day) => {
    const date = weekDates[day.key]
    if (!date) return []
    return [{
      ...day,
      date,
      hours: overtimeHours[getOvertimeKey(employeeCode, date)] ?? ''
    }]
  })
  const totalOvertimeHours = selectedWeekOvertime.reduce((total, day) => total + (Number(day.hours) || 0), 0)
  const overtimePay = selectedEmployee
    ? Math.round((Number(selectedEmployee.dailyRate) / 8 * totalOvertimeHours) * 100) / 100
    : 0
  const overtimeHistoryGroups = savedOvertimeHours.reduce((groups, entry) => {
    const week = payrollWeeks.find((payrollWeek) =>
      entry.overtime_date >= payrollWeek.startDate && entry.overtime_date <= payrollWeek.endDate
    )
    if (!week) return groups

    const key = `${entry.employee_code}:${week.startDate}`
    let group = groups.find((item) => item.key === key)
    if (!group) {
      group = {
        key,
        employeeName: entry.employee_name,
        employeeCode: entry.employee_code,
        week,
        entries: []
      }
      groups.push(group)
    }
    group.entries.push(entry)
    return groups
  }, []).map((group) => ({
    ...group,
    entries: group.entries.sort((first, second) => first.overtime_date.localeCompare(second.overtime_date)),
    totalHours: group.entries.reduce((total, entry) => total + Number(entry.hours), 0)
  })).sort((first, second) =>
    second.week.startDate.localeCompare(first.week.startDate)
      || first.employeeName.localeCompare(second.employeeName)
  )

  const saveOvertime = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!sessionToken || !employeeCode || !selectedWeek || selectedWeekOvertime.length === 0) {
      setError('Choose an employee and payroll week before entering overtime hours.')
      return
    }

    const dailyHours = selectedWeekOvertime.map((day) => ({
      date: day.date,
      hours: day.hours.trim() === '' ? 0 : Number(day.hours)
    }))
    if (dailyHours.some((day) => !Number.isFinite(day.hours) || day.hours < 0 || day.hours > 24)) {
      setError('Enter a valid number of overtime hours between 0 and 24 for each day.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await saveBranchOvertimeHours(sessionToken, {
      employeeCode,
      periodStart: selectedWeek.startDate,
      periodEnd: selectedWeek.endDate,
      dailyHours
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    const result = await fetchData(selectedMonth)
    if (result.error) {
      setError(`Overtime hours saved, but the list could not refresh: ${result.error.message}`)
      setStatus('error')
    } else {
      setEmployees(result.employees)
      setSavedOvertimeHours(result.overtimeHours)
      setOvertimeHours(Object.fromEntries(result.overtimeHours.map((entry) => [
        getOvertimeKey(entry.employee_code, entry.overtime_date),
        String(entry.hours)
      ])))
      setStatus('ready')
      setMessage(`Saved ${totalOvertimeHours} overtime hours. ${formatCurrency(overtimePay)} will be included in the selected week’s payroll.`)
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
            Enter daily overtime hours for employees and review their overtime history.
          </p>
        </div>
      </header>

      {status === 'loading' && <p className="other-deduction-message" role="status">Loading employees and overtime hours…</p>}
      {!sessionToken && <p className="other-deduction-message error" role="alert">Your login session is missing. Sign out and sign in again after applying the Supabase SQL.</p>}
      {error && <p className="other-deduction-message error" role="alert">{error}</p>}
      {message && <p className="other-deduction-message" role="status">{message}</p>}

      <section className="other-deduction-panel">
        <h4>Enter daily overtime hours</h4>
        <p className="other-deduction-help">
          Enter the hours worked on each day. Overtime pay is calculated automatically as daily rate ÷ 8 × total overtime hours.
        </p>
        <form className="other-deduction-form" onSubmit={saveOvertime}>
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
            <span>Payroll period</span>
            <select
              value={weekIndex}
              onChange={(event) => setWeekIndex(Number(event.target.value))}
            >
              {payrollWeeks.map((week) => (
                <option key={week.startDate} value={week.index}>
                  {week.label} · {formatDate(week.startDate)}–{formatDate(week.endDate)}
                </option>
              ))}
            </select>
          </label>
          <div className="overtime-hours-entry">
              {weekdays.map((day) => {
                const date = weekDates[day.key]
                return (
                  <label key={day.key} className={!date ? 'overtime-hours-day unavailable' : 'overtime-hours-day'}>
                    <span>{day.label}{date ? ` · ${formatDate(date)}` : ''}</span>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      value={date ? overtimeHours[getOvertimeKey(employeeCode, date)] ?? '' : ''}
                      onChange={(event) => setOvertimeHours((current) => ({
                        ...current,
                        [getOvertimeKey(employeeCode, date)]: event.target.value
                      }))}
                      disabled={!date || status !== 'ready'}
                      placeholder={date ? 'Hours' : 'No date'}
                    />
                  </label>
                )
              })}
              <div className="overtime-hours-total">
                <span>Total hours</span><strong>{totalOvertimeHours.toFixed(2)}</strong>
                <span>Calculated overtime pay</span><strong>{formatCurrency(overtimePay)}</strong>
                {selectedEmployee && <small>Daily rate {formatCurrency(selectedEmployee.dailyRate)} ÷ 8 × {totalOvertimeHours.toFixed(2)} hours</small>}
              </div>
              <button type="submit" disabled={isSaving || status !== 'ready' || employees.length === 0}>
                {isSaving ? 'Saving…' : 'Save overtime hours'}
              </button>
          </div>
        </form>
      </section>

      <div className="other-deduction-history-heading other-addition-history-heading">
        <div>
          <h4>Overtime Pay history</h4>
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
              setWeekIndex(0)
              setMessage('')
              setError('')
              setStatus('loading')
            }}
          />
        </label>
      </div>

      <div className="other-deduction-table-wrap" role="region" aria-label="Overtime hours history" tabIndex="0">
          <table className="other-deduction-table">
            <thead>
              <tr><th>Employee</th><th>Payroll period</th><th>Daily overtime hours</th><th>Total hours</th></tr>
            </thead>
            <tbody>
              {overtimeHistoryGroups.map((group) => (
                <tr key={group.key}>
                  <td><strong>{group.employeeName}</strong><span>{group.employeeCode}</span></td>
                  <td>{formatWeekdayDate(group.week.startDate)} to {formatWeekdayDate(group.week.endDate)}</td>
                  <td className="overtime-history-days">
                    {group.entries.map((entry) => (
                      <span key={entry.id}>
                        {formatWeekdayDate(entry.overtime_date)}: {Number(entry.hours).toFixed(2)} hours
                      </span>
                    ))}
                  </td>
                  <td>{group.totalHours.toFixed(2)} hours</td>
                </tr>
              ))}
              {status === 'ready' && overtimeHistoryGroups.length === 0 && (
                <tr><td className="employee-empty-state" colSpan="4">No overtime hours have been entered for this month.</td></tr>
              )}
            </tbody>
          </table>
      </div>
    </section>
  )
}
