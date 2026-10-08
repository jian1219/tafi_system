import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listBranchHolidayPay,
  listBranchHolidayPayRules,
  listBranchOvertimeHours,
  listBranchPayrollAdditions,
  saveBranchHolidayPay,
  saveBranchOvertimeHours,
  saveBranchPayrollAddition
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const additionTypes = [
  { key: 'holiday_regular_pay', label: 'Holiday Regular Pay' },
  { key: 'overtime_pay', label: 'Overtime Pay' },
  { key: 'special_nonworking_holiday', label: 'Special Non-working Holiday' }
]
const employeeClassifications = ['Regular', 'Probationary', 'Trainee']
const defaultHolidayClassifications = ['Regular', 'Probationary']
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
  const [additions, setAdditions] = useState([])
  const [holidayPayEntries, setHolidayPayEntries] = useState([])
  const [savedOvertimeHours, setSavedOvertimeHours] = useState([])
  const [amounts, setAmounts] = useState({})
  const [overtimeHours, setOvertimeHours] = useState({})
  const [holidayDrafts, setHolidayDrafts] = useState({})
  const [holidayDate, setHolidayDate] = useState(() => getPayrollWeeks(currentMonth)[0]?.startDate ?? '')
  const [holidayPayRules, setHolidayPayRules] = useState([])
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
    if (!sessionToken) return { employees: [], additions: [], overtimeHours: [], holidayPayEntries: [], holidayPayRules: [], error: null }
    const [year, month] = monthKey.split('-').map(Number)
    const periodStart = getLocalDateKey(new Date(year, month - 1, 1))
    const periodEnd = getLocalDateKey(new Date(year, month, 0))
    const [
      { employees: loadedEmployees, error: employeeError },
      { data: loadedAdditions, error: additionsError },
      { data: loadedOvertimeHours, error: overtimeError },
      { data: loadedHolidayPay, error: holidayPayError },
      { data: loadedHolidayPayRules, error: holidayPayRulesError }
    ] = await Promise.all([
      getBranchEmployees(sessionToken),
      listBranchPayrollAdditions(sessionToken, periodStart, periodEnd),
      listBranchOvertimeHours(sessionToken, periodStart, periodEnd),
      listBranchHolidayPay(sessionToken, periodStart, periodEnd),
      listBranchHolidayPayRules(sessionToken, periodStart, periodEnd)
    ])
    return {
      employees: loadedEmployees,
      additions: loadedAdditions ?? [],
      overtimeHours: loadedOvertimeHours ?? [],
      holidayPayEntries: loadedHolidayPay ?? [],
      holidayPayRules: loadedHolidayPayRules ?? [],
      error: employeeError ?? additionsError ?? overtimeError ?? holidayPayError ?? holidayPayRulesError
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
      setSavedOvertimeHours(result.overtimeHours)
      setHolidayPayEntries(result.holidayPayEntries)
      setHolidayPayRules(result.holidayPayRules)
      setEmployeeCode((current) => current || result.employees[0]?.id || '')
      setAmounts(Object.fromEntries(result.additions.map((addition) => [
        getAdditionKey(addition.employee_code, addition.period_start, addition.addition_type),
        String(addition.amount)
      ])))
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
  const selectedAmountKey = selectedWeek
    ? getAdditionKey(employeeCode, selectedWeek.startDate, activeType)
    : ''
  const monthLabel = new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
  const visibleAdditions = additions.filter((addition) => addition.addition_type === activeType)
  const selectedEmployee = employees.find((employee) => employee.id === employeeCode)
  const isHolidayPayType = ['holiday_regular_pay', 'special_nonworking_holiday'].includes(activeType)
  const holidayDraftKey = `${activeType}:${holidayDate}`
  const savedHolidayRule = holidayPayRules.find((rule) =>
    rule.addition_type === activeType && rule.holiday_date === holidayDate
  )
  const holidayPercentage = holidayDrafts[holidayDraftKey]?.percentage
    ?? (savedHolidayRule ? String(savedHolidayRule.percentage) : '100')
  const holidayClassifications = holidayDrafts[holidayDraftKey]?.classifications
    ?? savedHolidayRule?.eligible_classifications
    ?? defaultHolidayClassifications
  const eligibleHolidayEmployees = employees.filter((employee) =>
    holidayClassifications.includes(employee.employmentClassification)
  )
  const visibleHolidayPayEntries = holidayPayEntries.filter((entry) => entry.addition_type === activeType)
  const parsedHolidayPercentage = Number(holidayPercentage)
  const selectedClassificationCount = holidayClassifications.length
  const estimatedHolidayTotal = eligibleHolidayEmployees.reduce((total, employee) =>
    total + Math.round(Number(employee.dailyRate) * parsedHolidayPercentage) / 100, 0)
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
      setAdditions(result.additions)
      setSavedOvertimeHours(result.overtimeHours)
      setAmounts(Object.fromEntries(result.additions.map((addition) => [
        getAdditionKey(addition.employee_code, addition.period_start, addition.addition_type),
        String(addition.amount)
      ])))
      setOvertimeHours(Object.fromEntries(result.overtimeHours.map((entry) => [
        getOvertimeKey(entry.employee_code, entry.overtime_date),
        String(entry.hours)
      ])))
      setStatus('ready')
      setMessage(`Saved ${totalOvertimeHours} overtime hours. ${formatCurrency(overtimePay)} will be included in the selected week’s payroll.`)
    }
    setIsSaving(false)
  }

  const saveHolidayPay = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const percentage = Number(holidayPercentage)
    if (!sessionToken || !selectedWeek || !holidayDate
      || holidayDate < selectedWeek.startDate || holidayDate > selectedWeek.endDate
      || !Number.isFinite(percentage) || percentage < 0 || percentage > 1000) {
      setError('Choose a holiday date within the selected week and enter a percentage from 0 to 1000.')
      return
    }
    if (selectedClassificationCount === 0) {
      setError('Select at least one employee classification for this holiday.')
      return
    }
    if (eligibleHolidayEmployees.length === 0) {
      setError('There are no active employees in the selected classifications.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await saveBranchHolidayPay(sessionToken, {
      periodStart: selectedWeek.startDate,
      periodEnd: selectedWeek.endDate,
      holidayDate,
      additionType: activeType,
      percentage,
      eligibleClassifications: holidayClassifications
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    const result = await fetchData(selectedMonth)
    if (result.error) {
      setError(`Holiday pay saved, but the list could not refresh: ${result.error.message}`)
      setStatus('error')
    } else {
      setEmployees(result.employees)
      setAdditions(result.additions)
      setSavedOvertimeHours(result.overtimeHours)
      setHolidayPayEntries(result.holidayPayEntries)
      setHolidayPayRules(result.holidayPayRules)
      setHolidayDrafts((current) => {
        const next = { ...current }
        delete next[holidayDraftKey]
        return next
      })
      setAmounts(Object.fromEntries(result.additions.map((addition) => [
        getAdditionKey(addition.employee_code, addition.period_start, addition.addition_type),
        String(addition.amount)
      ])))
      setOvertimeHours(Object.fromEntries(result.overtimeHours.map((entry) => [
        getOvertimeKey(entry.employee_code, entry.overtime_date),
        String(entry.hours)
      ])))
      setStatus('ready')
      setMessage(`${selectedType.label} saved for ${eligibleHolidayEmployees.length} employees in the selected classifications. Payroll will include ${formatCurrency(estimatedHolidayTotal)} for this date.`)
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
            Add employee earnings for holidays and overtime. Holiday pay is calculated from a percentage of daily rate and applies to active employees in the classifications you select.
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
              if (['holiday_regular_pay', 'special_nonworking_holiday'].includes(type.key)) {
                setHolidayDate(selectedWeek?.startDate ?? '')
              }
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
        <h4>{activeType === 'overtime_pay'
          ? 'Enter daily overtime hours'
          : isHolidayPayType ? `Enter ${selectedType.label} percentage` : `Enter ${selectedType.label}`}</h4>
        <p className="other-deduction-help">
          {activeType === 'overtime_pay'
            ? 'Enter the hours worked on each day. Overtime pay is calculated automatically as daily rate ÷ 8 × total overtime hours.'
            : isHolidayPayType
              ? 'Choose the holiday date, percentage of daily rate, and which active employee classifications qualify.'
              : 'Enter the amount to add to the employee’s payroll for the selected week. Saving again updates that category for the same employee and week.'}
        </p>
        <form className="other-deduction-form" onSubmit={activeType === 'overtime_pay' ? saveOvertime : isHolidayPayType ? saveHolidayPay : saveAddition}>
          {!isHolidayPayType && (
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
          )}
          <label>
            <span>Payroll week</span>
            <select
              value={weekIndex}
              onChange={(event) => {
                const nextWeekIndex = Number(event.target.value)
                setWeekIndex(nextWeekIndex)
                if (isHolidayPayType) setHolidayDate(payrollWeeks[nextWeekIndex]?.startDate ?? '')
              }}
            >
              {payrollWeeks.map((week) => (
                <option key={week.startDate} value={week.index}>
                  Week {week.index + 1} · {formatDate(week.startDate)}–{formatDate(week.endDate)}
                </option>
              ))}
            </select>
          </label>
          {isHolidayPayType ? (
            <>
              <label>
                <span>Holiday date</span>
                <input
                  type="date"
                  min={selectedWeek?.startDate}
                  max={selectedWeek?.endDate}
                  value={holidayDate}
                  onChange={(event) => setHolidayDate(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Percentage of daily rate</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  value={holidayPercentage}
                  onChange={(event) => setHolidayDrafts((current) => ({
                    ...current,
                    [holidayDraftKey]: {
                      ...current[holidayDraftKey],
                      percentage: event.target.value
                    }
                  }))}
                  required
                />
              </label>
              <fieldset className="holiday-pay-eligibility">
                <legend>Eligible employee classifications</legend>
                <div className="holiday-pay-eligibility-options">
                  {employeeClassifications.map((classification) => (
                    <label key={classification}>
                      <input
                        type="checkbox"
                        checked={holidayClassifications.includes(classification)}
                        onChange={(event) => setHolidayDrafts((current) => {
                          const classifications = current[holidayDraftKey]?.classifications
                            ?? savedHolidayRule?.eligible_classifications
                            ?? defaultHolidayClassifications
                          return {
                            ...current,
                            [holidayDraftKey]: {
                              ...current[holidayDraftKey],
                              classifications: event.target.checked
                                ? [...classifications, classification]
                                : classifications.filter((selected) => selected !== classification)
                            }
                          }
                        })}
                      />
                      {classification}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="holiday-pay-actions">
                <button type="submit" disabled={isSaving || status !== 'ready' || eligibleHolidayEmployees.length === 0 || selectedClassificationCount === 0}>
                  {isSaving ? 'Saving…' : `Save ${selectedType.label}`}
                </button>
                <div className="holiday-pay-summary">
                  <strong>{eligibleHolidayEmployees.length}</strong>
                  <span>active employees in selected classifications</span>
                  <strong>{formatCurrency(estimatedHolidayTotal)}</strong>
                  <span>estimated total at {holidayPercentage || 0}% of each daily rate</span>
                </div>
              </div>
            </>
          ) : activeType === 'overtime_pay' ? (
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
          ) : (
            <>
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
            </>
          )}
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
              const firstWeek = getPayrollWeeks(event.target.value)[0]
              setSelectedMonth(event.target.value)
              setWeekIndex(0)
              if (isHolidayPayType) setHolidayDate(firstWeek?.startDate ?? '')
              setMessage('')
              setError('')
              setStatus('loading')
            }}
          />
        </label>
      </div>

      {isHolidayPayType ? (
        <div className="other-deduction-table-wrap" role="region" aria-label={`${selectedType.label} history`} tabIndex="0">
          <table className="other-deduction-table">
            <thead>
              <tr><th>Employee</th><th>Holiday date</th><th>Percentage</th><th>Daily rate</th><th>Added pay</th></tr>
            </thead>
            <tbody>
              {visibleHolidayPayEntries.map((entry) => (
                <tr key={entry.id}>
                  <td><strong>{entry.employee_name}</strong><span>{entry.employee_code}</span></td>
                  <td>{formatDate(entry.holiday_date)}</td>
                  <td>{Number(entry.percentage).toFixed(2)}%</td>
                  <td>{formatCurrency(entry.daily_rate)}</td>
                  <td>{formatCurrency(entry.amount)}</td>
                </tr>
              ))}
              {status === 'ready' && visibleHolidayPayEntries.length === 0 && (
                <tr><td className="employee-empty-state" colSpan="5">No {selectedType.label.toLowerCase()} entries for this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : activeType === 'overtime_pay' ? (
        <div className="other-deduction-table-wrap" role="region" aria-label="Overtime hours history" tabIndex="0">
          <table className="other-deduction-table">
            <thead>
              <tr><th>Employee</th><th>Payroll week</th><th>Daily overtime hours</th><th>Total hours</th></tr>
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
      ) : (
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
      )}
    </section>
  )
}
