import { useEffect, useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import {
	addTafiAdminEmployeeLeaveCredits,
	listTafiAdminBranches,
	listTafiAdminEmployeeLeaveCreditSummary,
	listTafiAdminEmployeeLeaveRequests,
	updateTafiAdminEmployeeLeaveRequestStatus
} from '../../lib/supabase'

const formatCredits = (value) => `${Number(value ?? 0).toFixed(2)} days`

const formatDate = (value) => {
	if (!value) return 'Not provided'
	return new Intl.DateTimeFormat('en-PH', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}).format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

const getTenure = (hireDate) => {
	if (!hireDate) return 'Not provided'
	const startDate = new Date(`${hireDate}T00:00:00`)
	const today = new Date()
	const daysEmployed = Math.max(0, Math.floor((today - startDate) / 86400000))

	if (daysEmployed < 30) return `${daysEmployed} ${daysEmployed === 1 ? 'day' : 'days'}`

	let months = (today.getFullYear() - startDate.getFullYear()) * 12
		+ today.getMonth() - startDate.getMonth()
	if (today.getDate() < startDate.getDate()) months -= 1

	if (months < 12) return `${Math.max(1, months)} ${months === 1 ? 'month' : 'months'}`
	const years = Math.floor(months / 12)
	const remainingMonths = months % 12
	return remainingMonths
		? `${years} ${years === 1 ? 'year' : 'years'}, ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`
		: `${years} ${years === 1 ? 'year' : 'years'}`
}

export default function TafiLeaveCredits({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [activeTab, setActiveTab] = useState('credits')
	const [employees, setEmployees] = useState([])
	const [requests, setRequests] = useState([])
	const [isLoadingBranches, setIsLoadingBranches] = useState(Boolean(sessionToken))
	const [isLoadingCredits, setIsLoadingCredits] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [updatingRequestId, setUpdatingRequestId] = useState('')
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [searchTerm, setSearchTerm] = useState('')
	const [employeeCode, setEmployeeCode] = useState('')
	const [creditDays, setCreditDays] = useState('1.25')
	const [reason, setReason] = useState('')
	const [reloadVersion, setReloadVersion] = useState(0)

	useEffect(() => {
		let isCurrent = true

		const loadBranches = async () => {
			if (!sessionToken) {
				setError('Your TAFI Admin login session is missing. Sign out and sign in again.')
				setIsLoadingBranches(false)
				return
			}

			setIsLoadingBranches(true)
			const { data, error: loadError } = await listTafiAdminBranches(sessionToken)
			if (!isCurrent) return

			if (loadError) {
				setError(loadError.message)
				setBranches([])
				setIsLoadingBranches(false)
				return
			}

			const loadedBranches = data ?? []
			setBranches(loadedBranches)
			setSelectedBranchId((current) =>
				loadedBranches.some((branch) => branch.branch_id === current)
					? current
					: loadedBranches[0]?.branch_id ?? ''
			)
			setError('')
			setIsLoadingBranches(false)
		}

		loadBranches()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadBranchLeaveData = async () => {
			if (!sessionToken || !selectedBranchId) {
				setEmployees([])
				setRequests([])
				setIsLoadingCredits(false)
				return
			}

			setIsLoadingCredits(true)
			setError('')
			const [creditsResult, requestsResult] = await Promise.all([
				listTafiAdminEmployeeLeaveCreditSummary(sessionToken, selectedBranchId),
				listTafiAdminEmployeeLeaveRequests(sessionToken, selectedBranchId)
			])
			if (!isCurrent) return

			const loadError = creditsResult.error ?? requestsResult.error
			if (loadError) {
				setError(loadError.message)
				setEmployees([])
				setRequests([])
				setIsLoadingCredits(false)
				return
			}

			const loadedEmployees = creditsResult.data ?? []
			setEmployees(loadedEmployees)
			setRequests(requestsResult.data ?? [])
			setEmployeeCode((current) =>
				loadedEmployees.some((employee) =>
					employee.employee_code === current
					&& employee.employment_status === 'active'
					&& employee.employment_classification === 'Regular'
				)
					? current
					: loadedEmployees.find((employee) =>
						employee.employment_status === 'active'
						&& employee.employment_classification === 'Regular'
					)?.employee_code ?? ''
			)
			setIsLoadingCredits(false)
		}

		loadBranchLeaveData()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedBranchId, reloadVersion])

	const filteredEmployees = useMemo(() => {
		const normalizedSearch = searchTerm.trim().toLowerCase()
		return employees.filter((employee) =>
			`${employee.name} ${employee.employee_code} ${employee.employee_position}`
				.toLowerCase()
				.includes(normalizedSearch)
		)
	}, [employees, searchTerm])

	const creditEligibleEmployees = employees.filter((employee) =>
		employee.employment_status === 'active'
		&& employee.employment_classification === 'Regular'
	)
	const selectedEmployee = creditEligibleEmployees.find((employee) =>
		employee.employee_code === employeeCode
	)
	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)

	const addCredits = async (event) => {
		event.preventDefault()
		const amount = Number(creditDays)
		if (!sessionToken || !selectedBranchId) {
			setError('Select a branch and sign in again before adding credits.')
			return
		}
		if (!employeeCode || !reason.trim() || !Number.isFinite(amount) || amount <= 0
			|| !/^\d+(\.\d{1,2})?$/.test(creditDays.trim())) {
			setError('Select an employee, enter a positive amount with up to two decimal places, and provide a reason.')
			return
		}

		setIsSubmitting(true)
		setError('')
		setMessage('')
		const { error: addError } = await addTafiAdminEmployeeLeaveCredits(
			sessionToken,
			selectedBranchId,
			{
				employeeCode,
				creditDays: amount,
				reason: reason.trim()
			}
		)
		setIsSubmitting(false)
		if (addError) {
			setError(addError.message)
			return
		}

		setMessage(`${formatCredits(amount)} added for ${selectedEmployee?.name ?? employeeCode}.`)
		setCreditDays('1.25')
		setReason('')
		setReloadVersion((version) => version + 1)
	}

	const updateRequestStatus = async (requestId, status) => {
		setUpdatingRequestId(requestId)
		setError('')
		setMessage('')
		const { error: updateError } = await updateTafiAdminEmployeeLeaveRequestStatus(
			sessionToken,
			selectedBranchId,
			requestId,
			status
		)
		setUpdatingRequestId('')
		if (updateError) {
			setError(updateError.message)
			return
		}

		setMessage(`Leave request ${status}.`)
		setReloadVersion((version) => version + 1)
	}

	const total = (field) => employees.reduce(
		(sum, employee) => sum + Number(employee[field] ?? 0),
		0
	)
	const availableBalance = employees.reduce(
		(sum, employee) => sum + Math.max(
			0,
			Number(employee.balance ?? 0) - Number(employee.pending_credits ?? 0)
		),
		0
	)

	return (
		<section className="leave-credits-shell">
			<header className="leave-credits-header">
				<div>
					<p className="leave-credits-eyebrow">TAFI Admin · {selectedBranch?.branch_name ?? 'All branches'}</p>
					<h3>Employee Leave Credits</h3>
					<p>Review earned balances, add credits, and manage leave requests.</p>
				</div>
				<label className="tafi-attendance-branch-select">
					<span>Branch</span>
					<select
						value={selectedBranchId}
						onChange={(event) => {
							setSelectedBranchId(event.target.value)
							setMessage('')
							setError('')
						}}
						disabled={isLoadingBranches || branches.length === 0}
					>
						<option value="">Select a branch</option>
						{branches.map((branch) => (
							<option key={branch.branch_id} value={branch.branch_id}>
								{branch.branch_name}
							</option>
						))}
					</select>
				</label>
			</header>

			<div className="leave-credits-policy tafi-leave-credit-policy">
				<strong>Automatic credit policy</strong>
				<span>Regular employees earn 1.25 days per month after 26 full Present or Present (Late) days, or 24 days in February. Half Days do not count toward this threshold.</span>
			</div>

			<div className="attendance-monitoring-tabs leave-credit-tabs" role="tablist" aria-label="Leave credit sections">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'credits'}
					className={activeTab === 'credits' ? 'monitoring-tab active' : 'monitoring-tab'}
					onClick={() => setActiveTab('credits')}
				>
					Earned Credits
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'requests'}
					className={activeTab === 'requests' ? 'monitoring-tab active' : 'monitoring-tab'}
					onClick={() => setActiveTab('requests')}
				>
					Use Credits / Requests
				</button>
			</div>

			{isLoadingBranches && <p className="payroll-contribution-message" role="status">Loading branches…</p>}
			{!isLoadingBranches && branches.length === 0 && !error && (
				<p className="payroll-contribution-message">No branches are available for leave-credit management.</p>
			)}
			{isLoadingCredits && <p className="payroll-contribution-message" role="status">Loading leave credits and requests…</p>}
			{error && <p className="payroll-contribution-message error" role="alert">{error}</p>}
			{message && <p className="leave-credits-feedback" role="status">{message}</p>}

			{activeTab === 'credits' ? (
				<>
					<div className="leave-credits-summary">
						<div><span>Employees</span><strong>{isLoadingCredits ? '—' : employees.length}</strong></div>
						<div><span>Available balance</span><strong>{isLoadingCredits ? '—' : formatCredits(availableBalance)}</strong></div>
						<div><span>Manual credits added</span><strong>{isLoadingCredits ? '—' : formatCredits(total('manual_credits'))}</strong></div>
						<div><span>Pending requests</span><strong>{isLoadingCredits ? '—' : formatCredits(total('pending_credits'))}</strong></div>
					</div>

					<div className="leave-request-content">
						<form className="leave-request-form" onSubmit={addCredits}>
							<div className="leave-request-form-heading">
								<div>
									<h4>Add credits</h4>
									<p>Manually add credits to an active Regular employee. The adjustment is recorded with a reason.</p>
								</div>
								{selectedEmployee && (
									<div className="leave-request-balance">
										<span>Current balance</span>
										<strong>{formatCredits(selectedEmployee.balance)}</strong>
									</div>
								)}
							</div>
							<div className="leave-request-fields">
								<label>
									<span>Employee</span>
									<select
										value={employeeCode}
										onChange={(event) => setEmployeeCode(event.target.value)}
										required
									>
										<option value="">Select an employee</option>
										{creditEligibleEmployees.map((employee) => (
											<option key={employee.employee_code} value={employee.employee_code}>
												{employee.name} — {employee.employee_code}
											</option>
										))}
									</select>
								</label>
								<label>
									<span>Credits to add (days)</span>
									<input
										type="number"
										min="0.01"
										step="0.01"
										value={creditDays}
										onChange={(event) => setCreditDays(event.target.value)}
										required
									/>
								</label>
								<label className="leave-request-reason">
									<span>Reason</span>
									<textarea
										value={reason}
										onChange={(event) => setReason(event.target.value)}
										rows="3"
										maxLength="500"
										required
									/>
								</label>
							</div>
							<button
								className="add-employee-submit"
								type="submit"
								disabled={isSubmitting || isLoadingCredits || !selectedEmployee}
							>
								{isSubmitting ? 'Adding credits…' : 'Add Credits'}
							</button>
							{creditEligibleEmployees.length === 0 && !isLoadingCredits && (
								<p className="leave-credit-hint">No active Regular employees are available for a credit adjustment in this branch.</p>
							)}
						</form>
					</div>

					<div className="leave-credit-tools">
						<label>
							<span>Search employees</span>
							<input
								type="search"
								value={searchTerm}
								onChange={(event) => setSearchTerm(event.target.value)}
								placeholder="Name, employee code, or position"
							/>
						</label>
						<p>Manual credits are added to the automatic attendance-earned balance.</p>
					</div>
					<div className="employee-table-wrap">
						<table className="employee-info-table leave-credit-table">
							<thead>
								<tr>
									<th>Name of Employee</th>
									<th>Position</th>
									<th>Date Hired</th>
									<th>Tenure</th>
									<th>Employee Status</th>
									<th>Automatic Earned</th>
									<th>Manual Added</th>
									<th>Used</th>
									<th>Pending</th>
									<th>Balance</th>
								</tr>
							</thead>
							<tbody>
								{!isLoadingCredits && filteredEmployees.map((employee) => (
									<tr key={employee.employee_code}>
										<td><strong>{employee.name}</strong><small>{employee.employee_code}</small></td>
										<td>{employee.employee_position || 'Not provided'}</td>
										<td>{formatDate(employee.hire_date)}</td>
										<td>{getTenure(employee.hire_date)}</td>
										<td>
											<span className={`leave-employment-status ${employee.employment_classification?.toLowerCase() || 'unspecified'}`}>
												{employee.employment_classification || 'Not specified'}
											</span>
											<small>{employee.employment_status || 'Status not provided'}</small>
										</td>
										<td>{formatCredits(employee.earned_credits)}</td>
										<td>{formatCredits(employee.manual_credits)}</td>
										<td>{formatCredits(employee.used_credits)}</td>
										<td>{formatCredits(employee.pending_credits)}</td>
										<td><strong>{formatCredits(employee.balance)}</strong></td>
									</tr>
								))}
								{!isLoadingCredits && filteredEmployees.length === 0 && (
									<tr>
										<td colSpan="10" className="leave-credit-empty">
											{employees.length ? 'No employees match your search.' : 'No employees found for this branch.'}
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</>
			) : (
				<section className="leave-requests-list">
					<div className="leave-requests-heading">
						<div>
							<h4>Leave-credit requests</h4>
							<p>Pending requests reserve credits until approved or rejected.</p>
						</div>
					</div>
					<div className="employee-table-wrap">
						<table className="employee-info-table leave-requests-table">
							<thead>
								<tr>
									<th>Employee</th>
									<th>Leave dates</th>
									<th>Credits</th>
									<th>Reason</th>
									<th>Submitted</th>
									<th>Status / Action</th>
								</tr>
							</thead>
							<tbody>
								{!isLoadingCredits && requests.map((request) => (
									<tr key={request.id}>
										<td><strong>{request.employee_name}</strong><small>{request.employee_code}</small></td>
										<td>{formatDate(request.start_date)} – {formatDate(request.end_date)}</td>
										<td>{formatCredits(request.credit_days)}</td>
										<td className="leave-request-reason-cell">{request.reason}</td>
										<td>{formatDate(request.created_at)}</td>
										<td>
											<span className={`leave-request-status ${request.status}`}>{request.status}</span>
											{request.status === 'pending' && (
												<div className="leave-request-actions">
													<button
														type="button"
														aria-label={`Approve request for ${request.employee_name}`}
														disabled={updatingRequestId === request.id}
														onClick={() => updateRequestStatus(request.id, 'approved')}
													>
														<Check size={16} aria-hidden="true" /> Approve
													</button>
													<button
														type="button"
														aria-label={`Reject request for ${request.employee_name}`}
														disabled={updatingRequestId === request.id}
														onClick={() => updateRequestStatus(request.id, 'rejected')}
													>
														<X size={16} aria-hidden="true" /> Reject
													</button>
												</div>
											)}
										</td>
									</tr>
								))}
								{!isLoadingCredits && requests.length === 0 && (
									<tr><td colSpan="6" className="leave-credit-empty">No leave-credit requests have been submitted for this branch.</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</section>
			)}
		</section>
	)
}