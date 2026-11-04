import { useEffect, useMemo, useState } from 'react'
import { listAccountantInventoryTransformHistory } from '../../lib/supabase'

const requestDateLabelFormatter = new Intl.DateTimeFormat(undefined, {
	timeZone: 'Asia/Manila',
	dateStyle: 'full'
})
const preparationPriceFormatter = new Intl.NumberFormat('en-PH', {
	style: 'currency',
	currency: 'PHP'
})
const getPreparationDateKey = (requestDate) => String(requestDate ?? '').slice(0, 10)
const formatPreparationTotalPrice = (quantity, unitPrice) => {
	if (unitPrice === null || unitPrice === undefined || unitPrice === '') return '—'
	const totalPrice = Number(quantity) * Number(unitPrice)
	return Number.isFinite(totalPrice) ? preparationPriceFormatter.format(totalPrice) : '—'
}

export default function AccountantInventoryTransferForm({ sessionToken }) {
	const [preparationHistory, setPreparationHistory] = useState([])
	const [branchFilter, setBranchFilter] = useState('')
	const [selectedMonth, setSelectedMonth] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [errorMessage, setErrorMessage] = useState('')

	useEffect(() => {
		let isCurrent = true

		const loadPreparationHistory = async () => {
			if (!sessionToken) {
				setIsLoading(false)
				setErrorMessage('Accountant session is unavailable. Please sign in again.')
				return
			}

			setIsLoading(true)
			setErrorMessage('')
			const { data, error } = await listAccountantInventoryTransformHistory(sessionToken)
			if (!isCurrent) return

			setIsLoading(false)
			if (error) {
				setErrorMessage(error.message)
				return
			}

			setPreparationHistory(data ?? [])
		}

		loadPreparationHistory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	const branches = useMemo(
		() => [...new Set(preparationHistory.map((item) => item.branch_name).filter(Boolean))]
			.sort((first, second) => first.localeCompare(second)),
		[preparationHistory]
	)
	const filteredHistory = useMemo(
		() => preparationHistory.filter((item) => (
			item.branch_name === branchFilter
			&& (!selectedMonth || getPreparationDateKey(item.request_date).startsWith(selectedMonth))
		)),
		[branchFilter, preparationHistory, selectedMonth]
	)
	const historyByDate = useMemo(() => {
		const groups = new Map()
		filteredHistory.forEach((item) => {
			const dateKey = getPreparationDateKey(item.request_date)
			if (!groups.has(dateKey)) groups.set(dateKey, [])
			groups.get(dateKey).push(item)
		})
		return [...groups.entries()]
			.sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
			.map(([dateKey, items]) => ({ dateKey, items }))
	}, [filteredHistory])

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-list-heading">
				<div>
					<h2>Completed Inventory Transform Form records</h2>
					<p>Review completed inventory transforms recorded by TAFI Admin.</p>
				</div>
			</div>

			{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}

			{!isLoading && !errorMessage && (
				<div className="tafi-stock-inventory-filters">
					<label>
						<span>Filter by branch</span>
						<select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
							<option value="">Select a branch</option>
							{branches.map((branch) => (
								<option key={branch} value={branch}>{branch}</option>
							))}
						</select>
					</label>
					<label className="tafi-stock-request-month-filter">
						<span>Filter by month</span>
						<input
							type="month"
							value={selectedMonth}
							onChange={(event) => setSelectedMonth(event.target.value)}
						/>
					</label>
				</div>
			)}

			{isLoading ? (
				<p className="accountant-inventory-empty" role="status">Loading transform history...</p>
			) : errorMessage ? null : !branchFilter ? (
				<p className="accountant-inventory-empty">Select a branch to view its completed transform records.</p>
			) : historyByDate.length ? (
				<div className="tafi-stock-preparing-orders">
					{historyByDate.map(({ dateKey, items }) => {
						const date = dateKey ? new Date(`${dateKey}T12:00:00+08:00`) : null
						const dateLabel = date && !Number.isNaN(date.getTime())
							? requestDateLabelFormatter.format(date)
							: 'Date unavailable'
						return (
							<div className="tafi-stock-delivery-date-group" key={dateKey || 'date-unavailable'}>
								<h3 className="tafi-stock-delivery-date-heading">{dateLabel}</h3>
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Branch</th>
												<th scope="col">Stock no.</th>
												<th scope="col">Category</th>
												<th scope="col">Item description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Quantity</th>
												<th scope="col">Unit price</th>
												<th scope="col">Total price</th>
												<th scope="col">Barcode</th>
											</tr>
										</thead>
										<tbody>
											{items.map((item) => (
												<tr key={`${item.preparation_id}-${item.barcode}`}>
													<td>{item.branch_name}</td>
													<td>{item.stock_no}</td>
													<td>{item.category || '—'}</td>
													<td>{item.item_description}</td>
													<td>{item.unit_of_measure}</td>
													<td>{item.quantity}</td>
													<td>{item.unit_price ?? '—'}</td>
													<td>{formatPreparationTotalPrice(item.quantity, item.unit_price)}</td>
													<td>{item.barcode}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						)
					})}
				</div>
			) : (
				<p className="accountant-inventory-empty">
					No completed transform records match {branchFilter}
					{selectedMonth ? ` in ${selectedMonth}.` : '.'}
				</p>
			)}
		</section>
	)
}