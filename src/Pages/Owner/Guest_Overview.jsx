import { useEffect, useState } from 'react'
import {
	listGuestBranchCDJEntries,
	listGuestBranchCashReceiptsJournalEntries,
	listGuestBranchSalesTargets,
	listGuestBranchSelectorOptions
} from '../../lib/supabase'
import BranchOverviewAnalytics from '../Branch_admin/Branch_Overview_Analytics'
import tunaBancasiImage from '../../images/tuna_bancasi.png'
import tunaGingoogImage from '../../images/tuna_gingoog.png'

export default function GuestOverview({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [isLoadingBranches, setIsLoadingBranches] = useState(true)
	const [branchError, setBranchError] = useState('')
	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)

	useEffect(() => {
		let isCurrent = true

		const loadBranches = async () => {
			setIsLoadingBranches(true)
			setBranchError('')
			if (!sessionToken) {
				setBranches([])
				setSelectedBranchId('')
				setBranchError('Owner session is unavailable. Please sign in again.')
				setIsLoadingBranches(false)
				return
			}

			const { data, error } = await listGuestBranchSelectorOptions(sessionToken)
			if (!isCurrent) return
			if (error) {
				setBranches([])
				setSelectedBranchId('')
				setBranchError(error.message)
				setIsLoadingBranches(false)
				return
			}

			const branchList = data ?? []
			setBranches(branchList)
			setSelectedBranchId((current) => (
				branchList.some((branch) => branch.branch_id === current)
					? current
					: branchList[0]?.branch_id ?? ''
			))
			setIsLoadingBranches(false)
		}

		void loadBranches()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	return (
		<>
			<section className="guest-overview-branches" aria-labelledby="guest-overview-branches-title">
				<h2 id="guest-overview-branches-title">Tuna Republik Branches</h2>
				<div className="guest-overview-branch-grid">
					<figure className="guest-overview-branch-card">
						<img src={tunaBancasiImage} alt="Tuna Republik Bancasi branch" />
						<figcaption>Bancasi</figcaption>
					</figure>
					<figure className="guest-overview-branch-card">
						<img src={tunaGingoogImage} alt="Tuna Republik Gingoog branch" />
						<figcaption>Gingoog</figcaption>
					</figure>
				</div>
			</section>

			<section>
				<header className="branch-analytics-page-header">
					<div>
						<p className="branch-overview-heading-label">OWNER WORKSPACE ANALYTICS</p>
						<h2>Branch Analytics</h2>
						<p className="branch-analytics-page-description">
							Review sales, expenses, and targets for a selected branch.
						</p>
					</div>
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
				</header>

				{branchError && <p className="cash-advance-message error" role="alert">{branchError}</p>}
				{isLoadingBranches && <p className="cash-advance-message" role="status">Loading branches…</p>}
				{!isLoadingBranches && !branchError && branches.length === 0 && (
					<p className="cash-advance-message" role="status">No branches are available.</p>
				)}
				{!isLoadingBranches && !branchError && selectedBranch && (
					<BranchOverviewAnalytics
						key={selectedBranchId}
						sessionToken={sessionToken}
						branchId={selectedBranchId}
						branchName={selectedBranch.branch_name}
						sessionRoleLabel="Owner"
						listSalesEntries={listGuestBranchCashReceiptsJournalEntries}
						listExpenseEntries={listGuestBranchCDJEntries}
						listTargets={listGuestBranchSalesTargets}
					/>
				)}
			</section>
		</>
	)
}