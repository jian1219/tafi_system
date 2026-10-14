import { useEffect, useMemo, useState } from 'react'
import { getBranchAdminEmployeePhoto, listBranchAttendanceHistory } from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getAttendanceRemark, getLocalDateKey, hasEarnedMonthlyCredit } from './branchAttendanceRecords'

const currentDate = new Date()
const todayDateKey = getLocalDateKey(currentDate)
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

const formatCurrency = (amount) => amount.toLocaleString('en-PH', {
	style: 'currency',
	currency: 'PHP',
	minimumFractionDigits: 2
})

const getAge = (birthday) => {
	if (!birthday) return '—'
	const birthDate = new Date(`${birthday}T00:00:00`)
	let age = currentDate.getFullYear() - birthDate.getFullYear()
	const birthdayHasPassed = currentDate.getMonth() > birthDate.getMonth()
		|| (currentDate.getMonth() === birthDate.getMonth() && currentDate.getDate() >= birthDate.getDate())
	if (!birthdayHasPassed) age -= 1
	return age
}

const getEmployeeProfile = (employee) => ({
	address: employee.address,
	gender: employee.gender,
	birthday: employee.birthday,
	hireDate: employee.hireDate ?? '',
	probationaryDate: employee.probationaryDate ?? '',
	regularDate: employee.regularDate ?? '',
	tinNumber: employee.tinNumber,
	sssNumber: employee.sssNumber,
	pagibigNumber: employee.pagibigNumber,
	philhealthNumber: employee.philhealthNumber,
	employmentClassification: employee.employmentClassification
})

const formatBirthday = (birthday) => {
	if (!birthday) return 'Not provided'
	return new Intl.DateTimeFormat('en-PH', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	}).format(new Date(`${birthday}T00:00:00`))
}

const calculateEarnedCredit = (employeeId, attendanceHistory) => {
	const presentDatesByMonth = new Map()

	attendanceHistory.forEach((record) => {
		if (
			record.employee_code !== employeeId
			|| !['present', 'present_late'].includes(record.status)
			|| typeof record.attendance_date !== 'string'
		) return

		const date = record.attendance_date
		const month = date.slice(0, 7)
		if (!presentDatesByMonth.has(month)) presentDatesByMonth.set(month, new Set())
		presentDatesByMonth.get(month).add(date)
	})

	const qualifyingMonths = [...presentDatesByMonth.entries()].filter(([month, dates]) =>
		hasEarnedMonthlyCredit(dates.size, month)
	).length
	return qualifyingMonths * 1.25
}

