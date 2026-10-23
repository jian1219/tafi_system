import { useEffect, useMemo, useState } from 'react'
import {
	getBranchAdminEmployeePhoto,
	listBranchAttendanceHistory
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import {
	getAttendanceDayValue,
	getAttendanceRemark,
	getLocalDateKey,
	hasEarnedMonthlyCredit
} from './branchAttendanceRecords'
import { recordLegend, statusCodeClassNames, statusCodes } from '../attendanceStatusDisplay'
import TafiEmployeeDocuments from '../TAFI_Admin/TAFI_Employee_Documents'

const currentDate = new Date()
const todayDateKey = getLocalDateKey(currentDate)
const currentMonthKey = todayDateKey.slice(0, 7)
const attendanceStatusDetails = {
	present: { label: '✓', description: 'Present', className: statusCodeClassNames[statusCodes.present] },
	present_late: { label: 'Late', description: 'Present (Late)', className: statusCodeClassNames[statusCodes.present_late] },
	half_day: { label: 'HD', description: 'Half day', className: statusCodeClassNames[statusCodes.half_day] },
	absent: { label: 'A', description: 'Absent', className: statusCodeClassNames[statusCodes.absent] },
	maternity_leave: { label: 'ML', description: 'Maternity leave', className: statusCodeClassNames[statusCodes.maternity_leave] },
	paternity_leave: { label: 'PL', description: 'Paternity leave', className: statusCodeClassNames[statusCodes.paternity_leave] },
	authorized_leave: { label: 'AL', description: 'Authorized leave', className: statusCodeClassNames[statusCodes.authorized_leave] },
	birthday_leave: { label: 'BL', description: 'Birthday leave', className: statusCodeClassNames[statusCodes.birthday_leave] },
	vl_with_pay: { label: 'VLP', description: 'Vacation leave with pay', className: statusCodeClassNames[statusCodes.vl_with_pay] },
	vl_without_pay: { label: 'VLwP', description: 'Vacation leave without pay', className: statusCodeClassNames[statusCodes.vl_without_pay] },
	day_off: { label: 'DAY OFF', description: 'Day off', className: statusCodeClassNames[statusCodes.day_off] },
	not_marked: { label: '—', description: 'Not marked', className: '' }
}

const attendanceShiftDetails = [
	{ value: '9am-2pm | 6pm-9pm', label: '9am - 2pm | 6pm - 9pm' },
	{ value: '11am-4pm | 6pm-9pm', label: '11am - 4pm | 6pm - 9pm' },
	{ value: '1pm-9pm', label: '1pm - 9pm' }
]

const leaveAttendanceStatuses = new Set([
	'maternity_leave',
	'paternity_leave',
	'authorized_leave',
	'birthday_leave',
	'vl_with_pay',
	'vl_without_pay'
])

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
	placeOfBirth: employee.placeOfBirth,
	gender: employee.gender,
	civilStatus: employee.civilStatus,
	birthday: employee.birthday,
	email: employee.email,
	phone: employee.phone,
	emergencyContactName: employee.emergencyContactName,
	emergencyContactNumber: employee.emergencyContactNumber,
	emergencyContactRelationship: employee.emergencyContactRelationship,
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
	const [profileForm, setProfileForm] = useState(null)
	const [isEditingProfile, setIsEditingProfile] = useState(false)
	const [isSavingProfile] = useState(false)
	const [profileError, setProfileError] = useState('')
	const [profileMessage, setProfileMessage] = useState('')
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

	const updateProfileField = (field, value) => {
		setProfileForm((current) => ({ ...current, [field]: value }))
	}

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
			present: monthlyStatuses.reduce((total, status) => total + getAttendanceDayValue(status), 0),
			late: monthlyStatuses.filter((status) => status === 'present_late').length,
			absent: monthlyStatuses.filter((status) => status === 'absent').length,
			leave: monthlyStatuses.filter((status) => leaveAttendanceStatuses.has(status)).length
		}
		const monthlyShiftCounts = attendanceShiftDetails.map((shift) => ({
			...shift,
			total: [...recordsByDate.values()].filter((record) =>
				record.shift === shift.value
				&& ['present', 'present_late', 'half_day'].includes(record.status)
			).length
		}))
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
					{!isEditingProfile ? (
						<>
					<dl className="employee-profile-fields">
						<div className="employee-profile-field employee-profile-address">
							<dt>Address</dt>
							<dd>{currentProfile.address || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Place of birth</dt>
							<dd>{currentProfile.placeOfBirth || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Gender</dt>
							<dd>{currentProfile.gender || 'Not specified'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Civil status</dt>
							<dd>{currentProfile.civilStatus || 'Not specified'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Birthday</dt>
							<dd>{formatBirthday(currentProfile.birthday)}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Email</dt>
							<dd>{currentProfile.email || 'Not provided'}</dd>
						</div>
						<div className="employee-profile-field">
							<dt>Phone</dt>
							<dd>{currentProfile.phone || 'Not provided'}</dd>
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
					<section className="employee-emergency-contact-box employee-emergency-contact-summary">
						<h5>Emergency contact</h5>
						<dl className="employee-profile-fields">
							<div className="employee-profile-field">
								<dt>Contact name</dt>
								<dd>{currentProfile.emergencyContactName || 'Not provided'}</dd>
							</div>
							<div className="employee-profile-field">
								<dt>Contact number</dt>
								<dd>{currentProfile.emergencyContactNumber || 'Not provided'}</dd>
							</div>
							<div className="employee-profile-field">
								<dt>Relationship</dt>
								<dd>{currentProfile.emergencyContactRelationship || 'Not provided'}</dd>
							</div>
						</dl>
					</section>
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
						{profileMessage && <p className="employee-personal-saved" role="status">{profileMessage}</p>}
						</>
					) : (
						<form className="employee-personal-form" onSubmit={(event) => event.preventDefault()}>
							<label className="employee-personal-address">
								<span>Address</span>
								<textarea
									rows="2"
									value={profileForm.address}
									onChange={(event) => updateProfileField('address', event.target.value)}
								/>
							</label>
							<label>
								<span>Place of birth</span>
								<input
									value={profileForm.placeOfBirth}
									onChange={(event) => updateProfileField('placeOfBirth', event.target.value)}
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
								<span>Civil status</span>
								<select
									value={profileForm.civilStatus}
									onChange={(event) => updateProfileField('civilStatus', event.target.value)}
								>
									<option value="">Not specified</option>
									<option value="Single">Single</option>
									<option value="Married">Married</option>
									<option value="Widowed">Widowed</option>
									<option value="Separated">Separated</option>
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
								<span>Employment classification</span>
								<select
									required
									value={profileForm.employmentClassification}
									onChange={(event) => updateProfileField('employmentClassification', event.target.value)}
								>
									<option value="">Select employment classification</option>
									{employmentClassifications.map((classification) => (
										<option key={classification} value={classification}>{classification}</option>
									))}
								</select>
							</label>
							<fieldset className="employee-emergency-contact-box">
								<legend>Emergency contact</legend>
								<label>
									<span>Contact name</span>
									<input
										value={profileForm.emergencyContactName}
										onChange={(event) => updateProfileField('emergencyContactName', event.target.value)}
										autoComplete="off"
									/>
								</label>
								<label>
									<span>Contact number</span>
									<input
										type="tel"
										value={profileForm.emergencyContactNumber}
										onChange={(event) => updateProfileField('emergencyContactNumber', event.target.value)}
										autoComplete="off"
									/>
								</label>
								<label>
									<span>Relationship</span>
									<select
										value={profileForm.emergencyContactRelationship}
										onChange={(event) => updateProfileField('emergencyContactRelationship', event.target.value)}
									>
										<option value="">Select relationship</option>
										{emergencyContactRelationships.map((relationship) => (
											<option key={relationship} value={relationship}>{relationship}</option>
										))}
									</select>
								</label>
							</fieldset>
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
										setProfileForm(null)
										setProfileError('')
										setProfileMessage('')
										setIsEditingProfile(false)
									}}
								>
									Cancel
								</button>
								<button type="submit" className="add-employee-submit" disabled={isSavingProfile}>
									{isSavingProfile ? 'Saving…' : 'Save employee profile'}
								</button>
							</div>
						</form>
					)}
				</section>

				<TafiEmployeeDocuments
					sessionToken={sessionToken}
					branchEmployeeCode={selectedEmployee.id}
				/>

				<div className="employee-detail-columns">
					<section className="employee-detail-panel branch-employee-attendance-record">
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
							{recordLegend.map(({ className, label }) => (
								<span key={className}><i className={className} /> {label}</span>
							))}
						</div>
						{isLoadingAttendanceHistory ? (
							<p className="employee-detail-empty" role="status">Loading attendance records…</p>
						) : attendanceHistoryError ? (
							<p className="employee-detail-empty error" role="alert">
								Could not load attendance records: {attendanceHistoryError}
							</p>
						) : (
							<>
								<div className="employee-shift-month-record">
									<div className="employee-shift-month-heading">
										<h5>Shift month record</h5>
										<span>{formatMonth(attendanceMonth)}</span>
									</div>
									<div className="employee-shift-month-grid">
										{monthlyShiftCounts.map((shift) => (
											<div className="employee-shift-month-card" key={shift.value}>
												<span>{shift.label}</span>
												<strong>{shift.total}</strong>
												<small>{shift.total === 1 ? 'shift' : 'shifts'}</small>
											</div>
										))}
									</div>
								</div>
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
											const shiftLabel = attendanceShiftDetails.find(
												(shift) => shift.value === record?.shift
											)?.label
											const displayedShiftLabel = ['present', 'present_late', 'half_day'].includes(status)
												? shiftLabel
												: ''

											return (
												<div
													className={`employee-attendance-day${className}`}
													key={dateKey}
													title={`${dateKey}: ${statusDetail?.description ?? (status ? 'Not marked' : 'No record')}${lateMinutes === null ? '' : `, ${lateMinutes} minutes late`}${displayedShiftLabel ? `, ${displayedShiftLabel}` : ''}`}
												>
													<strong>{day}</strong>
													<span>{lateMinutes === null
														? statusDetail?.label ?? (status ? 'Not marked' : '—')
														: `${lateMinutes} min late`}</span>
													{displayedShiftLabel && (
														<span className="employee-attendance-day-shift">{displayedShiftLabel}</span>
													)}
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
