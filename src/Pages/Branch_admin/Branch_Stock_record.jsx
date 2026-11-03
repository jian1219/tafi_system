import { useEffect, useMemo, useState } from 'react'
import { listBranchStockInRecords } from '../../lib/supabase'

const formatPrice = (value) => value === null || value === undefined
	? '—'
	: new Intl.NumberFormat('en-PH', {
		style: 'currency',
		currency: 'PHP'
	}).format(Number(value))

const formatDate = (value) => {
	const [year, month, day] = String(value ?? '').split('-').map(Number)
	if (!year || !month || !day) return 'Date unavailable'
	return new Date(year, month - 1, day).toLocaleDateString()
}

export default function BranchStockRecord({ branchName = 'Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [records, setRecords] = useState([])
	const [selectedMonth, setSelectedMonth] = useState('')
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
				setLoadError('Branch Admin session is unavailable. Please sign in again.')
				return
			}

			const { data, error } = await listBranchStockInRecords(sessionToken)
			if (!isCurrent) return
			setIsLoading(false)
			if (error) {
				setLoadError(error.message)
				return
			}

			setRecords(data ?? [])
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [retryCount, sessionToken])

	const filteredRecords = useMemo(
		() => records.filter((record) => (
			!selectedMonth || String(record.date ?? '').slice(0, 7) === selectedMonth
		)),
		[records, selectedMonth]
	)
	const filteredRecordsByDate = useMemo(() => {
		const groups = new Map()
		filteredRecords.forEach((record) => {
			const dateKey = String(record.date ?? '').slice(0, 10)
			if (!groups.has(dateKey)) groups.set(dateKey, [])
			groups.get(dateKey).push(record)
		})
		return [...groups.entries()]
			.sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
			.map(([dateKey, items]) => ({ dateKey, items }))
	}, [filteredRecords])

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-list-heading">
				<div>
					<h2>{branchName} stock-in records</h2>
					<p>{filteredRecords.length} of {records.length} records</p>
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

			{loadError && <p className="accountant-inventory-error" role="alert">{loadError}</p>}
			{isLoading ? (
				<p className="accountant-inventory-empty" role="status">Loading stock-in records...</p>
			) : loadError ? null : records.length ? (
				<>
					<div className="tafi-stock-inventory-filters">
						<label className="tafi-stock-request-month-filter">
							<span>Filter by month</span>
							<input
								type="month"
								value={selectedMonth}
								onChange={(event) => setSelectedMonth(event.target.value)}
							/>
						</label>
					</div>
					{filteredRecords.length ? (
						filteredRecordsByDate.map(({ dateKey, items }) => (
							<div className="tafi-stock-delivery-date-group" key={dateKey || 'date-unavailable'}>
								<h3 className="tafi-stock-delivery-date-heading">{formatDate(dateKey)}</h3>
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Stock no.</th>
												<th scope="col">Item description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Stock in count</th>
												<th scope="col">Per item price</th>
												<th scope="col">Total price</th>
											</tr>
										</thead>
										<tbody>
											{items.map((record) => (
												<tr key={record.record_id}>
													<td>{record.stock_no}</td>
													<td>{record.item_description}</td>
													<td>{record.unit_of_measure}</td>
													<td>{Number(record.stock_in_count).toLocaleString()}</td>
													<td>{formatPrice(record.per_item_price)}</td>
													<td>{formatPrice(record.total_price)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						))
					) : (
						<p className="accountant-inventory-empty">
							No branch stock-in records were recorded in {selectedMonth}.
						</p>
					)}
				</>
			) : (
				<p className="accountant-inventory-empty">No branch stock-in records have been recorded yet.</p>
			)}
		</section>
	)
}