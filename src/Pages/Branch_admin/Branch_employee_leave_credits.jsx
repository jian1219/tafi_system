import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import {
	fileBranchEmployeeLeaveRequest,
	getBranchEmployeeLeaveRequestAttachment,
	listBranchEmployeeLeaveCredits,
	listBranchEmployeeLeaveRequests
} from '../../lib/supabase'

const formatCredits = (value) => `${Number(value ?? 0).toFixed(2)} days`
const maxAttachmentBytes = 20 * 1024 * 1024
const leaveTypes = [
	{ value: 'vl_with_pay', label: 'Vacation leave with pay' },
	{ value: 'vl_without_pay', label: 'Vacation leave without pay' },
	{ value: 'maternity_leave', label: 'Maternity leave' },
	{ value: 'paternity_leave', label: 'Paternity leave' },
	{ value: 'birthday_leave', label: 'Birthday leave' },
	{ value: 'authorized_leave', label: 'Authorized leave' },
	{ value: 'sick_leave', label: 'Sick leave' },
	{ value: 'emergency_leave', label: 'Emergency leave' }
]

const getInclusiveDayCount = (startDate, endDate) => {
	if (!startDate || !endDate) return 0
	const start = new Date(`${startDate}T00:00:00Z`)
	const end = new Date(`${endDate}T00:00:00Z`)
	return Math.round((end - start) / 86400000) + 1
}

const formatDate = (value) => {
	if (!value) return 'Not provided'
	return new Intl.DateTimeFormat('en-PH', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}).format(new Date(`${value}T00:00:00`))
}

const formatFileSize = (size) => size < 1024 * 1024
	? `${(size / 1024).toFixed(1)} KB`
	: `${(size / (1024 * 1024)).toFixed(1)} MB`

