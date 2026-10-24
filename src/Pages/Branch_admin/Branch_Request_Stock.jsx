import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
	createBranchStockRequestBatch,
	listBranchStockReceiptHistory,
	listBranchStockRequests,
	listBranchTafiStockItems,
	receiveBranchStockRequest
} from '../../lib/supabase'
import {
	downloadBranchStockRequestWorkbook,
	getBranchStockRequestDate
} from './branchStockRequestXlsxExport'

let nextRequestLineId = 0

const createRequestLine = () => ({
	lineId: ++nextRequestLineId,
	stockInventoryId: '',
	quantityRequested: ''
})

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

const loadRequestData = async (sessionToken) => {
	const [stockResult, requestResult, historyResult] = await Promise.all([
		listBranchTafiStockItems(sessionToken),
		listBranchStockRequests(sessionToken),
		listBranchStockReceiptHistory(sessionToken)
	])
	return {
		stockItems: stockResult.data ?? [],
		requests: requestResult.data ?? [],
		history: historyResult.data ?? [],
		error: stockResult.error ?? requestResult.error ?? historyResult.error
	}
}

export default function BranchRequestStock({ branchName = 'Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [stockItems, setStockItems] = useState([])
	const [requests, setRequests] = useState([])
	const [receiptHistory, setReceiptHistory] = useState([])
	const [requestLines, setRequestLines] = useState(() => [createRequestLine()])
	const [isReviewingRequest, setIsReviewingRequest] = useState(false)
	const [categoryFilter, setCategoryFilter] = useState('')
	const [itemSearch, setItemSearch] = useState('')
	const [activeTab, setActiveTab] = useState('request')
	const [selectedRequestMonth, setSelectedRequestMonth] = useState('')
	const [receivedQuantities, setReceivedQuantities] = useState({})
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [receivingRequestId, setReceivingRequestId] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')
	const [pendingRequestExport, setPendingRequestExport] = useState(null)
	const [requestExportFormat, setRequestExportFormat] = useState('')
	const [requestExportError, setRequestExportError] = useState('')
	const [receiptError, setReceiptError] = useState('')
	const [receiptNotice, setReceiptNotice] = useState('')

	useEffect(() => {
		let isCurrent = true

		const load = async () => {
			const result = await loadRequestData(sessionToken)
			if (!isCurrent) return
			setIsLoading(false)
			if (result.error) {
				setErrorMessage(result.error.message)
				return
			}
			setStockItems(result.stockItems)
			setRequests(result.requests)
			setReceiptHistory(result.history)
			setErrorMessage('')
		}

		if (sessionToken) load()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	const categories = useMemo(
		() => [...new Set(stockItems.map((item) => item.category).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[stockItems]
	)

	const availableItemsByLine = useMemo(() => requestLines.map((line) => {
		const query = itemSearch.trim().toLocaleLowerCase()
		const selectedElsewhere = new Set(requestLines
			.filter((otherLine) => otherLine.lineId !== line.lineId)
			.map((otherLine) => otherLine.stockInventoryId)
			.filter(Boolean))

		return stockItems.filter((item) => {
			if (selectedElsewhere.has(item.stock_inventory_id)) return false
			if (item.stock_inventory_id === line.stockInventoryId) return true
			if (categoryFilter && item.category !== categoryFilter) return false
			if (!query) return true
			return [item.stock_no, item.item_description, item.unit_of_measure]
				.some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}), [categoryFilter, itemSearch, requestLines, stockItems])

	const deliveredRequests = requests.filter((request) => request.status === 'delivered')
	const requestGroups = useMemo(() => {
		const groups = new Map()
		requests.forEach((request) => {
			const groupId = request.request_group_id ?? request.request_id
			if (!groups.has(groupId)) groups.set(groupId, [])
			groups.get(groupId).push(request)
		})
		return [...groups.entries()].map(([groupId, items]) => ({ groupId, items }))
	}, [requests])
	const filteredRequestGroups = useMemo(() => requestGroups.filter((group) => (
		!selectedRequestMonth
		|| getRequestDateKey(group.items[0].created_at).startsWith(selectedRequestMonth)
	)), [requestGroups, selectedRequestMonth])
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
	const requestGroupCount = filteredRequestGroups.length
	const displayedRequestCount = filteredRequestGroups.reduce(
		(total, group) => total + group.items.length,
		0
	)

	const handleSubmit = async (event) => {
		event.preventDefault()
		setErrorMessage('')
		setNotice('')

		const selectedStockIds = requestLines.map((line) => line.stockInventoryId)
		const hasDuplicateItems = new Set(selectedStockIds).size !== selectedStockIds.length
		const hasInvalidLine = requestLines.some((line) => (
			!line.stockInventoryId
			|| !Number.isFinite(Number(line.quantityRequested))
			|| Number(line.quantityRequested) <= 0
		))
		if (hasDuplicateItems || hasInvalidLine) {
			setErrorMessage(hasDuplicateItems
				? 'Choose a different stock item for each request line.'
				: 'Select an item and enter a requested quantity greater than zero for every line.')
			return
		}

		const requestedItems = requestLines.map((line) => {
			const stockItem = stockItems.find((item) => item.stock_inventory_id === line.stockInventoryId)
			return stockItem ? {
				stockNo: stockItem.stock_no,
				description: stockItem.item_description,
				unit: stockItem.unit_of_measure,
				quantityRequested: Number(line.quantityRequested),
				currentStock: stockItem.onhand
			} : null
		})
		if (requestedItems.some((item) => !item)) {
			setErrorMessage('A selected TAFI stock item could not be found. Refresh the page and try again.')
			return
		}

		if (!isReviewingRequest) {
			setIsReviewingRequest(true)
			return
		}

		const requestDate = getBranchStockRequestDate()
		setIsSubmitting(true)
		const { error } = await createBranchStockRequestBatch(
			sessionToken,
			requestLines.map((line) => ({
				stockInventoryId: line.stockInventoryId,
				quantityRequested: Number(line.quantityRequested)
			}))
		)
		if (error) {
			setIsSubmitting(false)
			setErrorMessage(error.message)
			return
		}

		const submittedItemCount = requestLines.length
		setRequestLines([createRequestLine()])
		setIsReviewingRequest(false)
		const result = await loadRequestData(sessionToken)
		setIsSubmitting(false)
		if (result.error) {
			setPendingRequestExport({ branchName, requestedItems, requestDate, submittedItemCount })
			setRequestExportError('')
			setErrorMessage(result.error.message)
			setNotice('Request submitted, but the request list could not be refreshed. You can still download the Excel requisition.')
			return
		}

		setStockItems(result.stockItems)
		setRequests(result.requests)
		setReceiptHistory(result.history)
		setPendingRequestExport({ branchName, requestedItems, requestDate, submittedItemCount })
		setRequestExportError('')
		setNotice(`${submittedItemCount} item${submittedItemCount === 1 ? '' : 's'} submitted in one stock request to TAFI Admin. Download the Excel requisition from the prompt.`)
	}

	const handleDownloadRequestExport = async () => {
		if (!pendingRequestExport || requestExportFormat) return
		setRequestExportFormat('xlsx')
		setRequestExportError('')

		try {
			const fileName = await downloadBranchStockRequestWorkbook(
				pendingRequestExport.branchName,
				pendingRequestExport.requestedItems,
				pendingRequestExport.requestDate
			)
			setNotice(
				`${pendingRequestExport.submittedItemCount} item${pendingRequestExport.submittedItemCount === 1 ? '' : 's'} submitted in one stock request to TAFI Admin. Downloaded ${fileName}.`
			)
			setPendingRequestExport(null)
		} catch (error) {
			setRequestExportError(
				error instanceof Error ? error.message : 'Unable to prepare the requested download.'
			)
		} finally {
			setRequestExportFormat('')
		}
	}

	const cancelRequestExport = () => {
		if (!pendingRequestExport || requestExportFormat) return
		setNotice(
			`${pendingRequestExport.submittedItemCount} item${pendingRequestExport.submittedItemCount === 1 ? '' : 's'} submitted in one stock request to TAFI Admin. No file was downloaded.`
		)
		setPendingRequestExport(null)
		setRequestExportError('')
	}

	const handleReceive = async (request) => {
		const quantityInput = receivedQuantities[request.request_id]
		const quantityReceived = Number(quantityInput)
		if (
			quantityInput === undefined
			|| quantityInput === ''
			|| !Number.isFinite(quantityReceived)
			|| quantityReceived < 0
			|| quantityReceived > Number(request.quantity_delivered)
		) {
			setReceiptError(`Enter the counted quantity received (0 to ${request.quantity_delivered}) before confirming.`)
			setReceiptNotice('')
			return
		}

		setReceivingRequestId(request.request_id)
		setReceiptError('')
		setReceiptNotice('')

		const { error } = await receiveBranchStockRequest(
			sessionToken,
			request.request_id,
			quantityReceived
		)
		if (error) {
			setReceivingRequestId('')
			setReceiptError(error.message)
			return
		}

		setRequests((current) => current.map((item) => item.request_id === request.request_id
			? { ...item, status: 'received', quantity_received: Number(receivedQuantities[request.request_id]) }
			: item))
		setReceivedQuantities((current) => {
			const next = { ...current }
			delete next[request.request_id]
			return next
		})
		const result = await loadRequestData(sessionToken)
		setReceivingRequestId('')
		if (result.error) {
			setReceiptError(result.error.message)
			setReceiptNotice('Receipt saved and branch stock updated, but the history could not be refreshed.')
			return
		}

		setStockItems(result.stockItems)
		setRequests(result.requests)
		setReceiptHistory(result.history)
		setReceiptNotice('Receipt confirmed. Counted quantity added to branch inventory.')
	}

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-tabs" role="tablist" aria-label="Branch stock requests">
				<button
					type="button"
					id="branch-stock-request-tab"
					className={`accountant-inventory-tab${activeTab === 'request' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'request'}
					aria-controls="branch-stock-request-panel"
					onClick={() => setActiveTab('request')}
				>
					Request Stock
				</button>
				<button
					type="button"
					id="branch-stock-my-requests-tab"
					className={`accountant-inventory-tab${activeTab === 'my-requests' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'my-requests'}
					aria-controls="branch-stock-my-requests-panel"
					onClick={() => setActiveTab('my-requests')}
				>
					My Request Stock
				</button>
				<button
					type="button"
					id="branch-stock-receive-tab"
					className={`accountant-inventory-tab${activeTab === 'receive' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'receive'}
					aria-controls="branch-stock-receive-panel"
					onClick={() => setActiveTab('receive')}
				>
					Receive Orders ({deliveredRequests.length})
				</button>
			</div>

			<div
				id="branch-stock-request-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="branch-stock-request-tab"
				hidden={activeTab !== 'request'}
			>
				<div className="accountant-inventory-heading">
					<div>
						<h2>Request stock for {branchName}</h2>
						<p>Add one or more TAFI stock items, review the details, then submit them together as one request.</p>
					</div>
				</div>

				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}

				<form className="accountant-inventory-form branch-stock-request-form" onSubmit={handleSubmit}>
					{isReviewingRequest ? (
						<>
							<h3>Review stock request</h3>
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Stock no.</th>
											<th scope="col">Description</th>
											<th scope="col">Unit</th>
											<th scope="col">Quantity requested</th>
										</tr>
									</thead>
									<tbody>
										{requestLines.map((line) => {
											const item = stockItems.find(
												(stockItem) => stockItem.stock_inventory_id === line.stockInventoryId
											)
											return (
												<tr key={line.lineId}>
													<td>{item?.stock_no ?? '—'}</td>
													<td>{item?.item_description ?? '—'}</td>
													<td>{item?.unit_of_measure ?? '—'}</td>
													<td>{line.quantityRequested}</td>
												</tr>
											)
										})}
									</tbody>
								</table>
							</div>
							<button
								type="button"
								className="accountant-inventory-add-toggle"
								onClick={() => {
									setIsReviewingRequest(false)
									setErrorMessage('')
								}}
								disabled={isSubmitting}
							>
								Back to edit
							</button>
							<button
								type="submit"
								className="accountant-inventory-submit"
								disabled={isLoading || isSubmitting}
							>
								{isSubmitting ? 'Submitting...' : 'Submit stock request'}
							</button>
						</>
					) : (
						<>
							<div className="branch-stock-request-filters">
								<label>
									<span>Filter by category</span>
									<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
										<option value="">All categories</option>
										{categories.map((category) => (
											<option key={category} value={category}>{category}</option>
										))}
									</select>
								</label>
								<label>
									<span>Search inventory</span>
									<input
										type="search"
										value={itemSearch}
										onChange={(event) => setItemSearch(event.target.value)}
										placeholder="Search stock number or description"
									/>
								</label>
							</div>
							{requestLines.map((line, index) => {
								const selectedItem = stockItems.find((item) => item.stock_inventory_id === line.stockInventoryId)
								return (
									<fieldset className="branch-stock-request-line" key={line.lineId}>
										<legend>Request item {index + 1}</legend>
										<div className="branch-stock-request-fields">
											<label>
												<span>Description</span>
												<select
													value={line.stockInventoryId}
													onChange={(event) => {
														setRequestLines((current) => current.map((item) => (
															item.lineId === line.lineId
																? { ...item, stockInventoryId: event.target.value }
																: item
														)))
														setErrorMessage('')
													}}
													required
												>
													<option value="">Select an item</option>
													{availableItemsByLine[index].map((item) => (
														<option key={item.stock_inventory_id} value={item.stock_inventory_id}>
															{item.item_description}
														</option>
													))}
												</select>
											</label>
											<label>
												<span>Stock no.</span>
												<input value={selectedItem?.stock_no ?? ''} readOnly />
											</label>
											<label>
												<span>Unit</span>
												<input value={selectedItem?.unit_of_measure ?? ''} readOnly />
											</label>
											<label>
												<span>Available stock (TAFI)</span>
												<input value={selectedItem?.available ?? ''} readOnly />
											</label>
											<label>
												<span>Quantity requested</span>
												<input
													type="number"
													min="0.001"
													step="0.001"
													value={line.quantityRequested}
													onChange={(event) => {
														setRequestLines((current) => current.map((item) => (
															item.lineId === line.lineId
																? { ...item, quantityRequested: event.target.value }
																: item
														)))
														setErrorMessage('')
													}}
													required
												/>
											</label>
										</div>
										{requestLines.length > 1 && (
											<button
												type="button"
												className="branch-stock-remove-line"
												onClick={() => {
													setRequestLines((current) => current.filter((item) => item.lineId !== line.lineId))
													setErrorMessage('')
												}}
												disabled={isSubmitting}
											>
												<Trash2 size={15} aria-hidden="true" />
												Remove item
											</button>
										)}
									</fieldset>
								)
							})}
							<button
								type="button"
								className="branch-stock-add-line"
								onClick={() => {
									setRequestLines((current) => [...current, createRequestLine()])
									setErrorMessage('')
								}}
								disabled={isSubmitting}
							>
								<Plus size={16} aria-hidden="true" />
								Add another item
							</button>
							<button
								type="submit"
								className="accountant-inventory-submit"
								disabled={isLoading || isSubmitting || Boolean(errorMessage)}
							>
								Continue
							</button>
						</>
					)}
				</form>
			</div>

			<div
				id="branch-stock-my-requests-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="branch-stock-my-requests-tab"
				hidden={activeTab !== 'my-requests'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>My stock requests</h2>
						<p>
							{requestGroupCount} order
							{requestGroupCount === 1 ? '' : 's'}
							, {displayedRequestCount} item{displayedRequestCount === 1 ? '' : 's'}
						</p>
					</div>
					<label className="branch-inventory-history-date">
						<span>Filter by month</span>
						<input
							type="month"
							value={selectedRequestMonth}
							onChange={(event) => setSelectedRequestMonth(event.target.value)}
						/>
					</label>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						disabled={!selectedRequestMonth}
						onClick={() => setSelectedRequestMonth('')}
					>
						All months
					</button>
				</div>
				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading stock requests...</p>
				) : filteredRequestGroups.length ? (
					<div className="accountant-inventory-table-wrap">
						{requestDateGroups.map(({ dateKey, createdAt, orderGroups }) => {
							const statuses = new Set(orderGroups.flatMap(({ items }) => (
								items.map((request) => request.status)
							)))
							const [groupStatus] = statuses
							const status = statuses.size === 1
								? `${groupStatus.charAt(0).toUpperCase()}${groupStatus.slice(1)}`
								: 'Mixed'
							return (
								<section className="branch-stock-request-date-group" key={dateKey}>
									<div className="branch-stock-request-date-heading">
										<strong>
											{requestDateLabelFormatter.format(new Date(createdAt))}
										</strong>
										<span className="branch-stock-request-date-status">{status}</span>
									</div>
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Stock no.</th>
												<th scope="col">Description</th>
												<th scope="col">Unit</th>
												<th scope="col">Quantity requested</th>
												<th scope="col">Quantity delivered</th>
												<th scope="col">Requested on</th>
											</tr>
										</thead>
										<tbody>
											{orderGroups.map(({ groupId, items }) => (
												<Fragment key={groupId}>
													{items.map((request) => (
														<tr key={request.request_id}>
															<td>{request.stock_no}</td>
															<td>{request.item_description}</td>
															<td>{request.unit_of_measure}</td>
															<td>{request.quantity_requested}</td>
															<td>{request.quantity_delivered ?? '—'}</td>
															<td>{new Date(request.created_at).toLocaleString()}</td>
														</tr>
													))}
												</Fragment>
											))}
										</tbody>
									</table>
								</section>
							)
						})}
					</div>
				) : requests.length ? (
					<p className="accountant-inventory-empty">
						No stock requests were found for {selectedRequestMonth}.
					</p>
				) : (
					<p className="accountant-inventory-empty">No stock requests have been submitted yet.</p>
				)}
			</div>

			<div
				id="branch-stock-receive-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="branch-stock-receive-tab"
				hidden={activeTab !== 'receive'}
			>
				<div className="accountant-inventory-heading">
					<div>
						<h2>Orders delivered to {branchName}</h2>
						<p>Count each delivery and enter the actual quantity received before confirming.</p>
					</div>
				</div>
				{receiptError && <p className="accountant-inventory-error" role="alert">{receiptError}</p>}
				{receiptNotice && <p className="accountant-inventory-notice" role="status">{receiptNotice}</p>}

				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading delivered orders...</p>
				) : deliveredRequests.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Order no.</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Description</th>
									<th scope="col">Unit</th>
									<th scope="col">Quantity shipped</th>
									<th scope="col">Counted quantity received</th>
									<th scope="col">Action</th>
								</tr>
							</thead>
							<tbody>
								{deliveredRequests.map((request) => (
									<tr key={request.request_id}>
										<td>{formatOrderNumber(request.request_group_id)}</td>
										<td>{request.stock_no}</td>
										<td>{request.item_description}</td>
										<td>{request.unit_of_measure}</td>
										<td>{request.quantity_delivered}</td>
										<td>
											<label className="branch-stock-received-field">
												<span>Counted quantity received</span>
												<input
													className="branch-stock-received-input"
													type="number"
													min="0"
													max={request.quantity_delivered}
													step="0.001"
													placeholder="Enter quantity"
													aria-label={`Counted quantity received for ${request.stock_no}`}
													value={receivedQuantities[request.request_id] ?? ''}
													onChange={(event) => setReceivedQuantities((current) => ({
														...current,
														[request.request_id]: event.target.value
													}))}
													disabled={Boolean(receivingRequestId)}
												/>
											</label>
										</td>
										<td>
											<button
												type="button"
												className="accountant-inventory-submit"
												disabled={Boolean(receivingRequestId)}
												onClick={() => handleReceive(request)}
											>
												{receivingRequestId === request.request_id ? 'Receiving...' : 'Confirm receive'}
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">No delivered orders are waiting to be received.</p>
				)}

				<div className="accountant-inventory-heading">
					<div>
						<h2>Receipt history</h2>
						<p>{receiptHistory.length} receipt{receiptHistory.length === 1 ? '' : 's'}</p>
					</div>
				</div>
				{receiptHistory.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Received on</th>
									<th scope="col">Order no.</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Description</th>
									<th scope="col">Unit</th>
									<th scope="col">Requested</th>
									<th scope="col">Shipped</th>
									<th scope="col">Counted received</th>
								</tr>
							</thead>
							<tbody>
								{receiptHistory.map((receipt) => (
									<tr key={receipt.receipt_id}>
										<td>{new Date(receipt.received_at).toLocaleString()}</td>
										<td>{formatOrderNumber(receipt.request_group_id)}</td>
										<td>{receipt.stock_no}</td>
										<td>{receipt.item_description}</td>
										<td>{receipt.unit_of_measure}</td>
										<td>{receipt.quantity_requested}</td>
										<td>{receipt.quantity_delivered}</td>
										<td>{receipt.quantity_received}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">No receipt history yet.</p>
				)}
			</div>
			{pendingRequestExport && (
				<div
					className="payroll-xlsx-dialog-backdrop"
					role="presentation"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) cancelRequestExport()
					}}
				>
					<section
						className="payroll-xlsx-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="branch-stock-request-export-title"
					>
						<div className="payroll-xlsx-dialog-heading">
							<div>
								<h4 id="branch-stock-request-export-title">Download the requisition</h4>
								<p>Your stock request was submitted. Download the requisition as an Excel workbook.</p>
							</div>
							<button
								type="button"
								className="payroll-xlsx-dialog-close"
								aria-label="Close download prompt"
								onClick={cancelRequestExport}
								disabled={Boolean(requestExportFormat)}
							>
								×
							</button>
						</div>
						{requestExportError && (
							<p className="accountant-inventory-error" role="alert">{requestExportError}</p>
						)}
						<div className="payroll-xlsx-dialog-actions">
							<button
								type="button"
								className="payroll-xlsx-cancel-button"
								onClick={cancelRequestExport}
								disabled={Boolean(requestExportFormat)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="report-download-button"
								onClick={handleDownloadRequestExport}
								disabled={Boolean(requestExportFormat)}
							>
								{requestExportFormat === 'xlsx' ? 'Preparing Excel...' : 'Download Excel (.xlsx)'}
							</button>
						</div>
					</section>
				</div>
			)}
		</section>
	)
}