export default function BranchAdminEmployee({ branchName = 'Bansasi Branch', branchAdmin }) {
	const [employees, setEmployees] = useState([])
	const [isLoading, setIsLoading] = useState(Boolean(branchAdmin?.session_token))
	const [attendanceHistoryState, setAttendanceHistoryState] = useState(null)
	const [searchTerm, setSearchTerm] = useState('')
	const [positionFilter, setPositionFilter] = useState('All positions')
	const [formError, setFormError] = useState('')
	const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
	const [attendanceMonth, setAttendanceMonth] = useState(currentMonthKey)
	const [employeePhotoState, setEmployeePhotoState] = useState(null)
	const [isEmployeePhotoExpanded, setIsEmployeePhotoExpanded] = useState(false)
	const sessionToken = branchAdmin?.session_token

	useEffect(() => {
		let isCurrent = true

		const loadEmployees = async () => {
			const { employees: loadedEmployees, error } = await getBranchEmployees(sessionToken)
			if (!isCurrent) return
			if (error) setFormError(error.message)
			else setEmployees(loadedEmployees)
			setIsLoading(false)
		}

		if (sessionToken) loadEmployees()

		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadAttendanceHistory = async () => {
			const { data, error } = await listBranchAttendanceHistory(sessionToken)
			if (!isCurrent) return
			setAttendanceHistoryState({
				sessionToken,
				employeeId: selectedEmployeeId,
				records: data ?? [],
				error: error?.message ?? ''
			})
		}

		if (sessionToken) loadAttendanceHistory()

		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedEmployeeId])

	const hasCurrentAttendanceHistory = attendanceHistoryState?.sessionToken === sessionToken
		&& attendanceHistoryState?.employeeId === selectedEmployeeId
	const attendanceHistory = hasCurrentAttendanceHistory ? attendanceHistoryState.records : []
	const isLoadingAttendanceHistory = Boolean(sessionToken && !hasCurrentAttendanceHistory)
	const attendanceHistoryError = !sessionToken
		? 'Your login session is missing.'
		: hasCurrentAttendanceHistory ? attendanceHistoryState.error : ''

	const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId)

	useEffect(() => {
		let isCurrent = true

		const loadEmployeePhoto = async () => {
			if (!sessionToken || !selectedEmployee) return
			setEmployeePhotoState({
				sessionToken,
				employeeId: selectedEmployee.id,
				imageUrl: '',
				error: ''
			})
			const { data, error } = await getBranchAdminEmployeePhoto(sessionToken, selectedEmployee.id)
			if (!isCurrent) return
			const photo = data?.[0]
			setEmployeePhotoState({
				sessionToken,
				employeeId: selectedEmployee.id,
				imageUrl: photo ? `data:${photo.content_type};base64,${photo.photo_base64}` : '',
				error: error?.message ?? ''
			})
		}

		loadEmployeePhoto()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedEmployee])

	const currentEmployeePhoto = employeePhotoState?.sessionToken === sessionToken
		&& employeePhotoState?.employeeId === selectedEmployee?.id
		? employeePhotoState
		: null

	useEffect(() => {
		if (!isEmployeePhotoExpanded) return undefined
		const closeOnEscape = (event) => {
			if (event.key === 'Escape') setIsEmployeePhotoExpanded(false)
		}
		document.addEventListener('keydown', closeOnEscape)
		return () => document.removeEventListener('keydown', closeOnEscape)
	}, [isEmployeePhotoExpanded])

	const positions = [...new Set(employees.map((employee) => employee.position))]
	const filteredEmployees = useMemo(() => {
		const normalizedSearch = searchTerm.trim().toLowerCase()

		return employees.filter((employee) => {
			const matchesSearch = `${employee.name} ${employee.id} ${employee.position}`
				.toLowerCase()
				.includes(normalizedSearch)
			const matchesPosition = positionFilter === 'All positions' || employee.position === positionFilter
			return matchesSearch && matchesPosition
		})
	}, [employees, searchTerm, positionFilter])

	if (selectedEmployee) {
		const hasDailyRate = Number.isFinite(selectedEmployee.dailyRate)
		const currentProfile = getEmployeeProfile(selectedEmployee)
		const earnedCredit = selectedEmployee.employmentClassification === 'Regular'
			? calculateEarnedCredit(selectedEmployee.id, attendanceHistory)
			: null
		const recordsByDate = new Map(
			attendanceHistory
				.filter((record) =>
					record.employee_code === selectedEmployee.id
					&& record.attendance_date?.startsWith(`${attendanceMonth}-`)
				)
				.map((record) => [record.attendance_date, record])
		)
		const [attendanceYear, attendanceMonthNumber] = attendanceMonth.split('-').map(Number)
		const attendanceDaysInMonth = new Date(attendanceYear, attendanceMonthNumber, 0).getDate()
		const firstWeekday = new Date(attendanceYear, attendanceMonthNumber - 1, 1).getDay()
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
			<section className="employee-info-shell">
				<header className="employee-profile-header">
					<button type="button" className="employee-back-button" onClick={() => setSelectedEmployeeId(null)}>
						Back to employees
					</button>
					<div className="employee-profile-identity">
						{currentEmployeePhoto?.imageUrl ? (
							<button
								type="button"
								className="employee-profile-avatar employee-profile-avatar-clickable"
								aria-label={`View larger profile photo of ${selectedEmployee.name}`}
								onClick={() => setIsEmployeePhotoExpanded(true)}
							>
								<img src={currentEmployeePhoto.imageUrl} alt="" />
							</button>
						) : (
							<span className="employee-profile-avatar">{selectedEmployee.name.charAt(0)}</span>
						)}
						<div>
							<p className="employee-info-eyebrow">Employee profile</p>
							<h3>{selectedEmployee.name}</h3>
							<p>{selectedEmployee.id} <span aria-hidden="true">·</span> {selectedEmployee.position}</p>
							{currentEmployeePhoto?.error && (
								<span className="employee-profile-photo-feedback error" role="alert">
									{currentEmployeePhoto.error}
								</span>
							)}
						</div>
					</div>
					<span className={`employee-status-badge ${selectedEmployee.todayStatus.toLowerCase().replaceAll(' ', '-')}`}>
						Today: {selectedEmployee.todayStatus}
					</span>
				</header>
				{isEmployeePhotoExpanded && currentEmployeePhoto?.imageUrl && (
					<div
						className="employee-photo-lightbox"
						role="dialog"
						aria-modal="true"
						aria-label={`${selectedEmployee.name} profile photo`}
					>
						<div className="employee-photo-lightbox-frame">
							<button
								type="button"
								className="employee-photo-lightbox-close"
								aria-label="Close enlarged photo"
								onClick={() => setIsEmployeePhotoExpanded(false)}
							>
								×
							</button>
							<img src={currentEmployeePhoto.imageUrl} alt={`${selectedEmployee.name} profile`} />
						</div>
					</div>
				)}

				<div className="employee-detail-summary">
					<div className="employee-detail-stat">
						<span>Present days</span>
						<strong>—</strong>
					</div>
					<div className="employee-detail-stat">
						<span>Late days</span>
						<strong>—</strong>
					</div>
					<div className="employee-detail-stat">
						<span>Absent days</span>
						<strong>—</strong>
					</div>
					<div className="employee-detail-stat">
						<span>Daily rate</span>
						<strong>{hasDailyRate ? formatCurrency(selectedEmployee.dailyRate) : 'Not set'}</strong>
					</div>
				</div>

				<section className="employee-detail-panel employee-personal-details">
					<div className="employee-detail-panel-heading employee-personal-heading">
						<div>
							<h4>Personal and employment information</h4>
							<p>Personal details, identity, and government contribution information.</p>
						</div>
					</div>
					<dl className="employee-profile-fields">
						<div className="employee-profile-field employee-profile-address">
							<dt>Address</dt>
							<dd>{currentProfile.address || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Gender</dt>
							<dd>{currentProfile.gender || 'Not specified'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Birthday</dt>
							<dd>{formatBirthday(currentProfile.birthday)}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Trainee / date hired</dt>
							<dd>{formatBirthday(currentProfile.hireDate)}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Age</dt>
							<dd>{getAge(currentProfile.birthday)}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>TIN</dt>
							<dd>{currentProfile.tinNumber || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>SSS number</dt>
							<dd>{currentProfile.sssNumber || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Pag-IBIG number</dt>
							<dd>{currentProfile.pagibigNumber || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>PhilHealth number</dt>
							<dd>{currentProfile.philhealthNumber || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Employment status</dt>
							<dd>{currentProfile.employmentClassification || 'Not specified'}</dd>
						</div>
						{selectedEmployee.employmentClassification === 'Regular' && (
							<div className="employee-profile-field employee-earned-credit">
								<dt>Earned credit</dt>
								<dd>
									{isLoadingAttendanceHistory
										? 'Loading…'
										: attendanceHistoryError
											? 'Unavailable'
											: `${earnedCredit.toFixed(2)} days`}
								</dd>
								{attendanceHistoryError && (
									<p className="employee-earned-credit-error" role="alert">
										Could not load earned credit: {attendanceHistoryError}
									</p>
								)}
								{!isLoadingAttendanceHistory && !attendanceHistoryError && (
									<p>Earn 1.25 days with 26 present days in a month, or 24 in February.</p>
								)}
							</div>
						)}
					</dl>
					<div className="employee-employment-history">
						<h5>Employment record</h5>
						<div>
							<div>
								<span>Trainee / date hired</span>
								<strong>{formatBirthday(currentProfile.hireDate)}</strong>
							</div>
							<div>
								<span>Probationary</span>
								<strong>{formatBirthday(currentProfile.probationaryDate)}</strong>
							</div>
							<div>
								<span>Regular</span>
								<strong>{formatBirthday(currentProfile.regularDate)}</strong>
							</div>
						</div>
					</div>
				</section>

				<div className="employee-detail-columns">
					<section className="employee-detail-panel">
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

				</div>
			</section>
		)
	}

	return (
		<section className="employee-info-shell">
			<header className="employee-info-header">
				<div>
					<p className="employee-info-eyebrow">{branchName}</p>
					<h3>Employee Information</h3>
					<p className="employee-info-description">Branch roster and today’s attendance status.</p>
				</div>
				<div className="employee-info-header-actions">
					<div className="employee-total">
						<strong>{employees.length}</strong>
						<span>Employees</span>
					</div>
				</div>
			</header>
			{isLoading && <p className="contribution-message" role="status">Loading employees from the database…</p>}
			{!sessionToken && <p className="contribution-message error" role="alert">Your login session is missing. Sign out and sign in again after applying the Supabase SQL.</p>}
			{!isLoading && formError && <p className="contribution-message error" role="alert">{formError}</p>}

			<div className="employee-directory-tools">
				<label className="employee-search-label">
					<span>Search employees</span>
					<input
						type="search"
						placeholder="Name, employee ID, or position"
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
			</div>

			<div className="employee-table-wrap">
				<table className="employee-info-table">
					<thead>
						<tr>
							<th>Employee</th>
							<th>Employee ID</th>
							<th>Position</th>
							<th>Today’s attendance</th>
						</tr>
					</thead>
					<tbody>
						{filteredEmployees.map((employee) => (
							<tr key={employee.id}>
								<td>
									<div className="employee-directory-name">
										<span className="employee-avatar">{employee.name.charAt(0)}</span>
										<button
											type="button"
											className="employee-name-button"
											onClick={() => {
												setSelectedEmployeeId(employee.id)
												setDailyRateInput(employee.dailyRate == null ? '' : String(employee.dailyRate))
												setRateError('')
												setProfileForm(getEmployeeProfile(employee))
												setIsEditingProfile(false)
												setProfileError('')
												setProfileMessage('')
											}}
											aria-label={`View details for ${employee.name}`}
										>
											{employee.name}
										</button>
									</div>
								</td>
								<td>{employee.id}</td>
								<td>{employee.position}</td>
								<td>
									<span className={`employee-status-badge ${employee.todayStatus.toLowerCase().replaceAll(' ', '-')}`}>
										{employee.todayStatus}
									</span>
								</td>
							</tr>
						))}
						{!isLoading && filteredEmployees.length === 0 && (
							<tr>
								<td className="employee-empty-state" colSpan="4">
									{employees.length === 0 ? 'No employees yet. Add an employee to get started.' : 'No employees match your search.'}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			<p className="employee-results-count">Showing {filteredEmployees.length} of {employees.length} employees</p>
		</section>
	)
}