const getAttachmentContentType = (file) => {
	const extension = file.name.split('.').pop()?.toLowerCase()
	const contentTypeByExtension = {
		pdf: 'application/pdf',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		webp: 'image/webp'
	}
	const contentType = contentTypeByExtension[extension]
	return contentType && (!file.type || file.type === contentType) ? contentType : ''
}

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
	const reader = new FileReader()
	reader.onload = () => {
		if (typeof reader.result !== 'string') {
			reject(new Error(`Unable to read ${file.name}.`))
			return
		}
		const separatorIndex = reader.result.indexOf(',')
		if (separatorIndex < 0) {
			reject(new Error(`Unable to read ${file.name}.`))
			return
		}
		resolve(reader.result.slice(separatorIndex + 1))
	}
	reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${file.name}.`))
	reader.onabort = () => reject(new Error(`Reading ${file.name} was cancelled.`))
	reader.readAsDataURL(file)
})

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
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [searchTerm, setSearchTerm] = useState('')
	const [employeeCode, setEmployeeCode] = useState('')
	const [startDate, setStartDate] = useState('')
	const [endDate, setEndDate] = useState('')
	const [leaveType, setLeaveType] = useState('vl_without_pay')
	const [reason, setReason] = useState('')
	const [selectedFiles, setSelectedFiles] = useState([])
	const [downloadingAttachmentId, setDownloadingAttachmentId] = useState('')

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

	const requestableEmployees = employees.filter((employee) => employee.employment_status === 'active')
	const selectedEmployee = requestableEmployees.find((employee) => employee.employee_code === employeeCode)
	const availableCredits = Math.max(
		0,
		Number(selectedEmployee?.balance ?? 0) - Number(selectedEmployee?.pending_credits ?? 0)
	)
	const leaveDays = getInclusiveDayCount(startDate, endDate)
	const requestedCredits = leaveType === 'vl_with_pay' ? leaveDays : 0

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
		if (!sessionToken) {
			setError('Your login session is missing. Sign out and sign in again.')
			return
		}
		if (!selectedEmployee || !startDate || !endDate || !reason.trim()) {
			setError('Select an employee, leave dates, and enter a reason.')
			return
		}
		if (endDate < startDate) {
			setError('The end date must be on or after the start date.')
			return
		}
		if (!leaveTypes.some((type) => type.value === leaveType)) {
			setError('Select a valid leave type.')
			return
		}
		if (leaveType === 'vl_with_pay'
			&& (selectedEmployee.employment_classification !== 'Regular' || requestedCredits > availableCredits)) {
			setError(`Vacation leave with pay requires enough available credits. This employee has ${formatCredits(availableCredits)}; choose Vacation leave without pay or another leave type if credits are insufficient.`)
			return
		}
		if (selectedFiles.length < 1) {
			setError('Attach at least one PDF or image leave form.')
			return
		}
		if (selectedFiles.some((file) => file.size <= 0 || !getAttachmentContentType(file))) {
			setError('Attach valid PDF, JPG, PNG, or WEBP leave forms only.')
			return
		}
		if (selectedFiles.some((file) => file.size > maxAttachmentBytes)
			|| selectedFiles.reduce((total, file) => total + file.size, 0) > maxAttachmentBytes) {
			setError('The combined size of attached files must not exceed 20 MB.')
			return
		}

		setIsSubmitting(true)
		setError('')
		setMessage('')
		let attachments
		try {
			attachments = await Promise.all(selectedFiles.map(async (file) => ({
				fileName: file.name,
				contentType: getAttachmentContentType(file),
				fileBase64: await readFileAsBase64(file)
			})))
		} catch (readError) {
			setError(readError instanceof Error ? readError.message : 'Unable to read an attached file.')
			setIsSubmitting(false)
			return
		}

		const { error: submitError } = await fileBranchEmployeeLeaveRequest(sessionToken, {
			employeeCode,
			startDate,
			endDate,
			leaveType,
			reason: reason.trim(),
			attachments
		})
		setIsSubmitting(false)
		if (submitError) {
			setError(submitError.message)
			return
		}

		setMessage('Leave request filed. Attendance was recorded for the selected dates and paid-leave credits were deducted if used.')
		setStartDate('')
		setEndDate('')
		setLeaveType('vl_without_pay')
		setReason('')
		setSelectedFiles([])
		await refreshLeaveData()
	}

	const downloadAttachment = async (attachment) => {
		setDownloadingAttachmentId(attachment.id)
		setError('')
		setMessage('')
		try {
			const { data, error: downloadError } = await getBranchEmployeeLeaveRequestAttachment(
				sessionToken,
				attachment.id
			)
			if (downloadError) {
				setError(downloadError.message)
				return
			}
			const file = data?.[0]
			if (!file) {
				setError('The selected leave form was not returned.')
				return
			}

			const binary = window.atob(file.file_base64)
			const bytes = new Uint8Array(binary.length)
			for (let index = 0; index < binary.length; index += 1) {
				bytes[index] = binary.charCodeAt(index)
			}
			const fileUrl = URL.createObjectURL(new Blob([bytes], { type: file.content_type }))
			const link = document.createElement('a')
			link.href = fileUrl
			link.download = file.file_name
			document.body.appendChild(link)
			link.click()
			link.remove()
			window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
		} catch (downloadError) {
			setError(downloadError instanceof Error
				? downloadError.message
				: 'Unable to download the selected leave form.')
		} finally {
			setDownloadingAttachmentId('')
		}
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
					Filed Leave Request
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'records'}
					className={activeTab === 'records' ? 'monitoring-tab active' : 'monitoring-tab'}
					onClick={() => setActiveTab('records')}
				>
					Filed Leaves Records
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
						<div><span>Available balance</span><strong>{isLoading
							? '—'
							: formatCredits(employees.reduce((total, employee) =>
								total + Math.max(0, Number(employee.balance ?? 0) - Number(employee.pending_credits ?? 0)), 0
							))}</strong></div>
						<div><span>Manual credits added</span><strong>{isLoading
							? '—'
							: formatCredits(employees.reduce((total, employee) => total + Number(employee.manual_credits ?? 0), 0))}</strong></div>
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
									<th>Manual Added</th>
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
										<td>{formatCredits(employee.manual_credits)}</td>
										<td>{formatCredits(employee.used_credits)}</td>
										<td>{formatCredits(employee.pending_credits)}</td>
										<td><strong>{formatCredits(employee.balance)}</strong></td>
									</tr>
								))}
								{!isLoading && filteredEmployees.length === 0 && (
									<tr><td colSpan="10" className="leave-credit-empty">
										{employees.length ? 'No employees match your search.' : 'No employees found for this branch.'}
									</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</>
			) : activeTab === 'requests' ? (
				<div className="leave-request-content">
					<form className="leave-request-form" onSubmit={submitRequest}>
						<div className="leave-request-form-heading">
							<div>
								<h4>File a leave request</h4>
								<p>Filing records the leave in attendance immediately. Vacation leave with pay deducts available leave credits.</p>
							</div>
							{selectedEmployee && leaveType === 'vl_with_pay' && (
								<div className="leave-request-balance">
									<span>Credits available / required</span>
									<strong>{formatCredits(availableCredits)} / {formatCredits(leaveDays)}</strong>
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
								<span>Type of leave</span>
								<select value={leaveType} onChange={(event) => setLeaveType(event.target.value)} required>
									{leaveTypes.map((type) => (
										<option key={type.value} value={type.value}>{type.label}</option>
									))}
								</select>
							</label>
							<label className="leave-request-reason">
								<span>Reason</span>
								<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows="3" maxLength="500" required />
							</label>
							<label className="leave-request-attachments-input">
								<span>Leave form files (PDF, JPG, PNG, or WEBP; 20 MB combined maximum)</span>
								<input
									type="file"
									accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
									multiple
									onChange={(event) => {
										const addedFiles = Array.from(event.currentTarget.files ?? [])
										setSelectedFiles((currentFiles) => [...currentFiles, ...addedFiles])
										event.currentTarget.value = ''
										setError('')
									}}
									required={selectedFiles.length === 0}
								/>
							</label>
						</div>
						{selectedFiles.length > 0 && (
							<ul className="leave-request-selected-files">
								{selectedFiles.map((file, index) => (
									<li key={`${file.name}-${index}`}>
										{file.name} · {formatFileSize(file.size)}
									</li>
								))}
							</ul>
						)}
						{leaveType === 'vl_with_pay' && selectedEmployee
							&& selectedEmployee.employment_classification !== 'Regular' && (
							<p className="leave-credit-hint">Only Regular employees can use earned leave credits. Choose Vacation leave without pay or another type of leave.</p>
						)}
						{leaveType === 'vl_with_pay' && selectedEmployee
							&& requestedCredits > availableCredits && (
							<p className="leave-credit-hint">There are not enough credits for this date range. Choose Vacation leave without pay or another type of leave.</p>
						)}
						<button
							className="add-employee-submit"
							type="submit"
							disabled={
								isSubmitting
								|| !selectedEmployee
								|| !startDate
								|| !endDate
								|| selectedFiles.length === 0
								|| (leaveType === 'vl_with_pay'
									&& (selectedEmployee.employment_classification !== 'Regular'
										|| requestedCredits > availableCredits))
							}
						>
							{isSubmitting ? 'Filing…' : 'File Leave Request'}
						</button>
						{requestableEmployees.length === 0 && !isLoading && (
							<p className="leave-credit-hint">No active employees are currently available.</p>
						)}
					</form>
				</div>
			) : (
				<div className="leave-request-content">
					<section className="leave-requests-list">
						<div className="leave-requests-heading">
							<div><h4>Filed leaves records</h4><p>Filed requests immediately create attendance records. Paid vacation leave uses available credits.</p></div>
						</div>
						<div className="employee-table-wrap">
							<table className="employee-info-table leave-requests-table">
								<thead>
									<tr>
										<th>Employee</th>
										<th>Leave dates</th>
										<th>No. days</th>
										<th>Type of leave</th>
										<th>Credits deducted</th>
										<th>Reason</th>
										<th>Attached forms</th>
										<th>Filed on</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									{!isLoading && requests.map((request) => (
										<tr key={request.id}>
											<td><strong>{request.employee_name}</strong><small>{request.employee_code}</small></td>
											<td>{formatDate(request.start_date)} – {formatDate(request.end_date)}</td>
											<td>{getInclusiveDayCount(request.start_date, request.end_date)}</td>
											<td>{leaveTypes.find((type) => type.value === request.leave_type)?.label ?? request.leave_type}</td>
											<td>{formatCredits(request.credit_days)}</td>
											<td className="leave-request-reason-cell">{request.reason}</td>
											<td>
												<div className="leave-request-attachments">
													{(request.attachments ?? []).map((attachment) => (
														<button
															type="button"
															key={attachment.id}
															disabled={downloadingAttachmentId === attachment.id}
															onClick={() => downloadAttachment(attachment)}
														>
															<Download size={15} aria-hidden="true" />
															{downloadingAttachmentId === attachment.id
																? 'Loading…'
																: attachment.file_name}
														</button>
													))}
												</div>
											</td>
											<td>{formatDate(request.created_at?.slice(0, 10))}</td>
											<td>
												<span className={`leave-request-status ${request.status}`}>
													{request.status === 'approved' ? 'Filed' : request.status}
												</span>
											</td>
										</tr>
									))}
									{!isLoading && requests.length === 0 && (
										<tr><td colSpan="9" className="leave-credit-empty">No leave requests have been filed.</td></tr>
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
