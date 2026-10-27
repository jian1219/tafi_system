import { useEffect, useState } from 'react'
import {
	listGuestEmployeeBranches,
	listGuestEmployeeContributions,
	listGuestEmployees
} from '../../lib/supabase'

const contributionFields = [
	{ key: 'sss', label: 'SSS' },
	{ key: 'philhealth', label: 'PhilHealth' },
	{ key: 'pagibig', label: 'Pag-IBIG' }
]

const formatContributionAmount = (amount) => Number(amount ?? 0).toLocaleString('en-PH', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
})

export default function GuestMandatoryContributions({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [employees, setEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [directoryStatus, setDirectoryStatus] = useState('loading')
	const [directoryError, setDirectoryError] = useState('')
	const [contributions, setContributions] = useState([])
	const [contributionStatus, setContributionStatus] = useState('loading')
	const [contributionError, setContributionError] = useState('')

	useEffect(() => {
		let isCurrent = true

		const loadDirectory = async () => {
			if (!sessionToken) {
				setDirectoryError('Your Guest session is missing. Sign in again to view contributions.')
				setDirectoryStatus('error')
				return
			}

			setDirectoryStatus('loading')
			setDirectoryError('')
			const [branchesResult, employeesResult] = await Promise.all([
				listGuestEmployeeBranches(sessionToken),
				listGuestEmployees(sessionToken)
			])
			if (!isCurrent) return

			const error = branchesResult.error ?? employeesResult.error
			if (error) {
				setDirectoryError(error.message)
				setDirectoryStatus('error')
				return
			}

			const loadedBranches = branchesResult.data ?? []
			setBranches(loadedBranches)
			setEmployees(employeesResult.data ?? [])
			setSelectedBranchId(loadedBranches[0]?.branch_id ?? '')
			setDirectoryStatus('ready')
		}

		loadDirectory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadContributions = async () => {
			if (directoryStatus !== 'ready') return
			if (!selectedBranchId) {
				setContributions([])
				setContributionStatus('ready')
				setContributionError('')
				return
			}

			setContributionStatus('loading')
			setContributionError('')
			const { data, error } = await listGuestEmployeeContributions(sessionToken, selectedBranchId)
			if (!isCurrent) return

			if (error) {
				setContributionError(error.message)
				setContributionStatus('error')
				return
			}

			setContributions(data ?? [])
			setContributionStatus('ready')
		}

		loadContributions()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedBranchId, directoryStatus])

	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const activeEmployees = employees.filter((employee) =>
		employee.branch_id === selectedBranchId && employee.employment_status === 'active'
	)
	const contributionsByEmployee = Object.fromEntries(
		contributions.map((record) => [record.employee_code, record])
	)

	return (
		<section className="employee-info-shell contribution-shell">
			<header className="employee-info-header">
				<div>
					<p className="employee-info-eyebrow">{selectedBranch?.branch_name ?? 'Guest Workspace'}</p>
					<h3>Mandatory Contributions</h3>
					<p className="employee-info-description">
						View employees’ weekly SSS, PhilHealth, and Pag-IBIG contribution records.
					</p>
				</div>
				<div className="employee-total">
					<strong>{activeEmployees.length}</strong>
					<span>Employees</span>
				</div>
			</header>

			{directoryStatus === 'loading' && (
				<p className="contribution-message" role="status">Loading branches and employees…</p>
			)}
			{directoryStatus === 'error' && (
				<p className="contribution-message error" role="alert">{directoryError}</p>
			)}
			{directoryStatus === 'ready' && (
				<div className="employee-directory-tools tafi-employee-directory-tools">
					<label className="employee-filter-label pl-3">
						<span>Branch</span>
						<select
							value={selectedBranchId}
							onChange={(event) => setSelectedBranchId(event.target.value)}
							disabled={branches.length === 0}
						>
							{branches.length === 0 && <option value="">No branches available</option>}
							{branches.map((branch) => (
								<option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
							))}
						</select>
					</label>
				</div>
			)}

			{contributionStatus === 'loading' && directoryStatus === 'ready' && selectedBranchId && (
				<p className="contribution-message" role="status">Loading saved contributions…</p>
			)}
			{contributionStatus === 'error' && (
				<p className="contribution-message error" role="alert">{contributionError}</p>
			)}

			<div className="employee-table-wrap contribution-table-wrap" role="region" aria-label="Employee contribution list" tabIndex="0">
				<table className="employee-info-table contribution-table">
					<thead>
						<tr>
							<th>Employee</th>
							<th>Employee ID</th>
							{contributionFields.map(({ key, label }) => <th key={key}>{label} / week (PHP)</th>)}
						</tr>
					</thead>
					<tbody>
						{contributionStatus === 'ready' && activeEmployees.map((employee) => {
							const values = contributionsByEmployee[employee.employee_code]

							return (
								<tr key={employee.employee_id}>
									<td>{employee.employee_name}</td>
									<td>{employee.employee_code}</td>
									{contributionFields.map(({ key }) => (
										<td key={key} className="contribution-readonly-value">
											{formatContributionAmount(values?.[key])}
										</td>
									))}
								</tr>
							)
						})}
						{directoryStatus === 'ready' && contributionStatus === 'ready' && activeEmployees.length === 0 && (
							<tr>
								<td className="employee-empty-state" colSpan="5">
									{branches.length === 0 ? 'No branches are available.' : 'No active employees are listed for this branch.'}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	)
}
