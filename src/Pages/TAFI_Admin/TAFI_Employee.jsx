import { useEffect, useMemo, useState } from 'react'
import {
	createTafiAdminEmployee,
	listTafiAdminAttendance,
	listTafiAdminBranches,
	listTafiAdminEmployeeContributions,
	listTafiAdminEmployees,
	updateTafiAdminEmployeeDailyRate,
	updateTafiAdminEmployeeIdentity,
	updateTafiAdminEmployeeProfile
} from '../../lib/supabase'
import { getAttendanceRemark, getLocalDateKey } from '../Branch_admin/branchAttendanceRecords'

const today = new Date()
const todayDateKey = [
	today.getFullYear(),
	String(today.getMonth() + 1).padStart(2, '0'),
	String(today.getDate()).padStart(2, '0')
].join('-')
const currentMonthKey = todayDateKey.slice(0, 7)

const attendanceStatusDetails = {
	present: { label: 'Present', className: 'p' },
	present_late: { label: 'Late', className: 'l' },
	absent: { label: 'Absent', className: 'a' },
	maternity_leave: { label: 'Leave', className: 'v' },
	paternity_leave: { label: 'Leave', className: 'v' },
	authorized_leave: { label: 'Leave', className: 'v' },
	birthday_leave: { label: 'Leave', className: 'v' },
	vl_with_pay: { label: 'Leave with Pay', className: 'v' },
	vl_without_pay: { label: 'Leave', className: 'v' },
	day_off: { label: 'Day off', className: 'o' },
	not_marked: { label: 'Not marked', className: '' }
}

const formatMonth = (monthKey) => {
	if (!monthKey) return ''
	return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
		.format(new Date(`${monthKey}-01T12:00:00`))
}

