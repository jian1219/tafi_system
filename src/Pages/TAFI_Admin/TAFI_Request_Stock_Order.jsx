import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { deliverTafiAdminStockRequests, listTafiAdminStockRequests } from '../../lib/supabase'

const requestDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Manila',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
})
const requestDateLabelFormatter = new Intl.DateTimeFormat(undefined, {
	timeZone: 'Asia/Manila',
	dateStyle: 'full'
})
const getRequestDateKey = (createdAt) => {
	const parts = requestDateKeyFormatter.formatToParts(new Date(createdAt))
	return ['year', 'month', 'day']
		.map((partType) => parts.find((part) => part.type === partType).value)
		.join('-')
}

export default function TafiRequestStockOrder({ sessionToken }) {
	const [requests, setRequests] = useState([])
	const [searchTerm, setSearchTerm] = useState('')
	const [branchFilter, setBranchFilter] = useState('')
	const [selectedMonth, setSelectedMonth] = useState('')
	const [activeTab, setActiveTab] = useState('requests')
	const [isLoading, setIsLoading] = useState(true)
	const [deliveringBatchKey, setDeliveringBatchKey] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')

	const loadRequests = async () => {
		setIsLoading(true)
		const { data, error } = await listTafiAdminStockRequests(sessionToken)
		setIsLoading(false)
		if (error) {
			setErrorMessage(error.message)
			return error
		}
		setRequests(data ?? [])
		setErrorMessage('')
		return null
	}

	useEffect(() => {
		let isCurrent = true

		const load = async () => {
			const { data, error } = await listTafiAdminStockRequests(sessionToken)
			if (!isCurrent) return
			setIsLoading(false)
			if (error) {
				setErrorMessage(error.message)
				return
			}
			setRequests(data ?? [])
			setErrorMessage('')
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	const branches = useMemo(
		() => [...new Set(requests.map((request) => request.branch_name).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[requests]
	)

	const filteredRequests = useMemo(() => {
		const query = searchTerm.trim().toLocaleLowerCase()
		return requests.filter((request) => {
			if (branchFilter && request.branch_name !== branchFilter) return false
			if (selectedMonth && !getRequestDateKey(request.created_at).startsWith(selectedMonth)) return false
			if (!query) return true
			return [
				request.request_group_id,
				request.branch_name,
				request.stock_no,
				request.item_description,
				request.unit_of_measure
			].some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [branchFilter, requests, searchTerm, selectedMonth])

	const filteredRequestGroups = useMemo(() => {
		const groups = new Map()
		filteredRequests.forEach((request) => {
			const groupId = request.request_group_id ?? request.request_id
			if (!groups.has(groupId)) groups.set(groupId, [])
			groups.get(groupId).push(request)
		})
		return [...groups.entries()].map(([groupId, items]) => ({ groupId, items }))
		}, [filteredRequests])

		const pendingRequests = requests.filter((request) => request.status === 'pending')
	const pendingDeliveryBatches = useMemo(() => {
		const groups = new Map()
		requests.filter((request) => request.status === 'pending').forEach((request) => {
			const dateKey = getRequestDateKey(request.created_at)
			const branchKey = request.branch_id ?? request.branch_name
			const batchKey = JSON.stringify([dateKey, branchKey])
			if (!groups.has(batchKey)) {
				groups.set(batchKey, {
					key: batchKey,
					dateKey,
					branchName: request.branch_name,
					createdAt: request.created_at,
					items: []
				})
			}
			groups.get(batchKey).items.push(request)
		})
		return [...groups.values()].sort((first, second) =>
			second.dateKey.localeCompare(first.dateKey)
			|| first.branchName.localeCompare(second.branchName)
		)
	}, [requests])
	const pendingDeliveryDates = useMemo(() => {
		const groups = new Map()
		pendingDeliveryBatches.forEach((batch) => {
			if (!groups.has(batch.dateKey)) {
				groups.set(batch.dateKey, {
					dateKey: batch.dateKey,
					createdAt: batch.createdAt,
					batches: []
				})
			}
			groups.get(batch.dateKey).batches.push(batch)
		})
		return [...groups.values()]
	}, [pendingDeliveryBatches])

	const handleDeliver = async (batch) => {
		setDeliveringBatchKey(batch.key)
		setErrorMessage('')
		setNotice('')

		const requestIds = batch.items.map((request) => request.request_id)
		const { error } = await deliverTafiAdminStockRequests(sessionToken, requestIds)
		if (error) {
			setDeliveringBatchKey('')
			setErrorMessage(error.message)
			return
		}

		const deliveredRequestIds = new Set(requestIds)
		setRequests((current) => current.map((item) => deliveredRequestIds.has(item.request_id)
			? {
				...item,
				status: 'delivered',
				quantity_delivered: item.quantity_requested
			}
			: item))
		const refreshError = await loadRequests()
		setDeliveringBatchKey('')
		if (refreshError) {
			setNotice('Requests marked delivered, but the request list could not be refreshed.')
			return
		}
		setNotice('All requests for this branch and date were marked delivered. TAFI stock was reduced by the requested quantities.')
	}

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-tabs" role="tablist" aria-label="Stock orders">
				<button
					type="button"
					id="tafi-stock-requests-tab"
					className={`accountant-inventory-tab${activeTab === 'requests' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'requests'}
					aria-controls="tafi-stock-requests-panel"
					onClick={() => setActiveTab('requests')}
				>
					Stock Requests
				</button>
				<button
					type="button"
					id="tafi-stock-deliver-tab"
					className={`accountant-inventory-tab${activeTab === 'deliver' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'deliver'}
					aria-controls="tafi-stock-deliver-panel"
					onClick={() => setActiveTab('deliver')}
				>
					Purchase Order Request Form ({pendingRequests.length})
				</button>
			</div>

			<div
				id="tafi-stock-requests-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-requests-tab"
				hidden={activeTab !== 'requests'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Branch stock requests</h2>
						<p>{filteredRequestGroups.length} orders · {filteredRequests.length} items</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={loadRequests}
						disabled={isLoading}
					>
						<RefreshCw size={16} aria-hidden="true" />
						{isLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}
				{!isLoading && requests.length > 0 && (
					<div className="tafi-stock-inventory-filters" role="search" aria-label="Filter stock requests">
						<label>
							<span>Search requests</span>
							<input
								type="search"
								value={searchTerm}
								onChange={(event) => setSearchTerm(event.target.value)}
								placeholder="Search branch or item"
							/>
						</label>
						<label>
							<span>Branch</span>
							<select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
								<option value="">All branches</option>
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
					<p className="accountant-inventory-empty" role="status">Loading stock requests...</p>
				) : filteredRequests.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Stock no.</th>
									<th scope="col">Description</th>
									<th scope="col">Unit</th>
									<th scope="col">Quantity requested</th>
									<th scope="col">Quantity delivered</th>
									<th scope="col">Quantity received</th>
									<th scope="col">Status</th>
								</tr>
							</thead>
							<tbody>
								{filteredRequests.map((request) => (
									<tr key={request.request_id}>
										<td>{request.stock_no}</td>
										<td>{request.item_description}</td>
										<td>{request.unit_of_measure}</td>
										<td>{request.quantity_requested}</td>
										<td>{request.quantity_delivered ?? '—'}</td>
										<td>{request.quantity_received ?? '—'}</td>
										<td>{request.status}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : errorMessage ? null : (
					<p className="accountant-inventory-empty">
						{requests.length ? 'No stock requests match those filters.' : 'No branch stock requests have been submitted yet.'}
					</p>
				)}
			</div>

			<div
				id="tafi-stock-deliver-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-deliver-tab"
				hidden={activeTab !== 'deliver'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Orders ready for delivery</h2>
						<p>Requests are grouped by branch and date, with one delivery action for each group.</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={loadRequests}
						disabled={isLoading}
					>
						<RefreshCw size={16} aria-hidden="true" />
						{isLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}
				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading delivery orders...</p>
				) : pendingDeliveryDates.length ? (
					<div className="tafi-stock-delivery-orders">
						{pendingDeliveryDates.map((dateGroup) => (
							<section className="tafi-stock-delivery-date-group" key={dateGroup.dateKey}>
								<h3 className="tafi-stock-delivery-date-heading">
									Request date: {requestDateLabelFormatter.format(
										new Date(dateGroup.createdAt)
									)}
								</h3>
								{dateGroup.batches.map((batch) => {
									const requiredByStockItem = new Map()
									batch.items.forEach((request) => {
										const stockItem = requiredByStockItem.get(request.stock_inventory_id) ?? {
											required: 0,
											available: Number(request.current_available)
										}
										stockItem.required += Number(request.quantity_requested)
										stockItem.available = Math.min(
											stockItem.available,
											Number(request.current_available)
										)
										requiredByStockItem.set(request.stock_inventory_id, stockItem)
									})
									const hasEnoughStock = [...requiredByStockItem.values()].every(
										({ required, available }) => available >= required
									)
									return (
										<section
											className="accountant-inventory-panel tafi-stock-delivery-branch"
											key={batch.key}
										>
											<div className="accountant-inventory-list-heading">
												<div>
													<h3>Branch: {batch.branchName}</h3>
												</div>
											</div>
											<div className="accountant-inventory-table-wrap">
												<table className="accountant-inventory-table">
													<thead>
														<tr>
															<th scope="col">Stock no.</th>
															<th scope="col">Description</th>
															<th scope="col">Unit</th>
															<th scope="col">Requested</th>
															<th scope="col">TAFI available</th>
														</tr>
													</thead>
													<tbody>
														{batch.items.map((request) => (
															<tr key={request.request_id}>
																<td>{request.stock_no}</td>
																<td>{request.item_description}</td>
																<td>{request.unit_of_measure}</td>
																<td>{request.quantity_requested}</td>
																<td>{request.current_available}</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
											{!hasEnoughStock && (
												<p className="accountant-inventory-error" role="status">
													Not enough TAFI stock to fulfill every request for this branch and date.
												</p>
											)}
											<button
												type="button"
												className="accountant-inventory-submit"
												disabled={Boolean(deliveringBatchKey) || !hasEnoughStock}
												onClick={() => handleDeliver(batch)}
											>
												{deliveringBatchKey === batch.key
													? 'Marking delivered...'
													: 'Mark delivered'}
											</button>
										</section>
									)
								})}
							</section>
						))}
					</div>
				) : (
					<p className="accountant-inventory-empty">No pending orders are waiting for delivery.</p>
				)}
			</div>
		</section>
	)
}