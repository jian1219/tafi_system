import { useCallback, useEffect, useMemo, useState } from 'react'
import {
	createTafiAdminCashAdvanceLoan,
	listTafiAdminBranches,
	listTafiAdminCashAdvanceLoans,
	listTafiAdminCashAdvancePayments,
	listTafiAdminEmployees,
	saveTafiAdminCashAdvanceWeeklyDeductions
} from '../../lib/supabase'
import { getLocalDateKey } from '../Branch_admin/branchAttendanceRecords'
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

export default function TafiCashAdvance({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [directoryEmployees, setDirectoryEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [employeeCode, setEmployeeCode] = useState('')
	const [advances, setAdvances] = useState([])
	const [weeklyDeductions, setWeeklyDeductions] = useState({})
	const [advanceDate, setAdvanceDate] = useState(() => getLocalDateKey(today))
	const [advanceAmount, setAdvanceAmount] = useState('')
	const [selectedMonth, setSelectedMonth] = useState(currentMonth)
	const [isLoadingDirectory, setIsLoadingDirectory] = useState(true)
	const [status, setStatus] = useState('loading')
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [isSaving, setIsSaving] = useState(false)
	const [savingAdvanceId, setSavingAdvanceId] = useState('')
	const payrollWeeks = useMemo(() => getPayrollPeriods(selectedMonth), [selectedMonth])
	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const employees = useMemo(() => directoryEmployees
		.filter((employee) =>
			employee.branch_id === selectedBranchId
			&& employee.employment_status === 'active'
		)
		.map((employee) => ({
			id: employee.employee_code,
			name: employee.employee_name
		})), [directoryEmployees, selectedBranchId])
	const selectedEmployeeCode = employees.some((employee) => employee.id === employeeCode)
		? employeeCode
		: employees[0]?.id ?? ''

	const fetchData = useCallback(async (branchId, monthKey) => {
		const [year, month] = monthKey.split('-').map(Number)
		const periodStart = getLocalDateKey(new Date(year, month - 1, 1))
		const periodEnd = getLocalDateKey(new Date(year, month, 0))
		const [advancesResult, paymentsResult] = await Promise.all([
			listTafiAdminCashAdvanceLoans(sessionToken, branchId),
			listTafiAdminCashAdvancePayments(sessionToken, branchId, periodStart, periodEnd)
		])

		return {
			advances: advancesResult.data ?? [],
			payments: paymentsResult.data ?? [],
			error: advancesResult.error ?? paymentsResult.error
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadDirectory = async () => {
			if (!sessionToken) {
				setError('Your TAFI Admin login session is missing. Sign out and sign in again.')
				setIsLoadingDirectory(false)
				setStatus('error')
				return
			}

			const [branchesResult, employeesResult] = await Promise.all([
				listTafiAdminBranches(sessionToken),
				listTafiAdminEmployees(sessionToken)
			])
			if (!isCurrent) return

			if (branchesResult.error || employeesResult.error) {
				setError(
					[branchesResult.error?.message, employeesResult.error?.message]
						.filter(Boolean)
						.join(' ')
				)
				setIsLoadingDirectory(false)
				setStatus('error')
				return
			}

			const loadedBranches = branchesResult.data ?? []
			setBranches(loadedBranches)
			setDirectoryEmployees(employeesResult.data ?? [])
			setSelectedBranchId((currentBranchId) =>
				loadedBranches.some((branch) => branch.branch_id === currentBranchId)
					? currentBranchId
					: loadedBranches[0]?.branch_id ?? ''
			)
			setError('')
			if (loadedBranches.length === 0) setStatus('ready')
			setIsLoadingDirectory(false)
		}

		loadDirectory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		if (!sessionToken || !selectedBranchId) return undefined

		let isCurrent = true
		const loadAdvances = async () => {
			const result = await fetchData(selectedBranchId, selectedMonth)
			if (!isCurrent) return
			if (result.error) {
				setError(result.error.message)
				setStatus('error')
				return
			}

			setAdvances(result.advances)
			setWeeklyDeductions(Object.fromEntries(
				result.payments.map((payment) => [
					getPaymentKey(payment.advance_id, payment.period_start),
					String(payment.amount)
				])
			))
			setError('')
			setStatus('ready')
		}

		loadAdvances()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedBranchId, selectedMonth, fetchData])

	const refreshData = async () => {
		const result = await fetchData(selectedBranchId, selectedMonth)
		if (result.error) {
			setError(`Saved, but the cash advance monitor could not refresh: ${result.error.message}`)
			setStatus('error')
			return false
		}

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
		if (!sessionToken || !selectedBranchId || !selectedEmployeeCode || !advanceDate
			|| !Number.isFinite(amount) || amount <= 0) {
			setError('Choose a branch and employee, enter the cash advance date, and enter an amount greater than zero.')
			return
		}

		setIsSaving(true)
		const { error: saveError } = await createTafiAdminCashAdvanceLoan(sessionToken, selectedBranchId, {
			employeeCode: selectedEmployeeCode,
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
		const { error: saveError } = await saveTafiAdminCashAdvanceWeeklyDeductions(
			sessionToken,
			selectedBranchId,
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
					<p className="employee-info-eyebrow">{selectedBranch?.branch_name ?? 'TAFI Admin'}</p>
					<h3>TAFI Cash Advance</h3>
					<p className="employee-info-description">
						Track each employee’s cash advance and enter a partial deduction for each payroll week until the balance is paid.
					</p>
				</div>
				<label className="tafi-attendance-branch-select tafi-cash-advance-branch-select">
					<span>Branch</span>
					<select
						value={selectedBranchId}
						disabled={isLoadingDirectory || branches.length === 0 || isSaving || Boolean(savingAdvanceId)}
						onChange={(event) => {
							setSelectedBranchId(event.target.value)
							setEmployeeCode('')
							setError('')
							setMessage('')
							setStatus('loading')
						}}
					>
						{branches.length === 0 && <option value="">No branches available</option>}
						{branches.map((branch) => (
							<option key={branch.branch_id} value={branch.branch_id}>
								{branch.branch_name}
							</option>
						))}
					</select>
				</label>
			</header>

			<form className="cash-advance-form" onSubmit={handleCreateAdvance}>
				<label>
					<span>Employee</span>
					<select
						value={selectedEmployeeCode}
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
				<button type="submit" disabled={isSaving || status !== 'ready' || !selectedBranchId || employees.length === 0}>
					{isSaving ? 'Saving…' : 'Save cash advance'}
				</button>
			</form>

			{(isLoadingDirectory || status === 'loading') && (
				<p className="cash-advance-message" role="status">Loading employees and cash advance monitoring…</p>
			)}
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
								<th key={week.startDate}>
									{week.label}
									<small>{formatDate(week.startDate)}–{formatDate(week.endDate)}</small>
								</th>
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
												aria-label={`${week.label} cash advance deduction for ${advance.employee_name}`}
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
							<tr>
								<td className="employee-empty-state" colSpan={7 + payrollWeeks.length}>
									No cash advances have been recorded.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			<p className="cash-advance-month-note">
				Showing weekly deductions for {monthLabel}. Choose a different month to review or update another month’s repayments.
			</p>
		</section>
	)
}