function formatDate(value) {
	if (!value) return 'Not provided'
	const date = new Date(`${value}T00:00:00Z`)
	if (Number.isNaN(date.getTime())) return 'Not provided'
	return new Intl.DateTimeFormat('en-PH', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(date)
}

function getAge(birthday) {
	if (!birthday) return 'Not provided'
	const birthDate = new Date(`${birthday}T00:00:00`)
	if (Number.isNaN(birthDate.getTime())) return 'Not provided'

	const today = new Date()
	let age = today.getFullYear() - birthDate.getFullYear()
	const birthdayHasPassed = today.getMonth() > birthDate.getMonth()
		|| (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
	if (!birthdayHasPassed) age -= 1
	return `${age} years`
}

function formatDailyRate(value) {
	if (value === null || value === undefined || value === '') return 'Not set'
	return new Intl.NumberFormat('en-PH', {
		style: 'currency',
		currency: 'PHP'
	}).format(Number(value))
}

function displayValue(value) {
	return value || 'Not provided'
}

function getEmployeeProfile(employee) {
	return {
		address: employee.address ?? '',
		gender: employee.gender ?? '',
		birthday: employee.birthday ?? '',
		email: employee.email ?? '',
		phone: employee.phone ?? '',
		hireDate: employee.hire_date ?? '',
		probationaryDate: employee.probationary_start_date ?? '',
		regularDate: employee.regular_start_date ?? '',
		tinNumber: employee.tin_number ?? '',
		sssNumber: employee.sss_number ?? '',
		pagibigNumber: employee.pagibig_number ?? '',
		philhealthNumber: employee.philhealth_number ?? '',
		employmentClassification: employee.employment_classification ?? ''
	}
}

export default function TafiEmployee({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [employees, setEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('all')
	const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
	const [searchTerm, setSearchTerm] = useState('')
	const [positionFilter, setPositionFilter] = useState('All positions')
	const [employeeSortOrder, setEmployeeSortOrder] = useState('asc')
	const [isLoading, setIsLoading] = useState(true)
	const [errorMessage, setErrorMessage] = useState('')
	const [isAddFormOpen, setIsAddFormOpen] = useState(false)
	const [isSavingEmployee, setIsSavingEmployee] = useState(false)
	const [newEmployeeBranchId, setNewEmployeeBranchId] = useState('')
	const [newEmployeeCode, setNewEmployeeCode] = useState('')
	const [newEmployeeName, setNewEmployeeName] = useState('')
	const [newEmployeePosition, setNewEmployeePosition] = useState('')
	const [employeeFormError, setEmployeeFormError] = useState('')
	const [profileForm, setProfileForm] = useState(null)
	const [isEditingProfile, setIsEditingProfile] = useState(false)
	const [isSavingProfile, setIsSavingProfile] = useState(false)
	const [profileError, setProfileError] = useState('')
	const [profileMessage, setProfileMessage] = useState('')
	const [identityForm, setIdentityForm] = useState(null)
	const [isEditingIdentity, setIsEditingIdentity] = useState(false)
	const [isSavingIdentity, setIsSavingIdentity] = useState(false)
	const [identityError, setIdentityError] = useState('')
	const [identityMessage, setIdentityMessage] = useState('')
	const [dailyRateInput, setDailyRateInput] = useState('')
	const [isEditingDailyRate, setIsEditingDailyRate] = useState(false)
	const [isSavingDailyRate, setIsSavingDailyRate] = useState(false)
	const [dailyRateError, setDailyRateError] = useState('')
	const [dailyRateMessage, setDailyRateMessage] = useState('')
	const [attendanceMonth, setAttendanceMonth] = useState(currentMonthKey)
	const [attendanceHistoryState, setAttendanceHistoryState] = useState(null)
	const [employeeContributionState, setEmployeeContributionState] = useState(null)

	useEffect(() => {
		let isCurrent = true

		const loadEmployees = async () => {
			setIsLoading(true)
			setErrorMessage('')
			const [branchesResult, employeesResult] = await Promise.all([
				listTafiAdminBranches(sessionToken),
				listTafiAdminEmployees(sessionToken)
			])

			if (!isCurrent) return
			if (branchesResult.error || employeesResult.error) {
				setErrorMessage(
					[branchesResult.error?.message, employeesResult.error?.message]
						.filter(Boolean)
						.join(' ')
				)
				setIsLoading(false)
				return
			}

			setBranches(branchesResult.data ?? [])
			setEmployees(employeesResult.data ?? [])
			setIsLoading(false)
		}

		loadEmployees()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const filteredEmployees = useMemo(
		() => selectedBranchId === 'all'
			? employees
			: employees.filter((employee) => employee.branch_id === selectedBranchId),
		[employees, selectedBranchId]
	)
	const positions = useMemo(
		() => [...new Set(filteredEmployees.map((employee) => employee.employee_position).filter(Boolean))]
			.sort((first, second) => first.localeCompare(second)),
		[filteredEmployees]
	)
	const employeeResults = useMemo(() => {
		const normalizedSearch = searchTerm.trim().toLowerCase()

		return filteredEmployees.filter((employee) => {
			const matchesSearch = `${employee.employee_name} ${employee.employee_code}`
				.toLowerCase()
				.includes(normalizedSearch)
			const matchesPosition = positionFilter === 'All positions'
				|| employee.employee_position === positionFilter
			return matchesSearch && matchesPosition
		}).sort((first, second) => {
			const nameOrder = first.employee_name.localeCompare(
				second.employee_name,
				undefined,
				{ sensitivity: 'base' }
			)
			const order = employeeSortOrder === 'asc' ? 1 : -1
			return nameOrder === 0
				? first.employee_code.localeCompare(second.employee_code, undefined, { numeric: true }) * order
				: nameOrder * order
		})
	}, [filteredEmployees, searchTerm, positionFilter, employeeSortOrder])
	const selectedEmployee = filteredEmployees.find((employee) => employee.employee_id === selectedEmployeeId)
	const selectedEmployeeBranchId = selectedEmployee?.branch_id
	const selectedEmployeeCode = selectedEmployee?.employee_code

	useEffect(() => {
		let isCurrent = true

		const loadAttendanceHistory = async () => {
			if (!sessionToken || !selectedEmployee) return
			const [year, month] = attendanceMonth.split('-').map(Number)
			const startDate = `${attendanceMonth}-01`
			const endDate = getLocalDateKey(new Date(year, month, 0))
			const { data, error } = await listTafiAdminAttendance(
				sessionToken,
				selectedEmployee.branch_id,
				startDate,
				endDate
			)
			if (!isCurrent) return
			setAttendanceHistoryState({
				sessionToken,
				employeeId: selectedEmployee.employee_id,
				month: attendanceMonth,
				records: data ?? [],
				error: error?.message ?? ''
			})
		}

		loadAttendanceHistory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedEmployee, attendanceMonth])

	const hasCurrentAttendanceHistory = attendanceHistoryState?.sessionToken === sessionToken
		&& attendanceHistoryState?.employeeId === selectedEmployeeId
		&& attendanceHistoryState?.month === attendanceMonth
	const attendanceHistory = hasCurrentAttendanceHistory ? attendanceHistoryState.records : []
	const isLoadingAttendanceHistory = Boolean(selectedEmployee && !hasCurrentAttendanceHistory)
	const attendanceHistoryError = !sessionToken
		? 'Your login session is missing.'
		: hasCurrentAttendanceHistory ? attendanceHistoryState.error : ''

	useEffect(() => {
		let isCurrent = true

		const loadEmployeeContribution = async () => {
			if (!sessionToken || !selectedEmployeeId || !selectedEmployeeBranchId || !selectedEmployeeCode) return
			setEmployeeContributionState({
				sessionToken,
				employeeId: selectedEmployeeId,
				status: 'loading',
				contribution: null,
				error: ''
			})

			const { data, error } = await listTafiAdminEmployeeContributions(
				sessionToken,
				selectedEmployeeBranchId
			)
			if (!isCurrent) return

			if (error) {
				setEmployeeContributionState({
					sessionToken,
					employeeId: selectedEmployeeId,
					status: 'error',
					contribution: null,
					error: error.message
				})
				return
			}

			const contribution = (data ?? []).find(
				(record) => record.employee_code === selectedEmployeeCode
			) ?? null
			setEmployeeContributionState({
				sessionToken,
				employeeId: selectedEmployeeId,
				status: 'ready',
				contribution,
				error: ''
			})
		}

		loadEmployeeContribution()
		return () => {
			isCurrent = false
		}
	}, [
		sessionToken,
		selectedEmployeeId,
		selectedEmployeeBranchId,
		selectedEmployeeCode
	])

	const hasCurrentEmployeeContribution = employeeContributionState?.sessionToken === sessionToken
		&& employeeContributionState?.employeeId === selectedEmployeeId
	const employeeContribution = hasCurrentEmployeeContribution
		? employeeContributionState.contribution
		: null
	const isLoadingEmployeeContribution = Boolean(selectedEmployee && !hasCurrentEmployeeContribution)
		|| employeeContributionState?.status === 'loading'
	const employeeContributionError = hasCurrentEmployeeContribution
		&& employeeContributionState.status === 'error'
		? employeeContributionState.error
		: ''

	const selectBranch = (branchId) => {
		setSelectedBranchId(branchId)
		setSelectedEmployeeId(null)
		setSearchTerm('')
		setPositionFilter('All positions')
		setIsEditingDailyRate(false)
		setDailyRateError('')
		setDailyRateMessage('')
	}

	const addEmployee = async (event) => {
		event.preventDefault()
		setEmployeeFormError('')
		setIsSavingEmployee(true)

		const { error } = await createTafiAdminEmployee(sessionToken, {
			branchId: newEmployeeBranchId,
			employeeCode: newEmployeeCode.trim(),
			name: newEmployeeName.trim(),
			position: newEmployeePosition.trim()
		})
		if (error) {
			setEmployeeFormError(error.message)
			setIsSavingEmployee(false)
			return
		}

		const { data, error: refreshError } = await listTafiAdminEmployees(sessionToken)
		setIsSavingEmployee(false)
		if (refreshError) {
			setIsAddFormOpen(false)
			setErrorMessage(`Employee was added, but the list could not be refreshed: ${refreshError.message}`)
			return
		}

		setEmployees(data ?? [])
		setSelectedBranchId(newEmployeeBranchId)
		setSearchTerm('')
		setPositionFilter('All positions')
		setSelectedEmployeeId(null)
		setNewEmployeeBranchId('')
		setNewEmployeeCode('')
		setNewEmployeeName('')
		setNewEmployeePosition('')
		setIsAddFormOpen(false)
	}

	const updateProfileField = (field, value) => {
		setProfileForm((current) => ({ ...current, [field]: value }))
		setProfileError('')
		setProfileMessage('')
	}

	const saveEmployeeIdentity = async (event) => {
		event.preventDefault()
		if (!identityForm || !selectedEmployee) return

		const employeeCode = identityForm.employeeCode.trim()
		const name = identityForm.name.trim()
		const position = identityForm.position.trim()
		if (!employeeCode || !name || !position) {
			setIdentityError('Employee ID, name, and position are required.')
			return
		}

		setIsSavingIdentity(true)
		setIdentityError('')
		setIdentityMessage('')
		const { error } = await updateTafiAdminEmployeeIdentity(
			sessionToken,
			selectedEmployee.employee_id,
			{ employeeCode, name, position }
		)
		setIsSavingIdentity(false)
		if (error) {
			setIdentityError(error.message)
			return
		}

		setEmployees((current) => current.map((employee) =>
			employee.employee_id === selectedEmployee.employee_id
				? {
					...employee,
					employee_code: employeeCode,
					employee_name: name,
					employee_position: position
				}
				: employee
		))
		setIdentityForm({ employeeCode, name, position })
		setIsEditingIdentity(false)
		setIdentityMessage('Employee information updated.')
	}

	const saveEmployeeProfile = async (event) => {
		event.preventDefault()
		if (!profileForm || !selectedEmployee) return
		if (profileForm.birthday && profileForm.birthday > todayDateKey) {
			setProfileError('Birthday cannot be in the future.')
			return
		}
		if (profileForm.hireDate && profileForm.hireDate > todayDateKey) {
			setProfileError('Date hired cannot be in the future.')
			return
		}
		if (profileForm.probationaryDate && profileForm.probationaryDate > todayDateKey) {
			setProfileError('Probationary start date cannot be in the future.')
			return
		}
		if (profileForm.regularDate && profileForm.regularDate > todayDateKey) {
			setProfileError('Regular start date cannot be in the future.')
			return
		}
		if (profileForm.hireDate && profileForm.probationaryDate
			&& profileForm.probationaryDate < profileForm.hireDate) {
			setProfileError('Probationary start date cannot be before the trainee hire date.')
			return
		}
		const previousStageDate = profileForm.probationaryDate || profileForm.hireDate
		if (previousStageDate && profileForm.regularDate
			&& profileForm.regularDate < previousStageDate) {
			setProfileError('Regular start date cannot be before the probationary or hire date.')
			return
		}

		setIsSavingProfile(true)
		setProfileError('')
		setProfileMessage('')
		const { error } = await updateTafiAdminEmployeeProfile(
			sessionToken,
			selectedEmployee.employee_id,
			profileForm
		)
		setIsSavingProfile(false)
		if (error) {
			setProfileError(error.message)
			return
		}

		const normalizedProfile = {
			address: profileForm.address.trim() || null,
			gender: profileForm.gender || null,
			birthday: profileForm.birthday || null,
			email: profileForm.email.trim() || null,
			phone: profileForm.phone.trim() || null,
			hire_date: profileForm.hireDate || null,
			probationary_start_date: profileForm.probationaryDate || null,
			regular_start_date: profileForm.regularDate || null,
			tin_number: profileForm.tinNumber.trim() || null,
			sss_number: profileForm.sssNumber.trim() || null,
			pagibig_number: profileForm.pagibigNumber.trim() || null,
			philhealth_number: profileForm.philhealthNumber.trim() || null,
			employment_classification: profileForm.employmentClassification
		}
		setEmployees((current) => current.map((employee) =>
			employee.employee_id === selectedEmployee.employee_id
				? { ...employee, ...normalizedProfile }
				: employee
		))
		setIsEditingProfile(false)
		setProfileMessage('Employee profile saved.')
	}

	const saveEmployeeDailyRate = async (event) => {
		event.preventDefault()
		if (!selectedEmployee) return

		const dailyRate = Number(dailyRateInput)
		if (!dailyRateInput.trim() || !Number.isFinite(dailyRate) || dailyRate < 0) {
			setDailyRateError('Enter a valid daily rate of zero or more.')
			return
		}

		setIsSavingDailyRate(true)
		setDailyRateError('')
		setDailyRateMessage('')
		const { error } = await updateTafiAdminEmployeeDailyRate(
			sessionToken,
			selectedEmployee.employee_id,
			dailyRate
		)
		setIsSavingDailyRate(false)
		if (error) {
			setDailyRateError(error.message)
			return
		}

		setEmployees((current) => current.map((employee) =>
			employee.employee_id === selectedEmployee.employee_id
				? { ...employee, daily_rate: dailyRate }
				: employee
		))
		setIsEditingDailyRate(false)
		setDailyRateMessage('Daily rate updated.')
	}

	const [attendanceYear, attendanceMonthNumber] = attendanceMonth.split('-').map(Number)
	const attendanceDaysInMonth = new Date(attendanceYear, attendanceMonthNumber, 0).getDate()
	const firstWeekday = new Date(attendanceYear, attendanceMonthNumber - 1, 1).getDay()
	const recordsByDate = new Map(
		attendanceHistory
			.filter((record) =>
				record.employee_code === selectedEmployee?.employee_code
				&& record.attendance_date?.startsWith(`${attendanceMonth}-`)
			)
			.map((record) => [record.attendance_date, record])
	)
	const monthlyStatuses = [...recordsByDate.values()].map((record) => record.status)
	const monthlyAttendance = {
		present: monthlyStatuses.filter((status) => status === 'present' || status === 'present_late').length,
		late: monthlyStatuses.filter((status) => status === 'present_late').length,
		absent: monthlyStatuses.filter((status) => status === 'absent').length,
		leave: monthlyStatuses.filter((status) => attendanceStatusDetails[status]?.className === 'v').length
	}
	const attendanceRate = Math.round((monthlyAttendance.present / attendanceDaysInMonth) * 100)
	const attendanceRemark = getAttendanceRemark(attendanceRate)

	return (
		<div className="tafi-employee-view">
			<section className="tafi-branch-panel" aria-labelledby="tafi-branch-heading">
				<div className="tafi-employee-section-heading">
					<h2 id="tafi-branch-heading">Branches</h2>
					<p>Select a branch to view its employees.</p>
				</div>
				<div className="tafi-branch-list">
					<button
						type="button"
						className={`tafi-branch-option${selectedBranchId === 'all' ? ' active' : ''}`}
						aria-pressed={selectedBranchId === 'all'}
						onClick={() => selectBranch('all')}
					>
						<span>All branches</span>
						<span className="tafi-branch-count">{employees.length}</span>
					</button>
					{branches.map((branch) => {
						const branchEmployeeCount = employees.filter((employee) => employee.branch_id === branch.branch_id).length
						return (
							<button
								key={branch.branch_id}
								type="button"
								className={`tafi-branch-option${selectedBranchId === branch.branch_id ? ' active' : ''}`}
								aria-pressed={selectedBranchId === branch.branch_id}
								onClick={() => selectBranch(branch.branch_id)}
							>
								<span>{branch.branch_name}</span>
								<span className="tafi-branch-count">{branchEmployeeCount}</span>
							</button>
						)
					})}
				</div>
			</section>

			<section className="tafi-employee-results" aria-labelledby="tafi-employee-heading">
				{selectedEmployee ? (
					<article className="employee-info-shell">
						<header className="employee-profile-header">
							<button type="button" className="employee-back-button" onClick={() => {
								setSelectedEmployeeId(null)
								setIsEditingProfile(false)
								setIsEditingIdentity(false)
								setIsEditingDailyRate(false)
								setDailyRateError('')
								setDailyRateMessage('')
							}}>
								Back to employees
							</button>
							<div className="employee-profile-identity">
								<span className="employee-profile-avatar">
									{selectedEmployee.employee_name?.charAt(0) || '?'}
								</span>
								<div>
									<p className="employee-info-eyebrow">Employee profile</p>
									<h3>{selectedEmployee.employee_name}</h3>
									<p>
										{selectedEmployee.employee_code}
										<span aria-hidden="true"> · </span>
										{selectedEmployee.employee_position}
									</p>
								</div>
							</div>
							<span className={`tafi-employee-status ${selectedEmployee.employment_status}`}>
								{selectedEmployee.employment_status}
							</span>
						</header>

						<section className="employee-detail-panel employee-personal-details">
							<div className="employee-detail-panel-heading employee-personal-heading">
								<div>
									<h4>Employee identification</h4>
									<p>Update the employee name, ID, or position.</p>
								</div>
								{!isEditingIdentity && (
									<button
										type="button"
										className="add-employee-button"
										onClick={() => {
											setIdentityForm({
												employeeCode: selectedEmployee.employee_code,
												name: selectedEmployee.employee_name,
												position: selectedEmployee.employee_position
											})
											setIdentityError('')
											setIdentityMessage('')
											setIsEditingIdentity(true)
										}}
									>
										Edit employee information
									</button>
								)}
							</div>
							{isEditingIdentity ? (
								<form className="employee-personal-form" onSubmit={saveEmployeeIdentity}>
									<label>
										<span>Employee ID</span>
										<input
											required
											value={identityForm.employeeCode}
											onChange={(event) => setIdentityForm((current) => ({
												...current,
												employeeCode: event.target.value
											}))}
											autoComplete="off"
										/>
									</label>
									<label>
										<span>Employee name</span>
										<input
											required
											value={identityForm.name}
											onChange={(event) => setIdentityForm((current) => ({
												...current,
												name: event.target.value
											}))}
										/>
									</label>
									<label>
										<span>Position</span>
										<input
											required
											value={identityForm.position}
											onChange={(event) => setIdentityForm((current) => ({
												...current,
												position: event.target.value
											}))}
										/>
									</label>
									<div className="employee-personal-actions">
										{identityError && <p className="add-employee-error" role="alert">{identityError}</p>}
										<button
											type="button"
											className="employee-profile-cancel"
											disabled={isSavingIdentity}
											onClick={() => {
												setIdentityForm(null)
												setIdentityError('')
												setIsEditingIdentity(false)
											}}
										>
											Cancel
										</button>
										<button type="submit" className="add-employee-submit" disabled={isSavingIdentity}>
											{isSavingIdentity ? 'Saving…' : 'Save employee information'}
										</button>
									</div>
								</form>
							) : (
								<>
									<dl className="employee-profile-fields">
										<div className="employee-profile-field">
											<dt>Employee ID</dt>
											<dd>{selectedEmployee.employee_code}</dd>
										</div>
										<div className="employee-profile-field">
											<dt>Name</dt>
											<dd>{selectedEmployee.employee_name}</dd>
										</div>
										<div className="employee-profile-field">
											<dt>Position</dt>
											<dd>{selectedEmployee.employee_position}</dd>
										</div>
									</dl>
									{identityMessage && <p className="employee-personal-saved" role="status">{identityMessage}</p>}
								</>
							)}
						</section>

						<div className="employee-detail-summary">
							<div className="employee-detail-stat">
								<span>Branch</span>
								<strong>{selectedEmployee.branch_name}</strong>
							</div>
							<div className="employee-detail-stat">
								<span>Daily rate</span>
								<strong>{formatDailyRate(selectedEmployee.daily_rate)}</strong>
							</div>
							<div className="employee-detail-stat">
								<span>Employment type</span>
								<strong>{displayValue(selectedEmployee.employment_classification)}</strong>
							</div>
							<div className="employee-detail-stat">
								<span>Employee status</span>
								<strong>{selectedEmployee.employment_status}</strong>
							</div>
						</div>

						<section className="employee-detail-panel employee-personal-details">
							<div className="employee-detail-panel-heading employee-personal-heading">
								<div>
									<h4>Personal and employment information</h4>
									<p>Personal details, identity, and government contribution information.</p>
								</div>
								{!isEditingProfile && (
									<button
										type="button"
										className="add-employee-button"
										onClick={() => {
											setProfileForm(getEmployeeProfile(selectedEmployee))
											setProfileError('')
											setProfileMessage('')
											setIsEditingProfile(true)
										}}
									>
										Edit information
									</button>
								)}
							</div>

							{isEditingProfile ? (
								<form className="employee-personal-form" onSubmit={saveEmployeeProfile}>
									<label className="employee-personal-address">
										<span>Address</span>
										<textarea
											rows="2"
											value={profileForm.address}
											onChange={(event) => updateProfileField('address', event.target.value)}
										/>
									</label>
									<label>
										<span>Gender</span>
										<select
											value={profileForm.gender}
											onChange={(event) => updateProfileField('gender', event.target.value)}
										>
											<option value="">Not specified</option>
											<option value="Female">Female</option>
											<option value="Male">Male</option>
											<option value="Other">Other</option>
											<option value="Prefer not to say">Prefer not to say</option>
										</select>
									</label>
									<label>
										<span>Birthday</span>
										<input
											type="date"
											max={todayDateKey}
											value={profileForm.birthday}
											onChange={(event) => updateProfileField('birthday', event.target.value)}
										/>
									</label>
									<div className="employee-personal-value">
										<span>Age</span>
										<strong>{getAge(profileForm.birthday)}</strong>
									</div>
									<label>
										<span>Email</span>
										<input
											type="email"
											value={profileForm.email}
											onChange={(event) => updateProfileField('email', event.target.value)}
										/>
									</label>
									<label>
										<span>Phone</span>
										<input
											type="tel"
											value={profileForm.phone}
											onChange={(event) => updateProfileField('phone', event.target.value)}
										/>
									</label>
									<label>
										<span>TIN</span>
										<input
											value={profileForm.tinNumber}
											onChange={(event) => updateProfileField('tinNumber', event.target.value)}
											autoComplete="off"
										/>
									</label>
									<label>
										<span>SSS number</span>
										<input
											value={profileForm.sssNumber}
											onChange={(event) => updateProfileField('sssNumber', event.target.value)}
											autoComplete="off"
										/>
									</label>
									<label>
										<span>Pag-IBIG number</span>
										<input
											value={profileForm.pagibigNumber}
											onChange={(event) => updateProfileField('pagibigNumber', event.target.value)}
											autoComplete="off"
										/>
									</label>
									<label>
										<span>PhilHealth number</span>
										<input
											value={profileForm.philhealthNumber}
											onChange={(event) => updateProfileField('philhealthNumber', event.target.value)}
											autoComplete="off"
										/>
									</label>
									<label>
										<span>Employment status</span>
										<select
											value={profileForm.employmentClassification}
											onChange={(event) => updateProfileField('employmentClassification', event.target.value)}
											required
										>
											<option value="">Select employment status</option>
											<option value="Regular">Regular</option>
											<option value="Probationary">Probationary</option>
											<option value="Trainee">Trainee</option>
										</select>
									</label>
									<div className="employee-employment-history-form">
										<div>
											<h5>Employment record</h5>
											<p>Enter the effective date for each employment stage.</p>
										</div>
										<label>
											<span>Trainee / date hired</span>
											<input
												type="date"
												max={todayDateKey}
												value={profileForm.hireDate}
												onChange={(event) => updateProfileField('hireDate', event.target.value)}
											/>
										</label>
										<label>
											<span>Probationary start date</span>
											<input
												type="date"
												max={todayDateKey}
												min={profileForm.hireDate || undefined}
												value={profileForm.probationaryDate}
												onChange={(event) => updateProfileField('probationaryDate', event.target.value)}
											/>
										</label>
										<label>
											<span>Regular start date</span>
											<input
												type="date"
												max={todayDateKey}
												min={profileForm.probationaryDate || profileForm.hireDate || undefined}
												value={profileForm.regularDate}
												onChange={(event) => updateProfileField('regularDate', event.target.value)}
											/>
										</label>
									</div>
									<div className="employee-personal-actions">
										{profileError && <p className="add-employee-error" role="alert">{profileError}</p>}
										<button
											type="button"
											className="employee-profile-cancel"
											disabled={isSavingProfile}
											onClick={() => {
												setProfileForm(getEmployeeProfile(selectedEmployee))
												setProfileError('')
												setIsEditingProfile(false)
											}}
										>
											Cancel
										</button>
										<button type="submit" className="add-employee-submit" disabled={isSavingProfile}>
											{isSavingProfile ? 'Saving…' : 'Save employee information'}
										</button>
									</div>
								</form>
							) : (
								<>
							<dl className="employee-profile-fields">
								<div className="employee-profile-field employee-profile-address">
									<dt>Address</dt>
									<dd>{displayValue(selectedEmployee.address)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>Gender</dt>
									<dd>{displayValue(selectedEmployee.gender)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>Birthday</dt>
									<dd>{formatDate(selectedEmployee.birthday)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>Age</dt>
									<dd>{getAge(selectedEmployee.birthday)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>Email</dt>
									<dd>{displayValue(selectedEmployee.email)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>Phone</dt>
									<dd>{displayValue(selectedEmployee.phone)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>TIN</dt>
									<dd>{displayValue(selectedEmployee.tin_number)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>SSS number</dt>
									<dd>{displayValue(selectedEmployee.sss_number)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>Pag-IBIG number</dt>
									<dd>{displayValue(selectedEmployee.pagibig_number)}</dd>
								</div>
								<div className="employee-profile-field">
									<dt>PhilHealth number</dt>
									<dd>{displayValue(selectedEmployee.philhealth_number)}</dd>
								</div>
							</dl>

							<div className="employee-employment-history">
								<h5>Employment record</h5>
								<div>
									<div>
										<span>Trainee / date hired</span>
										<strong>{formatDate(selectedEmployee.hire_date)}</strong>
									</div>
									<div>
										<span>Probationary</span>
										<strong>{formatDate(selectedEmployee.probationary_start_date)}</strong>
									</div>
									<div>
										<span>Regular</span>
										<strong>{formatDate(selectedEmployee.regular_start_date)}</strong>
									</div>
								</div>
							</div>
							{profileMessage && <p className="employee-personal-saved" role="status">{profileMessage}</p>}
								</>
							)}
						</section>

						<section className="employee-detail-panel employee-personal-details employee-payroll-panel">
							<div className="employee-detail-panel-heading">
								<div>
									<h4>Payroll details</h4>
									<p>Set the daily rate used for payroll estimates.</p>
								</div>
								{!isEditingDailyRate && (
									<button
										type="button"
										className="add-employee-button"
										onClick={() => {
											setDailyRateInput(selectedEmployee.daily_rate == null
												? ''
												: String(selectedEmployee.daily_rate))
											setDailyRateError('')
											setDailyRateMessage('')
											setIsEditingDailyRate(true)
										}}
									>
										Edit daily rate
									</button>
								)}
							</div>
							{isEditingDailyRate ? (
								<form className="daily-rate-form" onSubmit={saveEmployeeDailyRate}>
									<label htmlFor="tafi-employee-daily-rate">Daily rate</label>
									<div className="daily-rate-input-row">
										<span>₱</span>
										<input
											id="tafi-employee-daily-rate"
											type="number"
											min="0"
											step="0.01"
											required
											value={dailyRateInput}
											onChange={(event) => setDailyRateInput(event.target.value)}
											placeholder="0.00"
										/>
										<button type="submit" className="add-employee-submit" disabled={isSavingDailyRate}>
											{isSavingDailyRate ? 'Saving…' : 'Save rate'}
										</button>
										<button
											type="button"
											className="employee-profile-cancel"
											disabled={isSavingDailyRate}
											onClick={() => {
												setDailyRateInput(String(selectedEmployee.daily_rate ?? ''))
												setDailyRateError('')
												setIsEditingDailyRate(false)
											}}
										>
											Cancel
										</button>
									</div>
									{dailyRateError && <p className="add-employee-error" role="alert">{dailyRateError}</p>}
								</form>
							) : (
								<div className="employee-payroll-estimate">
									<span>Current daily rate</span>
									<strong>{formatDailyRate(selectedEmployee.daily_rate)}</strong>
								</div>
							)}
							{dailyRateMessage && <p className="employee-personal-saved" role="status">{dailyRateMessage}</p>}
						</section>

						<section className="employee-detail-panel employee-personal-details">
							<div className="employee-detail-panel-heading">
								<div>
									<h4>Weekly contributions</h4>
									<p>Mandatory contributions saved for this employee.</p>
								</div>
							</div>
							{isLoadingEmployeeContribution ? (
								<p className="employee-detail-empty" role="status">Loading weekly contributions…</p>
							) : employeeContributionError ? (
								<p className="employee-detail-empty error" role="alert">
									Could not load weekly contributions: {employeeContributionError}
								</p>
							) : employeeContribution ? (
								<dl className="employee-profile-fields">
									<div className="employee-profile-field">
										<dt>SSS / week</dt>
										<dd>{formatDailyRate(employeeContribution.sss)}</dd>
									</div>
									<div className="employee-profile-field">
										<dt>PhilHealth / week</dt>
										<dd>{formatDailyRate(employeeContribution.philhealth)}</dd>
									</div>
									<div className="employee-profile-field">
										<dt>Pag-IBIG / week</dt>
										<dd>{formatDailyRate(employeeContribution.pagibig)}</dd>
									</div>
								</dl>
							) : (
								<p className="employee-detail-empty">
									No weekly contributions have been saved for this employee.
								</p>
							)}
						</section>

						<section className="employee-detail-panel tafi-employee-attendance-record">
							<div className="employee-detail-panel-heading">
								<div>
									<h4>Attendance record</h4>
									<p>{formatMonth(attendanceMonth)} · Monthly day-by-day record</p>
								</div>
								<label className="employee-attendance-month-filter">
									<span>Month</span>
									<input
										type="month"
										value={attendanceMonth}
										onChange={(event) => setAttendanceMonth(event.target.value || currentMonthKey)}
									/>
								</label>
							</div>
							<div className="employee-attendance-legend">
								<span><i className="present" /> Present</span>
								<span><i className="late" /> Present (Late)</span>
								<span><i className="absent" /> Absent</span>
								<span><i className="leave" /> Leave</span>
								<span><i className="day-off" /> Day off</span>
							</div>
							{isLoadingAttendanceHistory ? (
								<p className="employee-detail-empty" role="status">Loading attendance records…</p>
							) : attendanceHistoryError ? (
								<p className="employee-detail-empty error" role="alert">
									Could not load attendance records: {attendanceHistoryError}
								</p>
							) : (
								<>
									<div className="employee-attendance-summary">
										<span>Total present <strong>{monthlyAttendance.present}</strong></span>
										<span>Late <strong>{monthlyAttendance.late}</strong></span>
										<span>Absent <strong>{monthlyAttendance.absent}</strong></span>
										<span>Leave <strong>{monthlyAttendance.leave}</strong></span>
										<span>Attendance rate <strong>{attendanceRate}%</strong></span>
										<span>Remarks <strong>{attendanceRemark}</strong></span>
									</div>
									{recordsByDate.size === 0 ? (
										<p className="employee-detail-empty">No attendance records for {formatMonth(attendanceMonth)}.</p>
									) : (
										<div className="employee-attendance-calendar" aria-label={`${formatMonth(attendanceMonth)} attendance calendar`}>
											{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
												<span className="employee-attendance-weekday" key={day}>{day}</span>
											))}
											{Array.from({ length: firstWeekday }, (_, index) => (
												<span className="employee-attendance-calendar-spacer" key={`spacer-${index}`} />
											))}
											{Array.from({ length: attendanceDaysInMonth }, (_, index) => {
												const day = index + 1
												const dateKey = `${attendanceMonth}-${String(day).padStart(2, '0')}`
												const record = recordsByDate.get(dateKey)
												const status = record?.status
												const statusDetail = attendanceStatusDetails[status] ?? null
												const className = statusDetail?.className
													? ` ${statusDetail.className}`
													: status ? '' : ' no-record'
												const lateMinutes = status === 'present_late'
													? Number(record.late_minutes) || 0
													: null

												return (
													<div
														className={`employee-attendance-day${className}`}
														key={dateKey}
														title={`${dateKey}: ${statusDetail?.label ?? (status ? 'Not marked' : 'No record')}${lateMinutes === null ? '' : `, ${lateMinutes} minutes late`}`}
													>
														<strong>{day}</strong>
														<span>{lateMinutes === null
															? statusDetail?.label ?? (status ? 'Not marked' : '—')
															: `${lateMinutes} min late`}</span>
													</div>
												)
											})}
										</div>
									)}
								</>
							)}
						</section>
					</article>
				) : (
					<>
						<div className="tafi-employee-section-heading">
							<div>
								<h2 id="tafi-employee-heading">
									{selectedBranch?.branch_name ?? 'Employees'}
								</h2>
								<p>
									{isLoading
										? 'Loading employees...'
										: `${employeeResults.length} employee${employeeResults.length === 1 ? '' : 's'}`}
								</p>
							</div>
							<button
								type="button"
								className="add-employee-button"
								disabled={isLoading || !branches.length || isSavingEmployee}
								onClick={() => {
									setEmployeeFormError('')
									setNewEmployeeBranchId(selectedBranchId === 'all' ? '' : selectedBranchId)
									setIsAddFormOpen((isOpen) => !isOpen)
								}}
							>
								{isSavingEmployee ? 'Saving…' : isAddFormOpen ? 'Cancel' : 'Add employee'}
							</button>
						</div>

						<div className="employee-directory-tools tafi-employee-directory-tools">
							<label className="employee-search-label">
								<span>Search employees</span>
								<input
									type="search"
									placeholder="Name or employee ID"
									value={searchTerm}
									onChange={(event) => setSearchTerm(event.target.value)}
								/>
							</label>
							<label className="employee-filter-label">
								<span>Position</span>
								<select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
									<option>All positions</option>
									{positions.map((position) => <option key={position}>{position}</option>)}
								</select>
							</label>
							<label className="employee-filter-label">
								<span>Sort by name</span>
								<select
									value={employeeSortOrder}
									onChange={(event) => setEmployeeSortOrder(event.target.value)}
								>
									<option value="asc">Ascending (A–Z)</option>
									<option value="desc">Descending (Z–A)</option>
								</select>
							</label>
						</div>

						{errorMessage && <p className="tafi-employee-error" role="alert">{errorMessage}</p>}
						{isAddFormOpen && (
							<form className="add-employee-form tafi-employee-create-form" onSubmit={addEmployee}>
								<label>
									<span>Employee ID</span>
									<input
										required
										value={newEmployeeCode}
										onChange={(event) => setNewEmployeeCode(event.target.value)}
										placeholder="Enter employee ID"
									/>
								</label>
								<label>
									<span>Full name</span>
									<input
										required
										value={newEmployeeName}
										onChange={(event) => setNewEmployeeName(event.target.value)}
										placeholder="Enter employee name"
									/>
								</label>
								<label>
									<span>Position</span>
									<input
										required
										value={newEmployeePosition}
										onChange={(event) => setNewEmployeePosition(event.target.value)}
										placeholder="Enter job position"
									/>
								</label>
								<label>
									<span>Branch</span>
									<select
										required
										value={newEmployeeBranchId}
										onChange={(event) => setNewEmployeeBranchId(event.target.value)}
									>
										<option value="">Select a branch</option>
										{branches.map((branch) => (
											<option key={branch.branch_id} value={branch.branch_id}>
												{branch.branch_name}
											</option>
										))}
									</select>
								</label>
								<button type="submit" className="add-employee-submit" disabled={isSavingEmployee}>
									{isSavingEmployee ? 'Saving…' : 'Save employee'}
								</button>
								{employeeFormError && <p className="add-employee-error" role="alert">{employeeFormError}</p>}
							</form>
						)}
						{!isLoading && !errorMessage && (
							employeeResults.length ? (
								<div className="tafi-employee-table-wrap">
									<table className="tafi-employee-table">
										<thead>
											<tr>
												<th>Name</th>
												<th>Employee ID</th>
												<th>Position</th>
												<th>Status</th>
												{selectedBranchId === 'all' && <th>Branch</th>}
											</tr>
										</thead>
										<tbody>
											{employeeResults.map((employee) => (
												<tr key={employee.employee_id}>
													<td>
														<button
															type="button"
															className="tafi-employee-name-button"
															onClick={() => {
																setSelectedEmployeeId(employee.employee_id)
																setProfileForm(getEmployeeProfile(employee))
																setIsEditingProfile(false)
																setProfileError('')
																setProfileMessage('')
																setIsEditingIdentity(false)
																setIdentityError('')
																setIdentityMessage('')
																setIsEditingDailyRate(false)
																setDailyRateError('')
																setDailyRateMessage('')
															}}
														>
															{employee.employee_name}
														</button>
													</td>
													<td>{employee.employee_code}</td>
													<td>{employee.employee_position}</td>
													<td>{employee.employment_status}</td>
													{selectedBranchId === 'all' && <td>{employee.branch_name}</td>}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : (
								<p className="tafi-employee-empty">
									{filteredEmployees.length
										? 'No employees match your search or position filter.'
										: branches.length
											? 'There are no employees for this branch.'
											: 'No branches have been created yet.'}
								</p>
							)
						)}
					</>
				)}
			</section>
		</div>
	)
}
