import { useEffect, useState } from 'react'
import {
	listTafiAdminBranches,
	listTafiAdminEmployeeContributions,
	listTafiAdminEmployees,
	saveTafiAdminEmployeeContribution
} from '../../lib/supabase'

const contributionFields = [
	{ key: 'sss', label: 'SSS' },
	{ key: 'philhealth', label: 'PhilHealth' },
	{ key: 'pagibig', label: 'Pag-IBIG' }
]

const emptyContribution = () => ({ sss: '0.00', philhealth: '0.00', pagibig: '0.00' })
const getContributionKey = (branchId, employeeCode) => `${branchId}:${employeeCode}`

export default function TafiEmployeeContributions({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [employees, setEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [directoryStatus, setDirectoryStatus] = useState('loading')
	const [loadStatus, setLoadStatus] = useState('loading')
	const [contributions, setContributions] = useState({})
	const [loadError, setLoadError] = useState('')
	const [saveError, setSaveError] = useState('')
	const [savedEmployeeKey, setSavedEmployeeKey] = useState('')
	const [savingEmployeeKey, setSavingEmployeeKey] = useState('')

	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const activeEmployees = employees.filter((employee) =>
		employee.branch_id === selectedBranchId && employee.employment_status === 'active'
	)

	useEffect(() => {
		let isCurrent = true

		const loadDirectory = async () => {
			if (!sessionToken) {
				setLoadError('Your TAFI Admin session is missing. Sign in again to manage contributions.')
				setDirectoryStatus('error')
				setLoadStatus('error')
				return
			}

			setDirectoryStatus('loading')
			setLoadError('')
			const [branchesResult, employeesResult] = await Promise.all([
				listTafiAdminBranches(sessionToken),
				listTafiAdminEmployees(sessionToken)
			])
			if (!isCurrent) return

			const error = branchesResult.error ?? employeesResult.error
			if (error) {
				setLoadError(error.message)
				setDirectoryStatus('error')
				setLoadStatus('error')
				return
			}

			const loadedBranches = branchesResult.data ?? []
			setBranches(loadedBranches)
			setEmployees(employeesResult.data ?? [])
			setSelectedBranchId((currentBranchId) => (
				loadedBranches.some((branch) => branch.branch_id === currentBranchId)
					? currentBranchId
					: loadedBranches[0]?.branch_id ?? ''
			))
			setDirectoryStatus('ready')
			if (loadedBranches.length === 0) setLoadStatus('ready')
		}

		loadDirectory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadContributions = async () => {
			if (directoryStatus !== 'ready' || !selectedBranchId) return

			setLoadStatus('loading')
			setLoadError('')
			const { data, error } = await listTafiAdminEmployeeContributions(
				sessionToken,
				selectedBranchId
			)
			if (!isCurrent) return

			if (error) {
				setLoadError(error.message)
				setLoadStatus('error')
				return
			}

			setContributions((current) => ({
				...current,
				...Object.fromEntries((data ?? []).map((record) => [
					getContributionKey(selectedBranchId, record.employee_code),
					{
						sss: String(record.sss),
						philhealth: String(record.philhealth),
						pagibig: String(record.pagibig)
					}
				]))
			}))
			setLoadStatus('ready')
		}

		loadContributions()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, selectedBranchId, directoryStatus])

	const updateContribution = (employeeCode, field, value) => {
		const key = getContributionKey(selectedBranchId, employeeCode)
		setContributions((current) => ({
			...current,
			[key]: {
				...(current[key] ?? emptyContribution()),
				[field]: value
			}
		}))
		setSavedEmployeeKey('')
		setSaveError('')
	}

	const saveContribution = async (event, employee) => {
		event.preventDefault()
		const key = getContributionKey(selectedBranchId, employee.employee_code)
		const values = contributions[key] ?? emptyContribution()
		const amounts = Object.fromEntries(contributionFields.map(({ key: field }) => [
			field,
			Number(values[field])
		]))

		if (contributionFields.some(({ key: field }) =>
			values[field].trim() === '' || !Number.isFinite(amounts[field]) || amounts[field] < 0
		)) {
			setSaveError(`Enter valid non-negative weekly amounts for ${employee.employee_name}.`)
			return
		}

		setSavingEmployeeKey(key)
		setSavedEmployeeKey('')
		setSaveError('')
		const { error } = await saveTafiAdminEmployeeContribution(
			sessionToken,
			selectedBranchId,
			{ employeeCode: employee.employee_code, ...amounts }
		)
		setSavingEmployeeKey('')

		if (error) {
			setSaveError(`Could not save ${employee.employee_name}: ${error.message}`)
			return
		}

		setSavedEmployeeKey(key)
	}

	return (
		<section className="employee-info-shell contribution-shell">
			<header className="employee-info-header">
				<div>
					<p className="employee-info-eyebrow">{selectedBranch?.branch_name ?? 'TAFI Admin'}</p>
					<h3>Mandatory Contribution Employee</h3>
					<p className="employee-info-description">
						Enter each employee’s weekly SSS, PhilHealth, and Pag-IBIG deductions. These amounts are subtracted from weekly gross pay.
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
			{loadStatus === 'loading' && directoryStatus === 'ready' && selectedBranchId && (
				<p className="contribution-message" role="status">Loading saved contributions…</p>
			)}
			{loadError && <p className="contribution-message error" role="alert">{loadError}</p>}
			{saveError && <p className="contribution-message error" role="alert">{saveError}</p>}

			<div className="employee-directory-tools tafi-employee-directory-tools">
				<label className="employee-filter-label pl-3">
					<span>Branch</span>
					<select
						value={selectedBranchId}
						onChange={(event) => {
							setSelectedBranchId(event.target.value)
							setSavedEmployeeKey('')
							setSaveError('')
						}}
						disabled={directoryStatus !== 'ready' || branches.length === 0}
					>
						{branches.length === 0 && <option value="">No branches available</option>}
						{branches.map((branch) => (
							<option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
						))}
					</select>
				</label>
			</div>

			<div className="employee-table-wrap contribution-table-wrap" role="region" aria-label="Employee contribution list" tabIndex="0">
				<table className="employee-info-table contribution-table">
					<thead>
						<tr>
							<th>Employee</th>
							<th>Employee ID</th>
							{contributionFields.map(({ key, label }) => <th key={key}>{label} / week (PHP)</th>)}
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						{activeEmployees.map((employee) => {
							const key = getContributionKey(selectedBranchId, employee.employee_code)
							const values = contributions[key] ?? emptyContribution()
							const isSaving = savingEmployeeKey === key

							return (
								<tr key={employee.employee_id}>
									<td>{employee.employee_name}</td>
									<td>{employee.employee_code}</td>
									{contributionFields.map(({ key: field, label }) => (
										<td key={field}>
											<input
												className="contribution-amount-input"
												type="number"
												min="0"
												step="0.01"
												required
												value={values[field]}
												disabled={loadStatus !== 'ready' || Boolean(savingEmployeeKey)}
												onChange={(event) => updateContribution(
													employee.employee_code,
													field,
													event.target.value
												)}
												aria-label={`${label} weekly contribution for ${employee.employee_name}`}
											/>
										</td>
									))}
									<td>
										<form onSubmit={(event) => saveContribution(event, employee)}>
											<button
												type="submit"
												className="add-employee-submit contribution-save-button"
												disabled={loadStatus !== 'ready' || isSaving || Boolean(savingEmployeeKey)}
											>
												{isSaving ? 'Saving…' : 'Save'}
											</button>
											{savedEmployeeKey === key && <span className="contribution-saved">Saved</span>}
										</form>
									</td>
								</tr>
							)
						})}
						{directoryStatus === 'ready' && activeEmployees.length === 0 && (
							<tr><td className="employee-empty-state" colSpan="6">
								{selectedBranchId ? 'No active employees in this branch.' : 'No branches have been created yet.'}
							</td></tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	)
}