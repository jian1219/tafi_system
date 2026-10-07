import { useEffect, useMemo, useState } from 'react'
import {
	createBranchEmployee,
	updateBranchEmployeeDailyRate,
	updateBranchEmployeeProfile
} from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'
import { getLocalDateKey } from './branchAttendanceRecords'

const currentDate = new Date()
const todayDateKey = getLocalDateKey(currentDate)

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

export default function BranchAdminEmployee({ branchName = 'Bansasi Branch', branchAdmin }) {
	const [employees, setEmployees] = useState([])
	const [isLoading, setIsLoading] = useState(Boolean(branchAdmin?.session_token))
	const [isSavingEmployee, setIsSavingEmployee] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [positionFilter, setPositionFilter] = useState('All positions')
	const [isAddFormOpen, setIsAddFormOpen] = useState(false)
	const [newEmployeeName, setNewEmployeeName] = useState('')
	const [newEmployeePosition, setNewEmployeePosition] = useState('')
	const [formError, setFormError] = useState('')
	const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
	const [dailyRateInput, setDailyRateInput] = useState('')
	const [rateError, setRateError] = useState('')
	const [isSavingRate, setIsSavingRate] = useState(false)
	const [profileForm, setProfileForm] = useState(null)
	const [profileError, setProfileError] = useState('')
	const [profileMessage, setProfileMessage] = useState('')
	const [isSavingProfile, setIsSavingProfile] = useState(false)
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

	const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId)

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

	const addEmployee = async (event) => {
		event.preventDefault()
		const name = newEmployeeName.trim()
		const position = newEmployeePosition.trim()
		if (!name || !position) return

		setIsSavingEmployee(true)
		setFormError('')
		const { error } = await createBranchEmployee(sessionToken, { name, position })
		if (error) {
			setFormError(error.message)
			setIsSavingEmployee(false)
			return
		}

		const { employees: refreshedEmployees, error: refreshError } = await getBranchEmployees(sessionToken)
		setIsSavingEmployee(false)
		if (refreshError) {
			setFormError(`Employee was added, but the list could not be refreshed: ${refreshError.message}`)
			return
		}

		setEmployees(refreshedEmployees)
		setPositionFilter('All positions')
		setSearchTerm('')
		setNewEmployeeName('')
		setNewEmployeePosition('')
		setFormError('')
		setIsAddFormOpen(false)
	}

	const saveDailyRate = async (event) => {
		event.preventDefault()
		const dailyRate = Number(dailyRateInput)
		if (dailyRateInput.trim() === '' || !Number.isFinite(dailyRate) || dailyRate < 0) {
			setRateError('Enter a valid daily rate of zero or more.')
			return
		}

		setIsSavingRate(true)
		const { error } = await updateBranchEmployeeDailyRate(sessionToken, selectedEmployeeId, dailyRate)
		setIsSavingRate(false)
		if (error) {
			setRateError(error.message)
			return
		}

		setEmployees((current) => current.map((employee) =>
			employee.id === selectedEmployeeId ? { ...employee, dailyRate } : employee
		))
		setRateError('')
	}

	const updateProfileField = (field, value) => {
		setProfileForm((current) => ({ ...current, [field]: value }))
		setProfileError('')
		setProfileMessage('')
	}

	const saveEmployeeProfile = async (event) => {
		event.preventDefault()
		if (!profileForm || !selectedEmployeeId) return
		if (profileForm.birthday && profileForm.birthday > todayDateKey) {
			setProfileError('Birthday cannot be in the future.')
			return
		}

		setIsSavingProfile(true)
		setProfileError('')
		setProfileMessage('')
		const { error } = await updateBranchEmployeeProfile(sessionToken, selectedEmployeeId, profileForm)
		setIsSavingProfile(false)
		if (error) {
			setProfileError(error.message)
			return
		}

		setEmployees((current) => current.map((employee) =>
			employee.id === selectedEmployeeId ? { ...employee, ...profileForm } : employee
		))
		setProfileMessage('Employee profile saved.')
	}

	if (selectedEmployee) {
		const hasDailyRate = Number.isFinite(selectedEmployee.dailyRate)
		const currentProfile = profileForm ?? {
			address: selectedEmployee.address,
			gender: selectedEmployee.gender,
			birthday: selectedEmployee.birthday,
			sssNumber: selectedEmployee.sssNumber,
			pagibigNumber: selectedEmployee.pagibigNumber,
			philhealthNumber: selectedEmployee.philhealthNumber,
			employmentClassification: selectedEmployee.employmentClassification
		}

		return (
			<section className="employee-info-shell">
				<header className="employee-profile-header">
					<button type="button" className="employee-back-button" onClick={() => setSelectedEmployeeId(null)}>
						Back to employees
					</button>
					<div className="employee-profile-identity">
						<span className="employee-profile-avatar">{selectedEmployee.name.charAt(0)}</span>
						<div>
							<p className="employee-info-eyebrow">Employee profile</p>
							<h3>{selectedEmployee.name}</h3>
							<p>{selectedEmployee.id} <span aria-hidden="true">·</span> {selectedEmployee.position}</p>
						</div>
					</div>
					<span className={`employee-status-badge ${selectedEmployee.todayStatus.toLowerCase().replaceAll(' ', '-')}`}>
						Today: {selectedEmployee.todayStatus}
					</span>
				</header>

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
					<div className="employee-detail-panel-heading">
						<div>
							<h4>Personal and employment information</h4>
							<p>Edit employee contact, identity, and government contribution details.</p>
						</div>
					</div>
					<form className="employee-personal-form" onSubmit={saveEmployeeProfile}>
						<label className="employee-personal-address">
							<span>Address</span>
							<textarea
								rows="2"
								value={currentProfile.address}
								onChange={(event) => updateProfileField('address', event.target.value)}
							/>
						</label>
						<label>
							<span>Gender</span>
							<select
								value={currentProfile.gender}
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
								value={currentProfile.birthday}
								onChange={(event) => updateProfileField('birthday', event.target.value)}
							/>
						</label>
						<div className="employee-personal-value">
							<span>Age</span>
							<strong>{getAge(currentProfile.birthday)}</strong>
						</div>
						<label>
							<span>SSS number</span>
							<input
								value={currentProfile.sssNumber}
								onChange={(event) => updateProfileField('sssNumber', event.target.value)}
								autoComplete="off"
							/>
						</label>
						<label>
							<span>Pag-IBIG number</span>
							<input
								value={currentProfile.pagibigNumber}
								onChange={(event) => updateProfileField('pagibigNumber', event.target.value)}
								autoComplete="off"
							/>
						</label>
						<label>
							<span>PhilHealth number</span>
							<input
								value={currentProfile.philhealthNumber}
								onChange={(event) => updateProfileField('philhealthNumber', event.target.value)}
								autoComplete="off"
							/>
						</label>
						<label>
							<span>Employment status</span>
							<select
								value={currentProfile.employmentClassification}
								onChange={(event) => updateProfileField('employmentClassification', event.target.value)}
								required
							>
								<option value="">Select employment status</option>
								<option value="Regular">Regular</option>
								<option value="Probationary">Probationary</option>
								<option value="Trainee">Trainee</option>
							</select>
						</label>
						<div className="employee-personal-actions">
							{profileError && <p className="add-employee-error" role="alert">{profileError}</p>}
							{profileMessage && <p className="employee-personal-saved" role="status">{profileMessage}</p>}
							<button type="submit" className="add-employee-submit" disabled={isSavingProfile}>
								{isSavingProfile ? 'Saving…' : 'Save employee information'}
							</button>
						</div>
					</form>
				</section>

				<div className="employee-detail-columns">
					<section className="employee-detail-panel">
						<div className="employee-detail-panel-heading">
							<div>
								<h4>Attendance record</h4>
								<p>Monthly day-by-day record</p>
							</div>
							<div className="employee-attendance-legend">
								<span><i className="present" /> Present</span>
								<span><i className="late" /> Late</span>
								<span><i className="absent" /> Absent</span>
							</div>
						</div>
						<p className="employee-detail-empty">Attendance history will appear here after attendance records are added.</p>
					</section>

					<section className="employee-detail-panel employee-payroll-panel">
						<div className="employee-detail-panel-heading">
							<div>
							<h4>Payroll details</h4>
							<p>Set a rate to estimate gross pay</p>
						</div>
						</div>
						<form className="daily-rate-form" onSubmit={saveDailyRate}>
							<label htmlFor="employee-daily-rate">Daily rate</label>
							<div className="daily-rate-input-row">
								<span>₱</span>
								<input
									id="employee-daily-rate"
									type="number"
									min="0"
									step="0.01"
									required
									value={dailyRateInput}
									onChange={(event) => setDailyRateInput(event.target.value)}
									placeholder="0.00"
								/>
								<button type="submit" className="add-employee-submit" disabled={isSavingRate}>
									{isSavingRate ? 'Saving…' : 'Save rate'}
								</button>
							</div>
							{rateError && <p className="add-employee-error" role="alert">{rateError}</p>}
						</form>
						<p className="employee-payroll-note">Weekly gross and final pay are calculated in the Branch Payroll tab from attendance, contributions, HDMF repayments, undertime, and cash advances.</p>
						<p className="employee-payroll-note">Actual payroll payments are not linked to employee profiles yet.</p>
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
					<button
						type="button"
						className="add-employee-button"
						disabled={isSavingEmployee}
						onClick={() => {
							setIsAddFormOpen((isOpen) => !isOpen)
							setFormError('')
						}}
					>
						{isSavingEmployee ? 'Saving…' : isAddFormOpen ? 'Cancel' : 'Add employee'}
					</button>
				</div>
			</header>
			{isLoading && <p className="contribution-message" role="status">Loading employees from the database…</p>}
			{!sessionToken && <p className="contribution-message error" role="alert">Your login session is missing. Sign out and sign in again after applying the Supabase SQL.</p>}
			{!isLoading && formError && !isAddFormOpen && <p className="contribution-message error" role="alert">{formError}</p>}

			{isAddFormOpen && (
				<form className="add-employee-form" onSubmit={addEmployee}>
					<label>
						<span>Full name</span>
						<input
							autoFocus
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
					<button type="submit" className="add-employee-submit" disabled={isSavingEmployee}>
						{isSavingEmployee ? 'Saving…' : 'Save employee'}
					</button>
					{formError && <p className="add-employee-error" role="alert">{formError}</p>}
				</form>
			)}

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
												setProfileForm({
													address: employee.address,
													gender: employee.gender,
													birthday: employee.birthday,
													sssNumber: employee.sssNumber,
													pagibigNumber: employee.pagibigNumber,
													philhealthNumber: employee.philhealthNumber,
													employmentClassification: employee.employmentClassification
												})
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
