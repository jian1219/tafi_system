import { Fragment, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { deliverTafiAdminStockRequest, listTafiAdminStockRequests } from '../../lib/supabase'

const formatOrderNumber = (groupId) => groupId?.slice(0, 8).toUpperCase() ?? '—'
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
	const [deliveryQuantities, setDeliveryQuantities] = useState({})
	const [activeTab, setActiveTab] = useState('requests')
	const [isLoading, setIsLoading] = useState(true)
	const [deliveringRequestId, setDeliveringRequestId] = useState('')
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
	const requestDateGroups = useMemo(() => {
		const groups = new Map()
		filteredRequestGroups.forEach((group) => {
			const createdAt = group.items[0].created_at
			const dateKey = getRequestDateKey(createdAt)
			if (!groups.has(dateKey)) {
				groups.set(dateKey, { dateKey, createdAt, orderGroups: [] })
			}
			groups.get(dateKey).orderGroups.push(group)
		})
		return [...groups.values()].sort(
			(first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
		)
	}, [filteredRequestGroups])

	const pendingRequests = requests.filter((request) => request.status === 'pending')

	const handleDeliver = async (event, request) => {
		event.preventDefault()
		setDeliveringRequestId(request.request_id)
		setErrorMessage('')
		setNotice('')

		const quantityDelivered = Number(deliveryQuantities[request.request_id]
			?? Math.min(Number(request.quantity_requested), Number(request.current_available)))
		const { error } = await deliverTafiAdminStockRequest(sessionToken, request.request_id, quantityDelivered)
		if (error) {
			setDeliveringRequestId('')
			setErrorMessage(error.message)
			return
		}

		setRequests((current) => current.map((item) => item.request_id === request.request_id
			? {
				...item,
				status: 'delivered',
				quantity_delivered: quantityDelivered,
				current_available: Number(item.current_available) - quantityDelivered
			}
			: item))
		setDeliveryQuantities((current) => {
			const next = { ...current }
			delete next[request.request_id]
			return next
		})
		const refreshError = await loadRequests()
		setDeliveringRequestId('')
		if (refreshError) {
			setNotice('Order marked delivered, but the request list could not be refreshed.')
			return
		}
		setNotice('Order marked delivered. TAFI stock was reduced by the shipped quantity.')
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
									<th scope="col">Order no.</th>
									<th scope="col">Branch</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Description</th>
									<th scope="col">Unit</th>
									<th scope="col">Quantity requested</th>
									<th scope="col">Quantity delivered</th>
									<th scope="col">Quantity received</th>
									<th scope="col">Status</th>
									<th scope="col">Received on</th>
									<th scope="col">Requested on</th>
								</tr>
							</thead>
							{requestDateGroups.map(({ dateKey, createdAt, orderGroups }) => (
								<tbody className="tafi-stock-request-date-group" key={dateKey}>
									<tr className="tafi-stock-request-date-heading">
										<th scope="rowgroup" colSpan="11">
											{requestDateLabelFormatter.format(new Date(createdAt))}
										</th>
									</tr>
									{orderGroups.map(({ groupId, items }) => (
										<Fragment key={groupId}>
											<tr className="tafi-stock-request-group-heading">
												<th scope="row" colSpan="11">
													Order {formatOrderNumber(groupId)} — {items[0].branch_name}
													<span>{new Date(items[0].created_at).toLocaleString()}</span>
												</th>
											</tr>
											{items.map((request) => (
												<tr key={request.request_id}>
													<td>{formatOrderNumber(request.request_group_id)}</td>
													<td>{request.branch_name}</td>
													<td>{request.stock_no}</td>
													<td>{request.item_description}</td>
													<td>{request.unit_of_measure}</td>
													<td>{request.quantity_requested}</td>
													<td>{request.quantity_delivered ?? '—'}</td>
													<td>{request.quantity_received ?? '—'}</td>
													<td>{request.status}</td>
													<td>{request.received_at ? new Date(request.received_at).toLocaleString() : '—'}</td>
													<td>{new Date(request.created_at).toLocaleString()}</td>
												</tr>
											))}
										</Fragment>
									))}
								</tbody>
							))}
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
						<p>Enter the quantity shipped. TAFI stock is reduced when delivery is confirmed.</p>
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
				) : pendingRequests.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Order no.</th>
									<th scope="col">Branch</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Description</th>
									<th scope="col">Unit</th>
									<th scope="col">Requested</th>
									<th scope="col">TAFI available</th>
									<th scope="col">Quantity shipped</th>
									<th scope="col">Action</th>
								</tr>
							</thead>
							<tbody>
								{pendingRequests.map((request) => {
									const defaultQuantity = Math.min(
										Number(request.quantity_requested),
										Number(request.current_available)
									)
									const quantity = deliveryQuantities[request.request_id] ?? String(defaultQuantity)
									const quantityValue = Number(quantity)
									return (
										<tr key={request.request_id}>
											<td>{formatOrderNumber(request.request_group_id)}</td>
											<td>{request.branch_name}</td>
											<td>{request.stock_no}</td>
											<td>{request.item_description}</td>
											<td>{request.unit_of_measure}</td>
											<td>{request.quantity_requested}</td>
											<td>{request.current_available}</td>
											<td>
												<input
													type="number"
													min="0.001"
													max={defaultQuantity}
													step="0.001"
													aria-label={`Quantity shipped for ${request.branch_name}, ${request.stock_no}`}
													value={quantity}
													onChange={(event) => setDeliveryQuantities((current) => ({
														...current,
														[request.request_id]: event.target.value
													}))}
													disabled={Boolean(deliveringRequestId)}
												/>
											</td>
											<td>
												<button
													type="button"
													className="accountant-inventory-submit"
													disabled={
														Boolean(deliveringRequestId)
														|| defaultQuantity <= 0
														|| !quantity
														|| !Number.isFinite(quantityValue)
														|| quantityValue <= 0
														|| quantityValue > defaultQuantity
													}
													onClick={(event) => handleDeliver(event, request)}
												>
													{deliveringRequestId === request.request_id ? 'Saving...' : 'Mark delivered'}
												</button>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">No pending orders are waiting for delivery.</p>
				)}
			</div>
		</section>
	)
}