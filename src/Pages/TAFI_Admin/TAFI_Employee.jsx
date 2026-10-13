import { useEffect, useMemo, useState } from 'react'
import { listTafiAdminBranches, listTafiAdminEmployees } from '../../lib/supabase'

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

export default function TafiEmployee({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [employees, setEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('all')
	const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [errorMessage, setErrorMessage] = useState('')

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
	const selectedEmployee = filteredEmployees.find((employee) => employee.employee_id === selectedEmployeeId)

	const selectBranch = (branchId) => {
		setSelectedBranchId(branchId)
		setSelectedEmployeeId(null)
	}

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
							<button type="button" className="employee-back-button" onClick={() => setSelectedEmployeeId(null)}>
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
							</div>

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
						</section>
					</article>
				) : (
					<>
						<div className="tafi-employee-section-heading">
							<h2 id="tafi-employee-heading">
								{selectedBranch?.branch_name ?? 'Employees'}
							</h2>
							<p>
								{isLoading
									? 'Loading employees...'
									: `${filteredEmployees.length} employee${filteredEmployees.length === 1 ? '' : 's'}`}
							</p>
						</div>

						{errorMessage && <p className="tafi-employee-error" role="alert">{errorMessage}</p>}
						{!isLoading && !errorMessage && (
							filteredEmployees.length ? (
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
											{filteredEmployees.map((employee) => (
												<tr key={employee.employee_id}>
													<td>
														<button
															type="button"
															className="tafi-employee-name-button"
															onClick={() => setSelectedEmployeeId(employee.employee_id)}
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
									{branches.length
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
