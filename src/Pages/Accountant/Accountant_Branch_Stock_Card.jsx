import { useEffect, useMemo, useState } from 'react'
import {
	listAccountantBranchStockCardRecords,
	listAccountantInventoryBranches
} from '../../lib/supabase'

function getLocalMonthInputValue() {
	const now = new Date()
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatRecordDate(value) {
	const [year, month, day] = String(value ?? '').split('-').map(Number)
	if (!year || !month || !day) return 'Date unavailable'
	return new Date(year, month - 1, day).toLocaleDateString()
}

function formatRecordMonth(value) {
	const [year, month] = String(value ?? '').split('-').map(Number)
	if (!year || !month) return 'all months'
	return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
		month: 'long',
		year: 'numeric'
	})
}

function formatQuantity(value) {
	if (value === null || value === undefined || value === '') return ''
	return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatPrice(value) {
	if (value === null || value === undefined || value === '') return ''
	return new Intl.NumberFormat('en-PH', {
		style: 'currency',
		currency: 'PHP'
	}).format(Number(value))
}

function sumStockCardField(records, field) {
	const values = records
		.map((record) => record[field])
		.filter((value) => value !== null && value !== undefined && value !== '')
		.map(Number)
		.filter(Number.isFinite)

	return values.length ? values.reduce((total, value) => total + value, 0) : null
}

export default function AccountantBranchStockCard({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [records, setRecords] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [selectedStockNo, setSelectedStockNo] = useState('')
	const [selectedMonth, setSelectedMonth] = useState(getLocalMonthInputValue)
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [loadError, setLoadError] = useState('')
	const [retryCount, setRetryCount] = useState(0)

	useEffect(() => {
		let isCurrent = true

		const load = async () => {
			setIsLoading(true)
			setLoadError('')
			if (!sessionToken) {
				setIsLoading(false)
				setLoadError('Accountant session is unavailable. Please sign in again.')
				return
			}

			const [branchResult, stockCardResult] = await Promise.all([
				listAccountantInventoryBranches(sessionToken),
				listAccountantBranchStockCardRecords(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)

			const errors = [branchResult.error, stockCardResult.error].filter(Boolean)
			setLoadError(errors.map((error) => error.message).join(' '))
			setBranches(branchResult.error ? [] : branchResult.data ?? [])
			setRecords(stockCardResult.error ? [] : stockCardResult.data ?? [])
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [retryCount, sessionToken])

	const selectableBranches = useMemo(
		() => branches.filter((branch) => String(branch.branch_name ?? '').trim() !== 'TAFI - HO'),
		[branches]
	)
	const activeBranchId = selectableBranches.some((branch) => branch.branch_id === selectedBranchId)
		? selectedBranchId
		: selectableBranches[0]?.branch_id ?? ''
	const activeBranchName = selectableBranches.find((branch) => branch.branch_id === activeBranchId)?.branch_name ?? ''
	const selectedBranchRecords = useMemo(
		() => records.filter((record) => record.branch_id === activeBranchId),
		[activeBranchId, records]
	)
	const stockNumbers = useMemo(
		() => [...new Set(selectedBranchRecords.map((record) => record.stock_no))]
			.sort((first, second) => first.localeCompare(second)),
		[selectedBranchRecords]
	)
	const activeStockNo = stockNumbers.includes(selectedStockNo)
		? selectedStockNo
		: stockNumbers[0] ?? ''
	const selectedStockCard = selectedBranchRecords.find((record) => record.stock_no === activeStockNo)
	const displayedStockCardRecords = useMemo(
		() => selectedBranchRecords.filter((record) => (
			record.stock_no === activeStockNo
			&& String(record.date ?? '').slice(0, 7) === selectedMonth
		)),
		[activeStockNo, selectedBranchRecords, selectedMonth]
	)
	const lastDisplayedStockCardRecord = displayedStockCardRecords[displayedStockCardRecords.length - 1]
	const stockCardTotals = {
		inQty: sumStockCardField(displayedStockCardRecords, 'in_qty') ?? 0,
		inTotal: sumStockCardField(displayedStockCardRecords, 'in_total') ?? 0,
		balanceQty: lastDisplayedStockCardRecord?.balance_qty ?? null,
		runningBalance: lastDisplayedStockCardRecord?.running_balance ?? null
	}

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-list-heading">
				<div>
					<h2>{activeBranchName ? `${activeBranchName} Stock Card` : 'Branch Stock Card'}</h2>
					<p>
						{displayedStockCardRecords.length} record
						{displayedStockCardRecords.length === 1 ? '' : 's'}
						{' for '}{formatRecordMonth(selectedMonth)}
						{' · '}{stockNumbers.length} stock card{stockNumbers.length === 1 ? '' : 's'}
					</p>
				</div>
				<button
					type="button"
					className="accountant-inventory-add-toggle"
					onClick={() => setRetryCount((count) => count + 1)}
					disabled={isLoading}
				>
					{isLoading ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>

			{!isLoading && (
				<div className="tafi-stock-inventory-filters">
					<label>
						<span>Branch</span>
						<select
							value={activeBranchId}
							onChange={(event) => {
								setSelectedBranchId(event.target.value)
								setSelectedStockNo('')
							}}
							disabled={selectableBranches.length === 0}
						>
							{selectableBranches.length === 0 && <option value="">No branches available</option>}
							{selectableBranches.map((branch) => (
								<option key={branch.branch_id} value={branch.branch_id}>
									{branch.branch_name}
								</option>
							))}
						</select>
					</label>
					<label>
						<span>Stock No.</span>
						<select
							value={activeStockNo}
							onChange={(event) => setSelectedStockNo(event.target.value)}
							aria-label="Select a stock card by stock number"
							disabled={stockNumbers.length === 0}
						>
							{stockNumbers.length === 0 && <option value="">No stock receipts available</option>}
							{stockNumbers.map((stockNo) => (
								<option key={stockNo} value={stockNo}>{stockNo}</option>
							))}
						</select>
					</label>
					<label>
						<span>Filter by month</span>
						<input
							type="month"
							value={selectedMonth}
							required
							onChange={(event) => {
								if (event.target.value) setSelectedMonth(event.target.value)
							}}
						/>
					</label>
				</div>
			)}

			{loadError && <p className="accountant-inventory-error" role="alert">{loadError}</p>}
			{isLoading ? (
				<p className="accountant-inventory-empty" role="status">Loading branch stock cards...</p>
			) : (
				<div className="accountant-stock-card-list">
					<section className="accountant-stock-card">
						<dl className="accountant-stock-card-details">
							<div>
								<dt>Stock No:</dt>
								<dd>{selectedStockCard?.stock_no || '—'}</dd>
							</div>
							<div>
								<dt>Item Description:</dt>
								<dd>{selectedStockCard?.item_description || '—'}</dd>
							</div>
							<div>
								<dt>Category:</dt>
								<dd>{selectedStockCard?.category || '—'}</dd>
							</div>
							<div>
								<dt>Unit of measure:</dt>
								<dd>{selectedStockCard?.unit_of_measure || '—'}</dd>
							</div>
						</dl>
						<div
							className="accountant-inventory-table-wrap accountant-stock-card-table-wrap"
							role="region"
							aria-label={`Branch stock card table for ${activeBranchName || 'selected branch'} and ${activeStockNo || 'selected stock'}`}
							tabIndex={0}
						>
							<table className="accountant-inventory-table accountant-stock-card-table">
								<thead>
									<tr>
										<th scope="col" rowSpan="2">Date</th>
										<th scope="col" rowSpan="2">Reference</th>
										<th scope="col" rowSpan="2">Description</th>
										<th scope="colgroup" colSpan="3" className="accountant-stock-card-in accountant-stock-card-group-start accountant-stock-card-group-end">IN (Purchase)</th>
										<th scope="colgroup" colSpan="3" className="accountant-stock-card-out accountant-stock-card-group-start accountant-stock-card-group-end">OUT (Interbranch Transfer)</th>
										<th scope="col" rowSpan="2" className="accountant-stock-card-balance accountant-stock-card-group-start">Balance Qty</th>
										<th scope="col" rowSpan="2" className="accountant-stock-card-balance">Balance Unit Cost</th>
										<th scope="col" rowSpan="2" className="accountant-stock-card-balance accountant-stock-card-group-end">Running Balance</th>
									</tr>
									<tr>
										<th scope="col" className="accountant-stock-card-in accountant-stock-card-group-start">QTY</th>
										<th scope="col" className="accountant-stock-card-in">Unit Cost</th>
										<th scope="col" className="accountant-stock-card-in accountant-stock-card-group-end">Total</th>
										<th scope="col" className="accountant-stock-card-out accountant-stock-card-group-start">QTY</th>
										<th scope="col" className="accountant-stock-card-out">Unit Cost</th>
										<th scope="col" className="accountant-stock-card-out accountant-stock-card-group-end">Total</th>
									</tr>
								</thead>
								<tbody>
									{displayedStockCardRecords.length ? displayedStockCardRecords.map((record) => (
										<tr key={record.id}>
											<td>{formatRecordDate(record.date)}</td>
											<td>{record.reference || ''}</td>
											<td>{record.description || ''}</td>
											<td className="accountant-stock-card-in accountant-stock-card-group-start">{formatQuantity(record.in_qty)}</td>
											<td className="accountant-stock-card-in">{formatPrice(record.in_unit_cost)}</td>
											<td className="accountant-stock-card-in accountant-stock-card-group-end">{formatPrice(record.in_total)}</td>
											<td className="accountant-stock-card-out accountant-stock-card-group-start"></td>
											<td className="accountant-stock-card-out"></td>
											<td className="accountant-stock-card-out accountant-stock-card-group-end"></td>
											<td className="accountant-stock-card-balance accountant-stock-card-group-start">{formatQuantity(record.balance_qty)}</td>
											<td className="accountant-stock-card-balance">{formatPrice(record.balance_unit_cost)}</td>
											<td className="accountant-stock-card-balance accountant-stock-card-group-end">{formatPrice(record.running_balance)}</td>
										</tr>
									)) : (
										<tr>
											<td colSpan="12" className="accountant-inventory-empty">
												{activeBranchId
													? stockNumbers.length
														? `No stock records found for ${formatRecordMonth(selectedMonth)}.`
														: 'No stock card receipts have been recorded for this branch.'
													: 'Select a branch to view its stock card.'}
											</td>
										</tr>
									)}
								</tbody>
								{displayedStockCardRecords.length > 0 && (
									<tfoot>
										<tr>
											<th scope="row" colSpan="3">TOTAL</th>
											<td className="accountant-stock-card-in accountant-stock-card-group-start">{formatQuantity(stockCardTotals.inQty)}</td>
											<td className="accountant-stock-card-in"></td>
											<td className="accountant-stock-card-in accountant-stock-card-group-end">{formatPrice(stockCardTotals.inTotal)}</td>
											<td className="accountant-stock-card-out accountant-stock-card-group-start"></td>
											<td className="accountant-stock-card-out"></td>
											<td className="accountant-stock-card-out accountant-stock-card-group-end"></td>
											<td className="accountant-stock-card-balance accountant-stock-card-group-start">{formatQuantity(stockCardTotals.balanceQty)}</td>
											<td className="accountant-stock-card-balance"></td>
											<td className="accountant-stock-card-balance accountant-stock-card-group-end">{formatPrice(stockCardTotals.runningBalance)}</td>
										</tr>
									</tfoot>
								)}
							</table>
						</div>
					</section>
				</div>
			)}
		</section>
	)
}