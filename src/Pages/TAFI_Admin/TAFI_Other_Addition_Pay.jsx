import { useEffect, useMemo, useState } from 'react'
import {
	listTafiAdminBranches,
	listTafiAdminEmployees,
	listTafiAdminHolidayPay,
	listTafiAdminHolidayPayRules,
	listTafiAdminOvertimeHistory,
	listTafiAdminPayrollAdditions,
	saveTafiAdminHolidayPay,
	saveTafiAdminOvertimeHours,
	saveTafiAdminPayrollAddition
} from '../../lib/supabase'
import { getLocalDateKey } from '../Branch_admin/branchAttendanceRecords'

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

const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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
const getAdditionKey = (branchId, employeeCode, periodStart, additionType) =>
	`${branchId}:${employeeCode}:${periodStart}:${additionType}`
const getOvertimeKey = (branchId, employeeCode, date) => `${branchId}:${employeeCode}:${date}`
const getWeekDates = (week) => {
	if (!week) return {}
	const dates = {}
	for (
		let date = new Date(`${week.startDate}T12:00:00`);
		date <= new Date(`${week.endDate}T12:00:00`);
		date.setDate(date.getDate() + 1)
	) {
		dates[date.getDay()] = getLocalDateKey(date)
	}
	return dates
}

export default function TafiOtherAdditionPay({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [employees, setEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [employeeCode, setEmployeeCode] = useState('')
	const [additions, setAdditions] = useState([])
	const [overtimeEntries, setOvertimeEntries] = useState([])
	const [holidayEntries, setHolidayEntries] = useState([])
	const [holidayRules, setHolidayRules] = useState([])
	const [amounts, setAmounts] = useState({})
	const [overtimeHours, setOvertimeHours] = useState({})
	const [holidayDrafts, setHolidayDrafts] = useState({})
	const [selectedMonth, setSelectedMonth] = useState(currentMonth)
	const [weekIndex, setWeekIndex] = useState(0)
	const [activeType, setActiveType] = useState(additionTypes[0].key)
	const [holidayDate, setHolidayDate] = useState(() => getPayrollWeeks(currentMonth)[0]?.startDate ?? '')
	const [directoryStatus, setDirectoryStatus] = useState('loading')
	const [loadStatus, setLoadStatus] = useState('loading')
	const [isSaving, setIsSaving] = useState(false)
	const [reloadVersion, setReloadVersion] = useState(0)
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')

	const payrollWeeks = useMemo(() => getPayrollWeeks(selectedMonth), [selectedMonth])
	const selectedWeek = payrollWeeks[weekIndex] ?? payrollWeeks[0]
	const selectedType = additionTypes.find((type) => type.key === activeType) ?? additionTypes[0]
	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const branchEmployees = useMemo(() => employees
		.filter((employee) => employee.branch_id === selectedBranchId && employee.employment_status === 'active')
		.map((employee) => ({
			code: employee.employee_code,
			name: employee.employee_name,
			classification: employee.employment_classification,
			dailyRate: Number(employee.daily_rate)
		})), [employees, selectedBranchId])
	const selectedEmployee = branchEmployees.find((employee) => employee.code === employeeCode)
	const isHolidayPayType = ['holiday_regular_pay', 'special_nonworking_holiday'].includes(activeType)
	const holidayDraftKey = `${selectedBranchId}:${activeType}:${holidayDate}`
	const savedHolidayRule = holidayRules.find((rule) =>
		rule.addition_type === activeType && rule.holiday_date === holidayDate
	)
	const holidayPercentage = holidayDrafts[holidayDraftKey]?.percentage
		?? (savedHolidayRule ? String(savedHolidayRule.percentage) : '100')
	const holidayClassifications = holidayDrafts[holidayDraftKey]?.classifications
		?? savedHolidayRule?.eligible_classifications
		?? defaultHolidayClassifications
	const eligibleHolidayEmployees = branchEmployees.filter((employee) =>
		holidayClassifications.includes(employee.classification)
	)
	const visibleHolidayEntries = holidayEntries.filter((entry) => entry.addition_type === activeType)
	const visibleAdditions = additions.filter((addition) => addition.addition_type === activeType)
	const visibleAmountKey = selectedWeek
		? getAdditionKey(selectedBranchId, employeeCode, selectedWeek.startDate, activeType)
		: ''
	const selectedMonthLabel = new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString(undefined, {
		month: 'long',
		year: 'numeric'
	})
	const estimatedHolidayTotal = eligibleHolidayEmployees.reduce((total, employee) =>
		total + Math.round((employee.dailyRate * Number(holidayPercentage) / 100) * 100) / 100, 0)
	const weekDates = getWeekDates(selectedWeek)
	const selectedWeekOvertime = weekdays.flatMap((day) => {
		const date = weekDates[day.key]
		return date ? [{
			...day,
			date,
			hours: overtimeHours[getOvertimeKey(selectedBranchId, employeeCode, date)] ?? ''
		}] : []
	})
	const totalOvertimeHours = selectedWeekOvertime.reduce(
		(total, day) => total + (Number(day.hours) || 0),
		0
	)
	const overtimePay = selectedEmployee
		? Math.round((selectedEmployee.dailyRate / 8 * totalOvertimeHours) * 100) / 100
		: 0
	const overtimeHistoryGroups = overtimeEntries.reduce((groups, entry) => {
		const week = payrollWeeks.find((candidate) =>
			entry.overtime_date >= candidate.startDate && entry.overtime_date <= candidate.endDate
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

	useEffect(() => {
		let isCurrent = true

		const loadDirectory = async () => {
			setDirectoryStatus('loading')
			if (!sessionToken) {
				setError('Your TAFI Admin session is missing. Sign in again to manage payroll additions.')
				setDirectoryStatus('error')
				setLoadStatus('error')
				return
			}

			const [branchesResult, employeesResult] = await Promise.all([
				listTafiAdminBranches(sessionToken),
				listTafiAdminEmployees(sessionToken)
			])
			if (!isCurrent) return
			const directoryError = branchesResult.error ?? employeesResult.error
			if (directoryError) {
				setError(directoryError.message)
				setDirectoryStatus('error')
				setLoadStatus('error')
				return
			}

			const loadedBranches = branchesResult.data ?? []
			const loadedEmployees = employeesResult.data ?? []
			const defaultBranchId = loadedBranches[0]?.branch_id ?? ''
			setBranches(loadedBranches)
			setEmployees(loadedEmployees)
			setSelectedBranchId(defaultBranchId)
			setEmployeeCode(loadedEmployees.find((employee) =>
				employee.branch_id === defaultBranchId && employee.employment_status === 'active'
			)?.employee_code ?? '')
			setDirectoryStatus('ready')
		}

		loadDirectory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadMonthData = async () => {
			if (directoryStatus !== 'ready' || !selectedBranchId) {
				if (directoryStatus === 'ready' && !selectedBranchId) setLoadStatus('ready')
				return
			}

			const [year, month] = selectedMonth.split('-').map(Number)
			const periodStart = getLocalDateKey(new Date(year, month - 1, 1))
			const periodEnd = getLocalDateKey(new Date(year, month, 0))
			setLoadStatus('loading')
			setError('')
			const [additionResult, overtimeResult, holidayResult, holidayRuleResult] = await Promise.all([
				listTafiAdminPayrollAdditions(sessionToken, selectedBranchId, periodStart, periodEnd),
				listTafiAdminOvertimeHistory(sessionToken, selectedBranchId, periodStart, periodEnd),
				listTafiAdminHolidayPay(sessionToken, selectedBranchId, periodStart, periodEnd),
				listTafiAdminHolidayPayRules(sessionToken, selectedBranchId, periodStart, periodEnd)
			])
			if (!isCurrent) return
			const loadError = additionResult.error
				?? overtimeResult.error
				?? holidayResult.error
				?? holidayRuleResult.error
			if (loadError) {
				setError(loadError.message)
				setLoadStatus('error')
				return
			}

			const loadedAdditions = additionResult.data ?? []
			const loadedOvertime = overtimeResult.data ?? []
			setAdditions(loadedAdditions)
			setOvertimeEntries(loadedOvertime)
			setHolidayEntries(holidayResult.data ?? [])
			setHolidayRules(holidayRuleResult.data ?? [])
			setAmounts(Object.fromEntries(loadedAdditions.map((addition) => [
				getAdditionKey(selectedBranchId, addition.employee_code, addition.period_start, addition.addition_type),
				String(addition.amount)
			])))
			setOvertimeHours(Object.fromEntries(loadedOvertime.map((entry) => [
				getOvertimeKey(selectedBranchId, entry.employee_code, entry.overtime_date),
				String(entry.hours)
			])))
			setLoadStatus('ready')
		}

		loadMonthData()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedBranchId, selectedMonth, directoryStatus, reloadVersion])

	const saveAddition = async (event) => {
		event.preventDefault()
		setError('')
		setMessage('')
		const rawAmount = amounts[visibleAmountKey] ?? ''
		const amount = Number(rawAmount)
		if (!selectedBranchId || !employeeCode || !selectedWeek || rawAmount.trim() === ''
			|| !Number.isFinite(amount) || amount < 0) {
			setError('Choose an employee and payroll week, then enter an amount of zero or more.')
			return
		}

		setIsSaving(true)
		const { error: saveError } = await saveTafiAdminPayrollAddition(sessionToken, selectedBranchId, {
			employeeCode,
			periodStart: selectedWeek.startDate,
			periodEnd: selectedWeek.endDate,
			additionType: activeType,
			amount
		})
		setIsSaving(false)
		if (saveError) {
			setError(saveError.message)
			return
		}
		setMessage(`${selectedType.label} saved and included in the selected week’s payroll.`)
		setReloadVersion((version) => version + 1)
	}

	const saveOvertime = async (event) => {
		event.preventDefault()
		setError('')
		setMessage('')
		if (!selectedBranchId || !employeeCode || !selectedWeek || selectedWeekOvertime.length === 0) {
			setError('Choose an employee and payroll week before entering overtime hours.')
			return
		}
		const dailyHours = selectedWeekOvertime.map((day) => ({
			date: day.date,
			hours: day.hours.trim() === '' ? 0 : Number(day.hours)
		}))
		if (dailyHours.some((day) => !Number.isFinite(day.hours) || day.hours < 0 || day.hours > 24)) {
			setError('Enter valid overtime hours between 0 and 24 for each day.')
			return
		}

		setIsSaving(true)
		const { error: saveError } = await saveTafiAdminOvertimeHours(sessionToken, selectedBranchId, {
			employeeCode,
			periodStart: selectedWeek.startDate,
			periodEnd: selectedWeek.endDate,
			dailyHours
		})
		setIsSaving(false)
		if (saveError) {
			setError(saveError.message)
			return
		}
		setMessage(`Saved ${totalOvertimeHours.toFixed(2)} overtime hours. ${formatCurrency(overtimePay)} will be included in the selected week’s payroll.`)
		setReloadVersion((version) => version + 1)
	}

	const saveHoliday = async (event) => {
		event.preventDefault()
		setError('')
		setMessage('')
		const percentage = Number(holidayPercentage)
		if (!selectedBranchId || !selectedWeek || !holidayDate
			|| holidayDate < selectedWeek.startDate || holidayDate > selectedWeek.endDate
			|| !Number.isFinite(percentage) || percentage < 0 || percentage > 1000) {
			setError('Choose a holiday date within the selected week and enter a percentage from 0 to 1000.')
			return
		}
		if (holidayClassifications.length === 0 || eligibleHolidayEmployees.length === 0) {
			setError('Select at least one classification with active employees for this holiday.')
			return
		}

		setIsSaving(true)
		const { error: saveError } = await saveTafiAdminHolidayPay(sessionToken, selectedBranchId, {
			periodStart: selectedWeek.startDate,
			periodEnd: selectedWeek.endDate,
			holidayDate,
			additionType: activeType,
			percentage,
			eligibleClassifications: holidayClassifications
		})
		setIsSaving(false)
		if (saveError) {
			setError(saveError.message)
			return
		}
		setHolidayDrafts((current) => {
			const next = { ...current }
			delete next[holidayDraftKey]
			return next
		})
		setMessage(`${selectedType.label} saved for ${eligibleHolidayEmployees.length} employees. Payroll will include approximately ${formatCurrency(estimatedHolidayTotal)} for this date.`)
		setReloadVersion((version) => version + 1)
	}

	return (
		<section className="branch-other-deduction-page tafi-other-addition-page">
			<header className="branch-other-deduction-header tafi-other-addition-header">
				<div>
					<p className="employee-info-eyebrow">TAFI Admin</p>
					<h3>Other Addition Pay</h3>
					<p className="employee-info-description">
						Add holiday and overtime earnings to the selected branch’s payroll.
					</p>
				</div>
				<label className="tafi-attendance-branch-select">
					<span>Branch</span>
					<select
						value={selectedBranchId}
						onChange={(event) => {
							const branchId = event.target.value
							setSelectedBranchId(branchId)
							setLoadStatus('loading')
							setEmployeeCode(employees.find((employee) =>
								employee.branch_id === branchId && employee.employment_status === 'active'
							)?.employee_code ?? '')
							setError('')
							setMessage('')
						}}
						disabled={directoryStatus !== 'ready' || branches.length === 0 || isSaving}
					>
						{branches.length === 0 && <option value="">No branches available</option>}
						{branches.map((branch) => (
							<option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
						))}
					</select>
				</label>
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

			{directoryStatus === 'loading' && (
				<p className="other-deduction-message" role="status">Loading branches and employees…</p>
			)}
			{loadStatus === 'loading' && directoryStatus === 'ready' && (
				<p className="other-deduction-message" role="status">Loading payroll addition records…</p>
			)}
			{error && <p className="other-deduction-message error" role="alert">{error}</p>}
			{message && <p className="other-deduction-message" role="status">{message}</p>}

			<section className="other-deduction-panel">
				<h4>{activeType === 'overtime_pay'
					? 'Enter daily overtime hours'
					: isHolidayPayType ? `Enter ${selectedType.label} percentage` : `Enter ${selectedType.label}`}</h4>
				<p className="other-deduction-help">
					{activeType === 'overtime_pay'
						? 'Enter hours worked each day. Overtime pay is calculated as daily rate ÷ 8 × total overtime hours.'
						: isHolidayPayType
							? 'Choose the holiday date, percentage of daily rate, and eligible employee classifications.'
							: 'Enter an amount to add to the selected employee’s payroll for this week.'}
				</p>
				<form
					className="other-deduction-form"
					onSubmit={activeType === 'overtime_pay' ? saveOvertime : isHolidayPayType ? saveHoliday : saveAddition}
				>
					{!isHolidayPayType && (
						<label>
							<span>Employee</span>
							<select
								value={employeeCode}
								onChange={(event) => setEmployeeCode(event.target.value)}
								required
								disabled={loadStatus !== 'ready' || branchEmployees.length === 0 || isSaving}
							>
								{branchEmployees.length === 0 && <option value="">No active employees available</option>}
								{branchEmployees.map((employee) => (
									<option key={employee.code} value={employee.code}>{employee.name} · {employee.code}</option>
								))}
							</select>
						</label>
					)}
					<label>
						<span>Payroll week</span>
						<select
							value={weekIndex}
							onChange={(event) => {
								const nextWeek = payrollWeeks[Number(event.target.value)]
								setWeekIndex(Number(event.target.value))
								if (isHolidayPayType) setHolidayDate(nextWeek?.startDate ?? '')
							}}
							disabled={isSaving}
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
																: classifications.filter((item) => item !== classification)
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
								<button
									type="submit"
									disabled={isSaving || loadStatus !== 'ready'
										|| eligibleHolidayEmployees.length === 0 || holidayClassifications.length === 0}
								>
									{isSaving ? 'Saving…' : `Save ${selectedType.label}`}
								</button>
								<div className="holiday-pay-summary">
									<strong>{eligibleHolidayEmployees.length}</strong>
									<span>active employees in selected classifications</span>
									<strong>{formatCurrency(estimatedHolidayTotal)}</strong>
									<span>estimated total at {holidayPercentage || 0}% of daily rate</span>
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
												[getOvertimeKey(selectedBranchId, employeeCode, date)]: event.target.value
											}))}
											disabled={!date || loadStatus !== 'ready' || isSaving}
											placeholder={date ? 'Hours' : 'No date'}
										/>
									</label>
								)
							})}
							<div className="overtime-hours-total">
								<span>Total hours</span><strong>{totalOvertimeHours.toFixed(2)}</strong>
								<span>Calculated overtime pay</span><strong>{formatCurrency(overtimePay)}</strong>
								{selectedEmployee && (
									<small>Daily rate {formatCurrency(selectedEmployee.dailyRate)} ÷ 8 × {totalOvertimeHours.toFixed(2)} hours</small>
								)}
							</div>
							<button type="submit" disabled={isSaving || loadStatus !== 'ready' || branchEmployees.length === 0}>
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
									value={amounts[visibleAmountKey] ?? ''}
									onChange={(event) => setAmounts((current) => ({
										...current,
										[visibleAmountKey]: event.target.value
									}))}
									required
								/>
							</label>
							<button type="submit" disabled={isSaving || loadStatus !== 'ready' || branchEmployees.length === 0}>
								{isSaving ? 'Saving…' : `Save ${selectedType.label}`}
							</button>
						</>
					)}
				</form>
			</section>

			<div className="other-deduction-history-heading other-addition-history-heading">
				<div>
					<h4>{selectedType.label} history</h4>
					<p>Showing entries for {selectedMonthLabel}{selectedBranch ? ` · ${selectedBranch.branch_name}` : ''}.</p>
				</div>
				<label className="cash-advance-month-control">
					<span>Payroll month</span>
					<input
						type="month"
						value={selectedMonth}
						disabled={isSaving}
						onChange={(event) => {
							if (!event.target.value) return
							const nextWeeks = getPayrollWeeks(event.target.value)
							setSelectedMonth(event.target.value)
							setWeekIndex(0)
							setLoadStatus('loading')
							if (isHolidayPayType) setHolidayDate(nextWeeks[0]?.startDate ?? '')
							setMessage('')
							setError('')
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
							{visibleHolidayEntries.map((entry) => (
								<tr key={entry.id}>
									<td><strong>{entry.employee_name}</strong><span>{entry.employee_code}</span></td>
									<td>{formatDate(entry.holiday_date)}</td>
									<td>{Number(entry.percentage).toFixed(2)}%</td>
									<td>{formatCurrency(entry.daily_rate)}</td>
									<td>{formatCurrency(entry.amount)}</td>
								</tr>
							))}
							{loadStatus === 'ready' && visibleHolidayEntries.length === 0 && (
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
							{loadStatus === 'ready' && overtimeHistoryGroups.length === 0 && (
								<tr><td className="employee-empty-state" colSpan="4">No overtime hours have been entered for this month.</td></tr>
							)}
						</tbody>
					</table>
				</div>
			) : (
				<div className="other-deduction-table-wrap" role="region" aria-label={`${selectedType.label} history`} tabIndex="0">
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
							{loadStatus === 'ready' && visibleAdditions.length === 0 && (
								<tr><td className="employee-empty-state" colSpan="4">No {selectedType.label.toLowerCase()} entries for this month.</td></tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}