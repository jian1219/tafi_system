import { useEffect, useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import {
	createBranchEmployeeLeaveRequest,
	listBranchEmployeeLeaveCredits,
	listBranchEmployeeLeaveRequests,
	updateBranchEmployeeLeaveRequestStatus
} from '../../lib/supabase'

const formatCredits = (value) => `${Number(value ?? 0).toFixed(2)} days`

const formatDate = (value) => {
	if (!value) return 'Not provided'
	return new Intl.DateTimeFormat('en-PH', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}).format(new Date(`${value}T00:00:00`))
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

const loadLeaveData = async (sessionToken) => {
	const [creditsResult, requestsResult] = await Promise.all([
		listBranchEmployeeLeaveCredits(sessionToken),
		listBranchEmployeeLeaveRequests(sessionToken)
	])
	return {
		employees: creditsResult.data ?? [],
		requests: requestsResult.data ?? [],
		error: creditsResult.error ?? requestsResult.error
	}
}

export default function BranchEmployeeLeaveCredits({ branchName = 'Bansasi Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [activeTab, setActiveTab] = useState('credits')
	const [employees, setEmployees] = useState([])
	const [requests, setRequests] = useState([])
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [updatingRequestId, setUpdatingRequestId] = useState('')
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [searchTerm, setSearchTerm] = useState('')
	const [employeeCode, setEmployeeCode] = useState('')
	const [startDate, setStartDate] = useState('')
	const [endDate, setEndDate] = useState('')
	const [creditDays, setCreditDays] = useState('1.25')
	const [reason, setReason] = useState('')

	useEffect(() => {
		let isCurrent = true

		const refreshLeaveData = async () => {
			const result = await loadLeaveData(sessionToken)
			if (!isCurrent) return
			if (result.error) {
				setError(result.error.message)
				setIsLoading(false)
				return
			}
			setEmployees(result.employees)
			setRequests(result.requests)
			setEmployeeCode((current) => current || result.employees.find((employee) =>
				employee.employment_status === 'active'
				&& employee.employment_classification === 'Regular'
				&& Number(employee.balance) > 0
			)?.employee_code || '')
			setError('')
			setIsLoading(false)
		}

		if (sessionToken) refreshLeaveData()

		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	const filteredEmployees = useMemo(() => {
		const normalizedSearch = searchTerm.trim().toLowerCase()
		return employees.filter((employee) =>
			`${employee.name} ${employee.employee_code} ${employee.employee_position}`
				.toLowerCase()
				.includes(normalizedSearch)
		)
	}, [employees, searchTerm])

	const requestableEmployees = employees.filter((employee) =>
		employee.employment_status === 'active'
		&& employee.employment_classification === 'Regular'
	)
	const selectedEmployee = requestableEmployees.find((employee) => employee.employee_code === employeeCode)
	const availableCredits = Number(selectedEmployee?.balance ?? 0) - Number(selectedEmployee?.pending_credits ?? 0)

	const refreshLeaveData = async () => {
		const result = await loadLeaveData(sessionToken)
		if (result.error) {
			setError(result.error.message)
			return false
		}
		setEmployees(result.employees)
		setRequests(result.requests)
		setError('')
		return true
	}

	const submitRequest = async (event) => {
		event.preventDefault()
		const requestedCredits = Number(creditDays)
		if (!sessionToken) {
			setError('Your login session is missing. Sign out and sign in again.')
			return
		}
		if (!employeeCode || !startDate || !endDate || !reason.trim()
			|| !Number.isFinite(requestedCredits) || requestedCredits <= 0) {
			setError('Complete every field and enter a valid number of credits.')
			return
		}
		if (endDate < startDate) {
			setError('The end date must be on or after the start date.')
			return
		}
		if (requestedCredits > availableCredits) {
			setError(`This request exceeds the available balance of ${formatCredits(availableCredits)}.`)
			return
		}

		setIsSubmitting(true)
		setError('')
		setMessage('')
		const { error: submitError } = await createBranchEmployeeLeaveRequest(sessionToken, {
			employeeCode,
			startDate,
			endDate,
			creditDays: requestedCredits,
			reason: reason.trim()
		})
		setIsSubmitting(false)
		if (submitError) {
			setError(submitError.message)
			return
		}

		setMessage('Leave-credit request submitted.')
		setStartDate('')
		setEndDate('')
		setCreditDays('1.25')
		setReason('')
		await refreshLeaveData()
	}

	const updateRequestStatus = async (requestId, status) => {
		setUpdatingRequestId(requestId)
		setError('')
		setMessage('')
		const { error: updateError } = await updateBranchEmployeeLeaveRequestStatus(
			sessionToken,
			requestId,
			status
		)
		setUpdatingRequestId('')
		if (updateError) {
			setError(updateError.message)
			return
		}
		setMessage(`Request ${status}.`)
		await refreshLeaveData()
	}

	return (
		<section className="leave-credits-shell">
			<header className="leave-credits-header">
				<div>
					<p className="leave-credits-eyebrow">{branchName}</p>
					<h3>Employee Leave Credits</h3>
					<p>Track earned leave credits and manage employee requests.</p>
				</div>
				<div className="leave-credits-policy">
					<strong>Credit policy</strong>
					<span>Regular employees earn 1.25 days for each qualifying attendance month.</span>
				</div>
			</header>

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

			{!sessionToken && (
				<p className="payroll-contribution-message error" role="alert">
					Your login session is missing. Sign out and sign in again to access leave credits.
				</p>
			)}
			{isLoading && <p className="payroll-contribution-message" role="status">Loading leave credits and requests…</p>}
			{error && <p className="payroll-contribution-message error" role="alert">{error}</p>}
			{message && <p className="leave-credits-feedback" role="status">{message}</p>}

			{activeTab === 'credits' ? (
				<>
					<div className="leave-credits-summary">
						<div><span>Employees</span><strong>{isLoading ? '—' : employees.length}</strong></div>
						<div><span>Available earned balance</span><strong>{isLoading
							? '—'
							: formatCredits(employees.reduce((total, employee) => total + Number(employee.balance ?? 0), 0))}</strong></div>
						<div><span>Pending requests</span><strong>{isLoading
							? '—'
							: formatCredits(employees.reduce((total, employee) => total + Number(employee.pending_credits ?? 0), 0))}</strong></div>
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
						<p>Only Regular employees accrue credits under the current attendance policy.</p>
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
									<th>Earned</th>
									<th>Used</th>
									<th>Pending</th>
									<th>Balance</th>
								</tr>
							</thead>
							<tbody>
								{!isLoading && filteredEmployees.map((employee) => (
									<tr key={employee.employee_code}>
										<td><strong>{employee.name}</strong><small>{employee.employee_code}</small></td>
										<td>{employee.employee_position || 'Not provided'}</td>
										<td>{formatDate(employee.hire_date)}</td>
										<td>{getTenure(employee.hire_date)}</td>
										<td><span className={`leave-employment-status ${employee.employment_classification?.toLowerCase() || 'unspecified'}`}>
											{employee.employment_classification || 'Not specified'}
										</span></td>
										<td>{formatCredits(employee.earned_credits)}</td>
										<td>{formatCredits(employee.used_credits)}</td>
										<td>{formatCredits(employee.pending_credits)}</td>
										<td><strong>{formatCredits(employee.balance)}</strong></td>
									</tr>
								))}
								{!isLoading && filteredEmployees.length === 0 && (
									<tr><td colSpan="9" className="leave-credit-empty">
										{employees.length ? 'No employees match your search.' : 'No employees found for this branch.'}
									</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</>
			) : (
				<div className="leave-request-content">
					<form className="leave-request-form" onSubmit={submitRequest}>
						<div className="leave-request-form-heading">
							<div>
								<h4>Request leave-credit use</h4>
								<p>Submit a request on behalf of an active Regular employee.</p>
							</div>
							{selectedEmployee && (
								<div className="leave-request-balance">
									<span>Available to request</span>
									<strong>{formatCredits(Math.max(0, availableCredits))}</strong>
								</div>
							)}
						</div>
						<div className="leave-request-fields">
							<label>
								<span>Employee</span>
								<select value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} required>
									<option value="">Select an employee</option>
									{requestableEmployees.map((employee) => (
										<option key={employee.employee_code} value={employee.employee_code}>
											{employee.name} — {employee.employee_code}
										</option>
									))}
								</select>
							</label>
							<label>
								<span>Leave start date</span>
								<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
							</label>
							<label>
								<span>Leave end date</span>
								<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required />
							</label>
							<label>
								<span>Credits requested (days)</span>
								<input type="number" min="0.01" step="0.25" value={creditDays} onChange={(event) => setCreditDays(event.target.value)} required />
							</label>
							<label className="leave-request-reason">
								<span>Reason</span>
								<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows="3" maxLength="500" required />
							</label>
						</div>
						<button
							className="add-employee-submit"
							type="submit"
							disabled={isSubmitting || !selectedEmployee || Number(creditDays) > availableCredits}
						>
							{isSubmitting ? 'Submitting…' : 'Submit Request'}
						</button>
						{requestableEmployees.length === 0 && !isLoading && (
							<p className="leave-credit-hint">No active Regular employees are currently eligible to request leave credits.</p>
						)}
					</form>

					<section className="leave-requests-list">
						<div className="leave-requests-heading">
							<div><h4>Leave-credit requests</h4><p>Pending requests reserve credits until approved or rejected.</p></div>
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
									{!isLoading && requests.map((request) => (
										<tr key={request.id}>
											<td><strong>{request.employee_name}</strong><small>{request.employee_code}</small></td>
											<td>{formatDate(request.start_date)} – {formatDate(request.end_date)}</td>
											<td>{formatCredits(request.credit_days)}</td>
											<td className="leave-request-reason-cell">{request.reason}</td>
											<td>{formatDate(request.created_at?.slice(0, 10))}</td>
											<td>
												<span className={`leave-request-status ${request.status}`}>{request.status}</span>
												{request.status === 'pending' && (
													<div className="leave-request-actions">
														<button type="button" aria-label={`Approve request for ${request.employee_name}`} disabled={updatingRequestId === request.id} onClick={() => updateRequestStatus(request.id, 'approved')}>
															<Check size={16} aria-hidden="true" /> Approve
														</button>
														<button type="button" aria-label={`Reject request for ${request.employee_name}`} disabled={updatingRequestId === request.id} onClick={() => updateRequestStatus(request.id, 'rejected')}>
															<X size={16} aria-hidden="true" /> Reject
														</button>
													</div>
												)}
											</td>
										</tr>
									))}
									{!isLoading && requests.length === 0 && (
										<tr><td colSpan="6" className="leave-credit-empty">No leave-credit requests have been submitted.</td></tr>
									)}
								</tbody>
							</table>
						</div>
					</section>
				</div>
			)}
		</section>
	)
}
