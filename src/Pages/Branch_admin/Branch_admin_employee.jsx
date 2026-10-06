import { useMemo, useState } from 'react'
import { getBranchEmployees, saveBranchEmployees } from './branchEmployees'
import { monthRecords } from './Branch_attendance_monitoring'

const formatCurrency = (amount) => amount.toLocaleString('en-PH', {
	style: 'currency',
	currency: 'PHP',
	minimumFractionDigits: 2
})

export default function BranchAdminEmployee() {
	const [employees, setEmployees] = useState(getBranchEmployees)
	const [searchTerm, setSearchTerm] = useState('')
	const [positionFilter, setPositionFilter] = useState('All positions')
	const [isAddFormOpen, setIsAddFormOpen] = useState(false)
	const [newEmployeeName, setNewEmployeeName] = useState('')
	const [newEmployeePosition, setNewEmployeePosition] = useState('')
	const [formError, setFormError] = useState('')
	const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
	const [dailyRateInput, setDailyRateInput] = useState('')
	const [rateError, setRateError] = useState('')

	const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId)
	const selectedAttendance = monthRecords.find((record) => record.id === selectedEmployeeId)
	const attendanceCounts = selectedAttendance?.days.reduce((counts, day) => {
		if (day === 'P') counts.present += 1
		if (day === 'L') counts.late += 1
		if (day === 'A') counts.absent += 1
		return counts
	}, { present: 0, late: 0, absent: 0 })

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

	const addEmployee = (event) => {
		event.preventDefault()
		const name = newEmployeeName.trim()
		const position = newEmployeePosition.trim()
		if (!name || !position) return

		const nextIdNumber = employees.reduce((highestId, employee) => {
			const idNumber = Number(employee.id.match(/\d+$/)?.[0] || 0)
			return Math.max(highestId, idNumber)
		}, 0) + 1
		const nextEmployees = [
			...employees,
			{
				id: `EMP-${String(nextIdNumber).padStart(3, '0')}`,
				name,
				position,
				todayStatus: 'Not marked'
			}
		]

		if (!saveBranchEmployees(nextEmployees)) {
			setFormError('Could not save this employee in this browser. Check available storage and try again.')
			return
		}

		setEmployees(nextEmployees)
		setPositionFilter('All positions')
		setSearchTerm('')
		setNewEmployeeName('')
		setNewEmployeePosition('')
		setFormError('')
		setIsAddFormOpen(false)
	}

	const saveDailyRate = (event) => {
		event.preventDefault()
		const dailyRate = Number(dailyRateInput)
		if (dailyRateInput.trim() === '' || !Number.isFinite(dailyRate) || dailyRate < 0) {
			setRateError('Enter a valid daily rate of zero or more.')
			return
		}

		const updatedEmployees = employees.map((employee) =>
			employee.id === selectedEmployeeId ? { ...employee, dailyRate } : employee
		)
		if (!saveBranchEmployees(updatedEmployees)) {
			setRateError('Could not save the daily rate in this browser. Check available storage and try again.')
			return
		}

		setEmployees(updatedEmployees)
		setRateError('')
	}

	if (selectedEmployee) {
		const payableDays = attendanceCounts ? attendanceCounts.present + attendanceCounts.late : 0
		const hasDailyRate = Number.isFinite(selectedEmployee.dailyRate)
		const estimatedGross = hasDailyRate && attendanceCounts ? payableDays * selectedEmployee.dailyRate : null

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
						<strong>{attendanceCounts?.present ?? '—'}</strong>
					</div>
					<div className="employee-detail-stat">
						<span>Late days</span>
						<strong>{attendanceCounts?.late ?? '—'}</strong>
					</div>
					<div className="employee-detail-stat">
						<span>Absent days</span>
						<strong>{attendanceCounts?.absent ?? '—'}</strong>
					</div>
					<div className="employee-detail-stat">
						<span>Daily rate</span>
						<strong>{hasDailyRate ? formatCurrency(selectedEmployee.dailyRate) : 'Not set'}</strong>
					</div>
				</div>

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
						{selectedAttendance ? (
							<div className="employee-attendance-days">
								{selectedAttendance.days.map((day, index) => (
									<div key={`${selectedEmployeeId}-${index}`} className={`employee-attendance-day ${day.toLowerCase()}`}>
										<span>{index + 1}</span>
										<strong>{day}</strong>
									</div>
								))}
							</div>
						) : (
							<p className="employee-detail-empty">No monthly attendance record is available for this employee yet.</p>
						)}
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
								<button type="submit" className="add-employee-submit">Save rate</button>
							</div>
							{rateError && <p className="add-employee-error" role="alert">{rateError}</p>}
						</form>
						<div className="employee-payroll-estimate">
							<span>Estimated gross for this record</span>
							<strong>{estimatedGross === null ? 'Set a rate to calculate' : formatCurrency(estimatedGross)}</strong>
							<small>{attendanceCounts ? `${payableDays} present/late days × daily rate` : 'Attendance record required for an estimate'}</small>
						</div>
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
					<p className="employee-info-eyebrow">Bansasi Branch</p>
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
						onClick={() => {
							setIsAddFormOpen((isOpen) => !isOpen)
							setFormError('')
						}}
					>
						{isAddFormOpen ? 'Cancel' : 'Add employee'}
					</button>
				</div>
			</header>

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
					<button type="submit" className="add-employee-submit">Save employee</button>
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
						{filteredEmployees.length === 0 && (
							<tr>
								<td className="employee-empty-state" colSpan="4">No employees match your search.</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			<p className="employee-results-count">Showing {filteredEmployees.length} of {employees.length} employees</p>
		</section>
	)
}
