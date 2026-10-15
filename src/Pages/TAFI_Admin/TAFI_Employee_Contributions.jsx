import { useEffect, useMemo, useState } from 'react'
import {
	getTafiAdminContributionPeriodSettings,
	listTafiAdminBranches,
	listTafiAdminEmployeeContributions,
	listTafiAdminEmployees,
	saveTafiAdminEmployeeContribution,
	saveTafiAdminContributionPeriodSettings
} from '../../lib/supabase'
import { getPayrollPeriods } from '../../lib/payrollPeriods'

const contributionFields = [
	{ key: 'sss', label: 'SSS' },
	{ key: 'philhealth', label: 'PhilHealth' },
	{ key: 'pagibig', label: 'Pag-IBIG' }
]

const emptyContribution = () => ({ sss: '0.00', philhealth: '0.00', pagibig: '0.00' })
const getContributionKey = (branchId, employeeCode) => `${branchId}:${employeeCode}`
const getCurrentMonthKey = () => {
	const now = new Date()
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const formatDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
	month: 'long',
	day: 'numeric',
	year: 'numeric'
})

export default function TafiEmployeeContributions({ sessionToken }) {
	const [activeTab, setActiveTab] = useState('amounts')
	const [branches, setBranches] = useState([])
	const [employees, setEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [directoryStatus, setDirectoryStatus] = useState('loading')
	const [loadStatus, setLoadStatus] = useState('loading')
	const [contributions, setContributions] = useState({})
	const [loadError, setLoadError] = useState('')
	const [saveError, setSaveError] = useState('')
	const [savedEmployeeKey, setSavedEmployeeKey] = useState('')
	const [savingEmployeeKey, setSavingEmployeeKey] = useState('')
	const [scheduleMonth, setScheduleMonth] = useState(getCurrentMonthKey)
	const [enabledPeriodStarts, setEnabledPeriodStarts] = useState([])
	const [scheduleStatus, setScheduleStatus] = useState('loading')
	const [scheduleError, setScheduleError] = useState('')
	const [scheduleMessage, setScheduleMessage] = useState('')
	const [isSavingSchedule, setIsSavingSchedule] = useState(false)

	const contributionPeriods = useMemo(() => getPayrollPeriods(scheduleMonth), [scheduleMonth])
	const scheduleMonthStart = `${scheduleMonth}-01`
	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const activeEmployees = employees.filter((employee) =>
		employee.branch_id === selectedBranchId && employee.employment_status === 'active'
	)

	useEffect(() => {
		let isCurrent = true

		const loadDirectory = async () => {
			if (!sessionToken) {
				setLoadError('Your TAFI Admin session is missing. Sign in again to manage contributions.')
				setDirectoryStatus('error')
				setLoadStatus('error')
				return
			}

			setDirectoryStatus('loading')
			setLoadError('')
			const [branchesResult, employeesResult] = await Promise.all([
				listTafiAdminBranches(sessionToken),
				listTafiAdminEmployees(sessionToken)
			])
			if (!isCurrent) return

			const error = branchesResult.error ?? employeesResult.error
			if (error) {
				setLoadError(error.message)
				setDirectoryStatus('error')
				setLoadStatus('error')
				return
			}

			const loadedBranches = branchesResult.data ?? []
			setBranches(loadedBranches)
			setEmployees(employeesResult.data ?? [])
			setSelectedBranchId((currentBranchId) => (
				loadedBranches.some((branch) => branch.branch_id === currentBranchId)
					? currentBranchId
					: loadedBranches[0]?.branch_id ?? ''
			))
			setDirectoryStatus('ready')
			if (loadedBranches.length === 0) setLoadStatus('ready')
		}

		loadDirectory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadContributions = async () => {
			if (directoryStatus !== 'ready' || !selectedBranchId) return

			setLoadStatus('loading')
			setLoadError('')
			const { data, error } = await listTafiAdminEmployeeContributions(
				sessionToken,
				selectedBranchId
			)
			if (!isCurrent) return

			if (error) {
				setLoadError(error.message)
				setLoadStatus('error')
				return
			}

			setContributions((current) => ({
				...current,
				...Object.fromEntries((data ?? []).map((record) => [
					getContributionKey(selectedBranchId, record.employee_code),
					{
						sss: String(record.sss),
						philhealth: String(record.philhealth),
						pagibig: String(record.pagibig)
					}
				]))
			}))
			setLoadStatus('ready')
		}

		loadContributions()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedBranchId, directoryStatus])

	useEffect(() => {
		let isCurrent = true

		const loadSchedule = async () => {
			if (!sessionToken) {
				setScheduleError('Your TAFI Admin session is missing. Sign in again to manage the contribution schedule.')
				setScheduleStatus('error')
				return
			}

			setScheduleStatus('loading')
			setScheduleError('')
			setScheduleMessage('')
			const { data, error } = await getTafiAdminContributionPeriodSettings(
				sessionToken,
				scheduleMonthStart
			)
			if (!isCurrent) return

			if (error) {
				setScheduleError(error.message)
				setScheduleStatus('error')
				return
			}

			if (!Array.isArray(data)) {
				setScheduleError('The contribution schedule service returned invalid data.')
				setScheduleStatus('error')
				return
			}

			const savedPeriods = data[0]?.enabled_period_starts
			if (data.length > 0 && !Array.isArray(savedPeriods)) {
				setScheduleError('The saved contribution schedule is invalid.')
				setScheduleStatus('error')
				return
			}

			const validPeriodStarts = new Set(contributionPeriods.map((period) => period.startDate))
			setEnabledPeriodStarts(savedPeriods
				? savedPeriods.filter((periodStart) => validPeriodStarts.has(periodStart))
				: [...validPeriodStarts])
			setScheduleStatus('ready')
		}

		loadSchedule()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, scheduleMonthStart, contributionPeriods])

	const updateContribution = (employeeCode, field, value) => {
		const key = getContributionKey(selectedBranchId, employeeCode)
		setContributions((current) => ({
			...current,
			[key]: {
				...(current[key] ?? emptyContribution()),
				[field]: value
			}
		}))
		setSavedEmployeeKey('')
		setSaveError('')
	}

	const saveContribution = async (event, employee) => {
		event.preventDefault()
		const key = getContributionKey(selectedBranchId, employee.employee_code)
		const values = contributions[key] ?? emptyContribution()
		const amounts = Object.fromEntries(contributionFields.map(({ key: field }) => [
			field,
			Number(values[field])
		]))

		if (contributionFields.some(({ key: field }) =>
			values[field].trim() === '' || !Number.isFinite(amounts[field]) || amounts[field] < 0
		)) {
			setSaveError(`Enter valid non-negative weekly amounts for ${employee.employee_name}.`)
			return
		}

		setSavingEmployeeKey(key)
		setSavedEmployeeKey('')
		setSaveError('')
		const { error } = await saveTafiAdminEmployeeContribution(
			sessionToken,
			selectedBranchId,
			{ employeeCode: employee.employee_code, ...amounts }
		)
		setSavingEmployeeKey('')

		if (error) {
			setSaveError(`Could not save ${employee.employee_name}: ${error.message}`)
			return
		}

		setSavedEmployeeKey(key)
	}

	const toggleContributionPeriod = (periodStart) => {
		setEnabledPeriodStarts((current) => current.includes(periodStart)
			? current.filter((start) => start !== periodStart)
			: [...current, periodStart])
		setScheduleMessage('')
		setScheduleError('')
	}

	const saveContributionSchedule = async (event) => {
		event.preventDefault()
		if (!sessionToken || scheduleStatus !== 'ready' || isSavingSchedule) return

		setIsSavingSchedule(true)
		setScheduleError('')
		setScheduleMessage('')
		const { error } = await saveTafiAdminContributionPeriodSettings(
			sessionToken,
			scheduleMonthStart,
			enabledPeriodStarts
		)
		setIsSavingSchedule(false)

		if (error) {
			setScheduleError(`Could not save the monthly contribution schedule: ${error.message}`)
			return
		}

		setScheduleMessage(`Saved the ${scheduleMonth} contribution schedule for all branches.`)
	}

	return (
		<section className="employee-info-shell contribution-shell">
			<header className="employee-info-header">
				<div>
					<p className="employee-info-eyebrow">{selectedBranch?.branch_name ?? 'TAFI Admin'}</p>
					<h3>Mandatory Contributions</h3>
					<p className="employee-info-description">
						Manage employee contribution amounts and the monthly periods when mandatory contributions apply.
					</p>
				</div>
				{activeTab === 'amounts' && <div className="employee-total">
					<strong>{activeEmployees.length}</strong>
					<span>Employees</span>
				</div>}
			</header>

			<div className="attendance-monitoring-tabs leave-credit-tabs" role="tablist" aria-label="Mandatory contribution sections">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'amounts'}
					className={activeTab === 'amounts' ? 'monitoring-tab active' : 'monitoring-tab'}
					onClick={() => setActiveTab('amounts')}
				>
					Employee Amounts
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'schedule'}
					className={activeTab === 'schedule' ? 'monitoring-tab active' : 'monitoring-tab'}
					onClick={() => setActiveTab('schedule')}
				>
					Monthly Schedule
				</button>
			</div>

			{activeTab === 'amounts' ? (
				<>
					{directoryStatus === 'loading' && (
						<p className="contribution-message" role="status">Loading branches and employees…</p>
					)}
					{loadStatus === 'loading' && directoryStatus === 'ready' && selectedBranchId && (
						<p className="contribution-message" role="status">Loading saved contributions…</p>
					)}
					{loadError && <p className="contribution-message error" role="alert">{loadError}</p>}
					{saveError && <p className="contribution-message error" role="alert">{saveError}</p>}

					<div className="employee-directory-tools tafi-employee-directory-tools">
						<label className="employee-filter-label pl-3">
							<span>Branch</span>
							<select
								value={selectedBranchId}
								onChange={(event) => {
									setSelectedBranchId(event.target.value)
									setSavedEmployeeKey('')
									setSaveError('')
								}}
								disabled={directoryStatus !== 'ready' || branches.length === 0}
							>
								{branches.length === 0 && <option value="">No branches available</option>}
								{branches.map((branch) => (
									<option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
								))}
							</select>
						</label>
					</div>

					<div className="employee-table-wrap contribution-table-wrap" role="region" aria-label="Employee contribution list" tabIndex="0">
						<table className="employee-info-table contribution-table">
							<thead>
								<tr>
									<th>Employee</th>
									<th>Employee ID</th>
									{contributionFields.map(({ key, label }) => <th key={key}>{label} / week (PHP)</th>)}
									<th>Action</th>
								</tr>
							</thead>
							<tbody>
								{activeEmployees.map((employee) => {
									const key = getContributionKey(selectedBranchId, employee.employee_code)
									const values = contributions[key] ?? emptyContribution()
									const isSaving = savingEmployeeKey === key

									return (
										<tr key={employee.employee_id}>
											<td>{employee.employee_name}</td>
											<td>{employee.employee_code}</td>
											{contributionFields.map(({ key: field, label }) => (
												<td key={field}>
													<input
														className="contribution-amount-input"
														type="number"
														min="0"
														step="0.01"
														required
														value={values[field]}
														disabled={loadStatus !== 'ready' || Boolean(savingEmployeeKey)}
														onChange={(event) => updateContribution(
															employee.employee_code,
															field,
															event.target.value
														)}
														aria-label={`${label} weekly contribution for ${employee.employee_name}`}
													/>
												</td>
											))}
											<td>
												<form onSubmit={(event) => saveContribution(event, employee)}>
													<button
														type="submit"
														className="add-employee-submit contribution-save-button"
														disabled={loadStatus !== 'ready' || isSaving || Boolean(savingEmployeeKey)}
													>
														{isSaving ? 'Saving…' : 'Save'}
													</button>
													{savedEmployeeKey === key && <span className="contribution-saved">Saved</span>}
												</form>
											</td>
										</tr>
									)
								})}
								{directoryStatus === 'ready' && activeEmployees.length === 0 && (
									<tr><td className="employee-empty-state" colSpan="6">
										{selectedBranchId ? 'No active employees in this branch.' : 'No branches have been created yet.'}
									</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</>
			) : (
				<div className="contribution-schedule-panel" role="tabpanel">
					<div className="employee-directory-tools tafi-employee-directory-tools">
						<label className="employee-filter-label pl-3">
							<span>Payroll month</span>
							<input
								type="month"
								value={scheduleMonth}
								onChange={(event) => {
									if (event.target.value) setScheduleMonth(event.target.value)
								}}
							/>
						</label>
					</div>
					<p className="contribution-schedule-note">
						This schedule applies to all branches. New months default to mandatory contributions on for every period until you save a schedule.
						Unchecked periods will show ₱0 mandatory contribution for each employee in payroll.
					</p>
					{scheduleStatus === 'loading' && (
						<p className="contribution-message" role="status">Loading the monthly contribution schedule…</p>
					)}
					{scheduleError && <p className="contribution-message error" role="alert">{scheduleError}</p>}
					{scheduleMessage && <p className="contribution-message" role="status">{scheduleMessage}</p>}
					<form onSubmit={saveContributionSchedule}>
						<div className="contribution-period-list">
							{contributionPeriods.map((period) => {
								const isEnabled = enabledPeriodStarts.includes(period.startDate)
								return (
									<label className="contribution-period-option" key={period.startDate}>
										<input
											type="checkbox"
											checked={isEnabled}
											disabled={scheduleStatus !== 'ready' || isSavingSchedule}
											onChange={() => toggleContributionPeriod(period.startDate)}
											aria-label={`${period.label}: mandatory contributions`}
										/>
										<span className="contribution-period-details">
											<strong>{period.label}</strong>
											<span>{formatDate(period.startDate)} – {formatDate(period.endDate)}</span>
											<span>{isEnabled ? 'Mandatory contributions apply' : 'No mandatory contribution (₱0 in payroll)'}</span>
										</span>
									</label>
								)
							})}
						</div>
						<button
							type="submit"
							className="add-employee-submit contribution-schedule-save"
							disabled={scheduleStatus !== 'ready' || isSavingSchedule}
						>
							{isSavingSchedule ? 'Saving schedule…' : 'Save monthly schedule'}
						</button>
					</form>
				</div>
			)}
		</section>
	)
}