import { useEffect, useMemo, useState } from 'react'
import { Check, Download, Eye, X } from 'lucide-react'
import {
	addTafiAdminEmployeeLeaveCredits,
	fileTafiAdminEmployeeLeaveRequest,
	getTafiAdminEmployeeLeaveRequestAttachment,
	listTafiAdminBranches,
	listTafiAdminEmployeeLeaveCreditSummary,
	listTafiAdminEmployeeLeaveRequests,
	updateTafiAdminEmployeeLeaveRequestStatus
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

const createAttachmentBlob = (file) => {
	const binary = window.atob(file.file_base64)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}
	return new Blob([bytes], { type: file.content_type })
}

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
	const [leaveEmployeeCode, setLeaveEmployeeCode] = useState('')
	const [leaveStartDate, setLeaveStartDate] = useState('')
	const [leaveEndDate, setLeaveEndDate] = useState('')
	const [leaveType, setLeaveType] = useState('vl_without_pay')
	const [leaveReason, setLeaveReason] = useState('')
	const [selectedFiles, setSelectedFiles] = useState([])
	const [downloadingAttachmentId, setDownloadingAttachmentId] = useState('')
	const [viewingAttachmentId, setViewingAttachmentId] = useState('')
	const [previewAttachment, setPreviewAttachment] = useState(null)
	const [creditDays, setCreditDays] = useState('1.25')
	const [reason, setReason] = useState('')
	const [reloadVersion, setReloadVersion] = useState(0)

	useEffect(() => {
		if (!previewAttachment) return undefined
		const handleKeyDown = (event) => {
			if (event.key === 'Escape') setPreviewAttachment(null)
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [previewAttachment])

	useEffect(() => () => {
		if (previewAttachment?.url) URL.revokeObjectURL(previewAttachment.url)
	}, [previewAttachment])

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
			setLeaveEmployeeCode((current) =>
				loadedEmployees.some((employee) =>
					employee.employee_code === current && employee.employment_status === 'active'
				)
					? current
					: loadedEmployees.find((employee) => employee.employment_status === 'active')?.employee_code ?? ''
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
	const requestableEmployees = employees.filter((employee) => employee.employment_status === 'active')
	const selectedEmployee = creditEligibleEmployees.find((employee) =>
		employee.employee_code === employeeCode
	)
	const selectedLeaveEmployee = requestableEmployees.find((employee) =>
		employee.employee_code === leaveEmployeeCode
	)
	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const leaveAvailableCredits = Math.max(
		0,
		Number(selectedLeaveEmployee?.balance ?? 0) - Number(selectedLeaveEmployee?.pending_credits ?? 0)
	)
	const leaveDays = getInclusiveDayCount(leaveStartDate, leaveEndDate)
	const requestedCredits = leaveType === 'vl_with_pay' ? leaveDays : 0

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

	const fileLeaveRequest = async (event) => {
		event.preventDefault()
		if (!sessionToken || !selectedBranchId) {
			setError('Select a branch and sign in again before filing leave.')
			return
		}
		if (!selectedLeaveEmployee || !leaveStartDate || !leaveEndDate || !leaveReason.trim()) {
			setError('Select an employee, leave dates, and enter a reason.')
			return
		}
		if (leaveEndDate < leaveStartDate) {
			setError('The end date must be on or after the start date.')
			return
		}
		if (!leaveTypes.some((type) => type.value === leaveType)) {
			setError('Select a valid leave type.')
			return
		}
		if (leaveType === 'vl_with_pay'
			&& (selectedLeaveEmployee.employment_classification !== 'Regular'
				|| requestedCredits > leaveAvailableCredits)) {
			setError(`Vacation leave with pay requires enough available credits. This employee has ${formatCredits(leaveAvailableCredits)}; choose Vacation leave without pay or another leave type if credits are insufficient.`)
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

		const { error: submitError } = await fileTafiAdminEmployeeLeaveRequest(
			sessionToken,
			selectedBranchId,
			{
				employeeCode: leaveEmployeeCode,
				startDate: leaveStartDate,
				endDate: leaveEndDate,
				leaveType,
				reason: leaveReason.trim(),
				attachments
			}
		)
		setIsSubmitting(false)
		if (submitError) {
			setError(submitError.message)
			return
		}

		setMessage('Leave request filed. Attendance was recorded for the selected dates and paid-leave credits were deducted if used.')
		setLeaveStartDate('')
		setLeaveEndDate('')
		setLeaveType('vl_without_pay')
		setLeaveReason('')
		setSelectedFiles([])
		setReloadVersion((version) => version + 1)
	}

	const downloadAttachment = async (attachment) => {
		setDownloadingAttachmentId(attachment.id)
		setError('')
		setMessage('')
		try {
			const { data, error: downloadError } = await getTafiAdminEmployeeLeaveRequestAttachment(
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

	const viewAttachment = async (attachment) => {
		setViewingAttachmentId(attachment.id)
		setError('')
		setMessage('')
		try {
			const { data, error: loadError } = await getTafiAdminEmployeeLeaveRequestAttachment(
				sessionToken,
				attachment.id
			)
			if (loadError) {
				setError(loadError.message)
				return
			}
			const file = data?.[0]
			if (!file) {
				setError('The selected leave form was not returned.')
				return
			}

			setPreviewAttachment({
				fileName: file.file_name,
				contentType: file.content_type,
				url: URL.createObjectURL(createAttachmentBlob(file))
			})
		} catch (loadError) {
			setError(loadError instanceof Error
				? loadError.message
				: 'Unable to preview the selected leave form.')
		} finally {
			setViewingAttachmentId('')
		}
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
							setLeaveEmployeeCode('')
							setLeaveStartDate('')
							setLeaveEndDate('')
							setLeaveReason('')
							setSelectedFiles([])
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
			) : activeTab === 'requests' ? (
				<div className="leave-request-content">
					<form className="leave-request-form" onSubmit={fileLeaveRequest}>
						<div className="leave-request-form-heading">
							<div>
								<h4>File a leave request</h4>
								<p>Filing records leave in attendance immediately. Vacation leave with pay deducts available credits.</p>
							</div>
							{selectedLeaveEmployee && leaveType === 'vl_with_pay' && (
								<div className="leave-request-balance">
									<span>Credits available / required</span>
									<strong>{formatCredits(leaveAvailableCredits)} / {formatCredits(leaveDays)}</strong>
								</div>
							)}
						</div>
						<div className="leave-request-fields">
							<label>
								<span>Employee</span>
								<select
									value={leaveEmployeeCode}
									onChange={(event) => setLeaveEmployeeCode(event.target.value)}
									required
								>
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
								<input
									type="date"
									value={leaveStartDate}
									onChange={(event) => setLeaveStartDate(event.target.value)}
									required
								/>
							</label>
							<label>
								<span>Leave end date</span>
								<input
									type="date"
									value={leaveEndDate}
									min={leaveStartDate || undefined}
									onChange={(event) => setLeaveEndDate(event.target.value)}
									required
								/>
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
								<textarea
									value={leaveReason}
									onChange={(event) => setLeaveReason(event.target.value)}
									rows="3"
									maxLength="500"
									required
								/>
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
						{leaveType === 'vl_with_pay' && selectedLeaveEmployee
							&& selectedLeaveEmployee.employment_classification !== 'Regular' && (
							<p className="leave-credit-hint">Only Regular employees can use earned leave credits. Choose Vacation leave without pay or another leave type.</p>
						)}
						{leaveType === 'vl_with_pay' && selectedLeaveEmployee
							&& requestedCredits > leaveAvailableCredits && (
							<p className="leave-credit-hint">There are not enough credits for this date range. Choose Vacation leave without pay or another leave type.</p>
						)}
						<button
							className="add-employee-submit"
							type="submit"
							disabled={
								isSubmitting
								|| isLoadingCredits
								|| !selectedLeaveEmployee
								|| !leaveStartDate
								|| !leaveEndDate
								|| selectedFiles.length === 0
								|| (leaveType === 'vl_with_pay'
									&& (selectedLeaveEmployee.employment_classification !== 'Regular'
										|| requestedCredits > leaveAvailableCredits))
							}
						>
							{isSubmitting ? 'Filing…' : 'File Leave Request'}
						</button>
						{requestableEmployees.length === 0 && !isLoadingCredits && (
							<p className="leave-credit-hint">No active employees are currently available in this branch.</p>
						)}
					</form>
				</div>
			) : (
				<section className="leave-requests-list">
					<div className="leave-requests-heading">
						<div>
							<h4>Filed leaves records</h4>
							<p>Filing immediately records attendance. Paid vacation leave uses available credits.</p>
						</div>
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
									<th>Status / Action</th>
								</tr>
							</thead>
							<tbody>
								{!isLoadingCredits && requests.map((request) => (
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
													<div className="leave-request-attachment-actions" key={attachment.id}>
														<button
															type="button"
															aria-label={`View ${attachment.file_name}`}
															disabled={viewingAttachmentId === attachment.id}
															onClick={() => viewAttachment(attachment)}
														>
															<Eye size={15} aria-hidden="true" />
															{viewingAttachmentId === attachment.id ? 'Loading…' : 'View'}
														</button>
														<button
															type="button"
															aria-label={`Download ${attachment.file_name}`}
															disabled={downloadingAttachmentId === attachment.id}
															onClick={() => downloadAttachment(attachment)}
														>
															<Download size={15} aria-hidden="true" />
															{downloadingAttachmentId === attachment.id ? 'Loading…' : attachment.file_name}
														</button>
													</div>
												))}
											</div>
										</td>
										<td>{formatDate(request.created_at)}</td>
										<td>
											<span className={`leave-request-status ${request.status}`}>
												{request.status === 'approved' ? 'Filed' : request.status}
											</span>
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
									<tr><td colSpan="9" className="leave-credit-empty">No leave requests have been filed for this branch.</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</section>
			)}
			{previewAttachment && (
				<div
					className="employee-document-preview-backdrop"
					role="presentation"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) setPreviewAttachment(null)
					}}
				>
					<section
						className="employee-document-preview"
						role="dialog"
						aria-modal="true"
						aria-labelledby="leave-attachment-preview-title"
					>
						<header className="employee-document-preview-heading">
							<h5 id="leave-attachment-preview-title">{previewAttachment.fileName}</h5>
							<button
								type="button"
								className="employee-document-preview-close"
								aria-label="Close leave form preview"
								onClick={() => setPreviewAttachment(null)}
							>
								<X size={20} aria-hidden="true" />
							</button>
						</header>
						<div className="employee-document-preview-content">
							{previewAttachment.contentType === 'application/pdf' ? (
								<iframe src={previewAttachment.url} title={`Preview of ${previewAttachment.fileName}`} />
							) : previewAttachment.contentType.startsWith('image/') ? (
								<img src={previewAttachment.url} alt={previewAttachment.fileName} />
							) : (
								<div className="employee-document-preview-unsupported">
									<p>Preview is not available for this file. Download the leave form to open it.</p>
								</div>
							)}
						</div>
					</section>
				</div>
			)}
		</section>
	)
}