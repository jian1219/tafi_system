import { useEffect, useState } from 'react'
import {
	listBranchMissingDailyInputs,
	listTafiAdminBranches,
	listTafiAdminMissingDailyInputs,
	markBranchDateNoOperation
} from '../../lib/supabase'

function getManilaDateKey(date) {
	const parts = new Intl.DateTimeFormat('en', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date)
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
	return `${values.year}-${values.month}-${values.day}`
}

function shiftDate(dateKey, dayOffset) {
	const date = new Date(`${dateKey}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + dayOffset)
	return date.toISOString().slice(0, 10)
}

function formatDate(dateKey) {
	return new Intl.DateTimeFormat(undefined, {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	}).format(new Date(`${dateKey}T12:00:00Z`))
}

function getLastThirtyCompletedDays() {
	const yesterday = shiftDate(getManilaDateKey(new Date()), -1)
	return {
		startDate: shiftDate(yesterday, -29),
		endDate: yesterday
	}
}

export default function BranchMissingDailyInputs({ sessionToken, isTafiAdmin = false }) {
	const [dateRange] = useState(getLastThirtyCompletedDays)
	const [alerts, setAlerts] = useState([])
	const [branches, setBranches] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [isLoadingBranches, setIsLoadingBranches] = useState(isTafiAdmin)
	const [branchError, setBranchError] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [loadingError, setLoadingError] = useState('')
	const [actionError, setActionError] = useState('')
	const [savingDate, setSavingDate] = useState('')

	useEffect(() => {
		if (!isTafiAdmin) return undefined

		let isCurrent = true
		const loadBranches = async () => {
			setIsLoadingBranches(true)
			setBranchError('')
			if (!sessionToken) {
				setBranches([])
				setSelectedBranchId('')
				setBranchError('TAFI Admin session is unavailable. Please sign in again.')
				setIsLoadingBranches(false)
				return
			}

			const { data, error } = await listTafiAdminBranches(sessionToken)
			if (!isCurrent) return
			setIsLoadingBranches(false)
			if (error) {
				setBranches([])
				setSelectedBranchId('')
				setBranchError(error.message)
				return
			}

			const branchList = (data ?? []).filter((branch) => (
				String(branch.branch_name ?? '').trim() !== 'TAFI - HO'
			))
			setBranches(branchList)
			setSelectedBranchId((current) => (
				branchList.some((branch) => branch.branch_id === current)
					? current
					: branchList[0]?.branch_id ?? ''
			))
		}

		void loadBranches()
		return () => {
			isCurrent = false
		}
	}, [isTafiAdmin, sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadAlerts = async () => {
			setIsLoading(true)
			setLoadingError('')
			if (!sessionToken) {
				setAlerts([])
				setLoadingError(`${isTafiAdmin ? 'TAFI Admin' : 'Branch Admin'} session is unavailable. Please sign in again.`)
				setIsLoading(false)
				return
			}

			const { data, error } = isTafiAdmin
				? await listTafiAdminMissingDailyInputs(sessionToken, dateRange.startDate, dateRange.endDate)
				: await listBranchMissingDailyInputs(sessionToken, dateRange.startDate, dateRange.endDate)
			if (!isCurrent) return

			setIsLoading(false)
			if (error) {
				setAlerts([])
				setLoadingError(error.message)
				return
			}

			setAlerts(data ?? [])
		}

		void loadAlerts()
		return () => {
			isCurrent = false
		}
	}, [dateRange, isTafiAdmin, sessionToken])

	const displayedAlerts = isTafiAdmin
		? alerts.filter((alert) => alert.branch_id === selectedBranchId)
		: alerts
	const isChecking = isLoading || (isTafiAdmin && isLoadingBranches)

	const handleMarkNoOperation = async (alert) => {
		setSavingDate(alert.report_date)
		setActionError('')
		const { error } = await markBranchDateNoOperation(sessionToken, alert.report_date)
		setSavingDate('')
		if (error) {
			setActionError(error.message)
			return
		}

		setAlerts((current) => current.filter((entry) => (
			entry.branch_id !== alert.branch_id || entry.report_date !== alert.report_date
		)))
	}

	return (
		<section className="branch-missing-daily-inputs" aria-labelledby="branch-missing-daily-inputs-heading">
			<header className="branch-missing-daily-inputs-header">
				<div>
					<p className="branch-overview-heading-label">DAILY CHECK</p>
					<h2 id="branch-missing-daily-inputs-heading">Missing daily entries</h2>
				</div>
				<span className="branch-missing-daily-inputs-count">
					{isChecking ? '…' : displayedAlerts.length}
				</span>
			</header>
			<p className="branch-missing-daily-inputs-description">
				No records were found for these sections in the last 30 completed days, through {formatDate(dateRange.endDate)}.
			</p>

			{isTafiAdmin && (
				<label className="cash-advance-month-control tafi-cash-advance-branch-select">
					<span>Branch</span>
					<select
						value={selectedBranchId}
						onChange={(event) => setSelectedBranchId(event.target.value)}
						disabled={isLoadingBranches || branches.length === 0 || Boolean(branchError)}
					>
						{isLoadingBranches && <option value="">Loading branches…</option>}
						{!isLoadingBranches && branches.length === 0 && <option value="">No branches available</option>}
						{branches.map((branch) => (
							<option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
						))}
					</select>
				</label>
			)}

			{branchError && <p className="branch-missing-daily-inputs-message is-error" role="alert">{branchError}</p>}
			{loadingError && <p className="branch-missing-daily-inputs-message is-error" role="alert">{loadingError}</p>}
			{actionError && <p className="branch-missing-daily-inputs-message is-error" role="alert">{actionError}</p>}
			{isChecking ? (
				<p className="branch-missing-daily-inputs-message" role="status">Checking daily entries…</p>
			) : loadingError || branchError ? null : isTafiAdmin && branches.length === 0 ? (
				<p className="branch-missing-daily-inputs-message">No branches are available.</p>
			) : displayedAlerts.length === 0 ? (
				<p className="branch-missing-daily-inputs-message">No missing daily entries in this date range.</p>
			) : (
				<ul className="branch-missing-daily-inputs-list">
					{displayedAlerts.map((alert) => (
						<li
							className="branch-missing-daily-input-card"
							key={`${alert.branch_id}-${alert.report_date}`}
						>
							<div className="branch-missing-daily-input-copy">
								<strong>{formatDate(alert.report_date)}</strong>
								{isTafiAdmin && <span>{alert.branch_name}</span>}
								<span>Missing: {(alert.missing_inputs ?? []).join(', ')}</span>
							</div>
							{!isTafiAdmin && (
								<button
									type="button"
									className="branch-missing-daily-input-close"
									aria-label={`Mark ${formatDate(alert.report_date)} as closed with no operation`}
									disabled={savingDate === alert.report_date}
									onClick={() => handleMarkNoOperation(alert)}
								>
									{savingDate === alert.report_date ? 'Saving…' : 'Mark closed / no operation'}
								</button>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
