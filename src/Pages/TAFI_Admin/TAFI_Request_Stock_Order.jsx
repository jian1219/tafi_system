import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import {
	completeTafiAdminStockRequestPreparation,
	deleteTafiAdminStockRequestPreparationItem,
	listTafiAdminStockRequestPreparationItems,
	listTafiAdminStockRequestPreparationHistory,
	listTafiAdminStockRequests,
	lookupTafiAdminStockRequestBarcode,
	saveTafiAdminStockRequestPreparationItem,
	startTafiAdminStockRequestPreparation
} from '../../lib/supabase'

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
	const [branchFilter, setBranchFilter] = useState('')
	const [selectedMonth, setSelectedMonth] = useState('')
	const [activeTab, setActiveTab] = useState('requests')
	const [isLoading, setIsLoading] = useState(true)
	const [preparationId, setPreparationId] = useState('')
	const [preparationItems, setPreparationItems] = useState([])
	const [preparationHistory, setPreparationHistory] = useState([])
	const [isLoadingPreparationHistory, setIsLoadingPreparationHistory] = useState(true)
	const [isLoadingPreparationItems, setIsLoadingPreparationItems] = useState(false)
	const [preparingBatchKey, setPreparingBatchKey] = useState('')
	const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false)
	const [isSavingPreparedItem, setIsSavingPreparedItem] = useState(false)
	const [isCompletingPreparation, setIsCompletingPreparation] = useState(false)
	const [removingPreparationItemId, setRemovingPreparationItemId] = useState('')
	const [barcodeInput, setBarcodeInput] = useState('')
	const [scannedBarcodeItem, setScannedBarcodeItem] = useState(null)
	const [preparedQuantity, setPreparedQuantity] = useState('1')
	const [unitPrice, setUnitPrice] = useState('')
	const barcodeInputRef = useRef(null)
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
			const [requestResult, historyResult] = await Promise.all([
				listTafiAdminStockRequests(sessionToken),
				listTafiAdminStockRequestPreparationHistory(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)
			setIsLoadingPreparationHistory(false)
			if (requestResult.error) {
				setErrorMessage(requestResult.error.message)
			} else {
				setRequests(requestResult.data ?? [])
				setErrorMessage('')
			}
			if (historyResult.error) {
				setErrorMessage((current) => current || historyResult.error.message)
			} else {
				setPreparationHistory(historyResult.data ?? [])
			}
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
		return requests.filter((request) => {
			if (!branchFilter || request.branch_name !== branchFilter) return false
			if (selectedMonth && !getRequestDateKey(request.created_at).startsWith(selectedMonth)) return false
			return true
		})
	}, [branchFilter, requests, selectedMonth])

	const filteredRequestsByDate = useMemo(() => {
		const groups = new Map()
		filteredRequests.forEach((request) => {
			const dateKey = getRequestDateKey(request.created_at)
			if (!groups.has(dateKey)) groups.set(dateKey, [])
			groups.get(dateKey).push(request)
		})
		return [...groups.entries()]
			.sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
			.map(([dateKey, items]) => ({ dateKey, items }))
	}, [filteredRequests])

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
	const preparingDeliveryBatches = useMemo(() => {
		const groups = new Map()
		requests.filter((request) => request.status === 'preparing').forEach((request) => {
			const dateKey = getRequestDateKey(request.created_at)
			const groupId = request.preparation_id ?? JSON.stringify([
				dateKey,
				request.branch_id ?? request.branch_name
			])
			if (!groups.has(groupId)) {
				groups.set(groupId, {
					key: groupId,
					preparationId: request.preparation_id ?? '',
					dateKey,
					branchName: request.branch_name,
					createdAt: request.created_at,
					items: []
				})
			}
			groups.get(groupId).items.push(request)
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

	const activePreparationRequests = useMemo(
		() => requests.filter((request) => (
			request.status === 'preparing' && request.preparation_id === preparationId
		)),
		[preparationId, requests]
	)
	const requiredPreparationByStock = useMemo(() => {
		const grouped = new Map()
		activePreparationRequests.forEach((request) => {
			const current = grouped.get(request.stock_inventory_id) ?? {
				stockInventoryId: request.stock_inventory_id,
				stockNo: request.stock_no,
				description: request.item_description,
				unit: request.unit_of_measure,
				requested: 0,
				prepared: 0
			}
			current.requested += Number(request.quantity_requested)
			grouped.set(request.stock_inventory_id, current)
		})
		preparationItems.forEach((item) => {
			const current = grouped.get(item.stock_inventory_id)
			if (current) current.prepared += Number(item.quantity)
		})
		return [...grouped.values()].sort((first, second) => first.stockNo.localeCompare(second.stockNo))
	}, [activePreparationRequests, preparationItems])
	const isPreparationComplete = activePreparationRequests.length > 0
		&& requiredPreparationByStock.every((item) => item.prepared === item.requested)

	const loadPreparationItems = useCallback(async (nextPreparationId) => {
		if (!nextPreparationId) {
			setPreparationItems([])
			return null
		}
		setIsLoadingPreparationItems(true)
		const { data, error } = await listTafiAdminStockRequestPreparationItems(
			sessionToken,
			nextPreparationId
		)
		setIsLoadingPreparationItems(false)
		if (error) {
			setErrorMessage(error.message)
			return error
		}
		setPreparationItems(data ?? [])
		return null
	}, [sessionToken])

	const loadPreparationHistory = useCallback(async () => {
		const { data, error } = await listTafiAdminStockRequestPreparationHistory(sessionToken)
		setIsLoadingPreparationHistory(false)
		if (error) {
			setErrorMessage(error.message)
			return error
		}
		setPreparationHistory(data ?? [])
		return null
	}, [sessionToken])

	const openPreparation = (nextPreparationId) => {
		setErrorMessage('')
		setNotice('')
		setScannedBarcodeItem(null)
		setBarcodeInput('')
		setPreparationItems([])
		setPreparationId(nextPreparationId)
		setActiveTab('transform')
		loadPreparationItems(nextPreparationId)
	}

	const handleStartPreparation = async (batch) => {
		setPreparingBatchKey(batch.key)
		setErrorMessage('')
		setNotice('')

		const requestIds = batch.items.map((request) => request.request_id)
		const { data, error } = await startTafiAdminStockRequestPreparation(sessionToken, requestIds)
		if (error) {
			setPreparingBatchKey('')
			setErrorMessage(error.message)
			return
		}
		const nextPreparationId = Array.isArray(data) ? data[0] : data
		if (!nextPreparationId) {
			setPreparingBatchKey('')
			setErrorMessage('Preparation started without returning an ID. Refresh the request list before continuing.')
			return
		}
		const requestIdSet = new Set(requestIds)
		setRequests((current) => current.map((request) => requestIdSet.has(request.request_id)
			? {
				...request,
				status: 'preparing',
				preparation_id: nextPreparationId
			}
			: request))
		setPreparationId(nextPreparationId)
		setPreparationItems([])
		setActiveTab('transform')
		const refreshError = await loadRequests()
		await loadPreparationItems(nextPreparationId)
		setPreparingBatchKey('')
		if (refreshError) {
			setNotice('Preparation started, but the request list could not be refreshed.')
			return
		}
		setNotice('Preparation started. Scan and record the requested quantities before delivery.')
	}

	const handleLookupBarcode = async (event) => {
		event.preventDefault()
		if (!barcodeInput.trim() || !preparationId) return

		setIsLookingUpBarcode(true)
		setErrorMessage('')
		setScannedBarcodeItem(null)
		const { data, error } = await lookupTafiAdminStockRequestBarcode(
			sessionToken,
			preparationId,
			barcodeInput.trim()
		)
		setIsLookingUpBarcode(false)
		if (error) {
			setErrorMessage(error.message)
			return
		}
		const item = Array.isArray(data) ? data[0] : data
		if (!item) {
			setErrorMessage('No matching barcode item was returned.')
			return
		}
		setScannedBarcodeItem(item)
		setPreparedQuantity('1')
		setUnitPrice(item.price === null || item.price === undefined ? '' : String(item.price))
		setBarcodeInput('')
	}

	const handleSavePreparedItem = async (event) => {
		event.preventDefault()
		if (!scannedBarcodeItem || !preparationId) return
		if (!Number.isInteger(Number(preparedQuantity)) || Number(preparedQuantity) <= 0) {
			setErrorMessage('Enter a whole-number quantity greater than zero.')
			return
		}
		if (unitPrice !== '' && (
			!Number.isFinite(Number(unitPrice))
			|| Number(unitPrice) < 0
			|| Math.round(Number(unitPrice) * 100) !== Number(unitPrice) * 100
		)) {
			setErrorMessage('Enter a nonnegative unit price with no more than two decimal places, or leave it blank.')
			return
		}

		setIsSavingPreparedItem(true)
		setErrorMessage('')
		const { error } = await saveTafiAdminStockRequestPreparationItem(
			sessionToken,
			preparationId,
			scannedBarcodeItem.barcode,
			Number(preparedQuantity),
			unitPrice === '' ? null : Number(unitPrice)
		)
		setIsSavingPreparedItem(false)
		if (error) {
			setErrorMessage(error.message)
			return
		}
		setScannedBarcodeItem(null)
		setPreparedQuantity('1')
		setUnitPrice('')
		const refreshError = await loadPreparationItems(preparationId)
		if (!refreshError) {
			barcodeInputRef.current?.focus()
		}
	}

	const handleRemovePreparedItem = async (item) => {
		setRemovingPreparationItemId(item.item_id)
		setErrorMessage('')
		const { error } = await deleteTafiAdminStockRequestPreparationItem(
			sessionToken,
			preparationId,
			item.item_id
		)
		setRemovingPreparationItemId('')
		if (error) {
			setErrorMessage(error.message)
			return
		}
		setPreparationItems((current) => current.filter((entry) => entry.item_id !== item.item_id))
	}

	const handleCompletePreparation = async () => {
		if (!preparationId || !isPreparationComplete) return
		const deliveredRequestIds = new Set(
			activePreparationRequests.map((request) => request.request_id)
		)
		setIsCompletingPreparation(true)
		setErrorMessage('')
		setNotice('')
		const { error } = await completeTafiAdminStockRequestPreparation(
			sessionToken,
			preparationId
		)
		setIsCompletingPreparation(false)
		if (error) {
			setErrorMessage(error.message)
			return
		}
		setPreparationId('')
		setPreparationItems([])
		setRequests((current) => current.map((request) => deliveredRequestIds.has(request.request_id)
			? {
				...request,
				status: 'delivered',
				quantity_delivered: request.quantity_requested
			}
			: request))
		const refreshError = await loadRequests()
		const historyError = await loadPreparationHistory()
		if (refreshError) {
			setNotice('The stock was marked delivered, but the request list could not be refreshed.')
			return
		}
		setActiveTab('deliver')
		setNotice(historyError
			? 'Prepared quantities were deducted from TAFI barcode stock and marked delivered, but the transform history could not be refreshed.'
			: 'Prepared quantities were deducted from TAFI barcode stock and marked delivered.')
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
				<button
					type="button"
					id="tafi-stock-transform-tab"
					className={`accountant-inventory-tab${activeTab === 'transform' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'transform'}
					aria-controls="tafi-stock-transform-panel"
					onClick={() => setActiveTab('transform')}
				>
					Inventory Transform Form
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
					<div className="tafi-stock-inventory-filters">
						<label>
							<span>Branch</span>
							<select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
								<option value="" disabled>Select a branch</option>
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
					<div className="tafi-stock-delivery-orders">
						{filteredRequestsByDate.map((dateGroup) => (
							<section className="tafi-stock-delivery-date-group" key={dateGroup.dateKey}>
								<h3 className="tafi-stock-delivery-date-heading">
									Request date: {requestDateLabelFormatter.format(
										new Date(`${dateGroup.dateKey}T12:00:00+08:00`)
									)}
								</h3>
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
											{dateGroup.items.map((request) => (
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
							</section>
						))}
					</div>
				) : errorMessage ? null : (
					<p className="accountant-inventory-empty">
						{requests.length
							? branchFilter
								? 'No stock requests match those filters.'
								: 'Select a branch to view stock requests.'
							: 'No branch stock requests have been submitted yet.'}
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
						<h2>Orders ready for preparation</h2>
						<p>Prepare each branch and date request by scanning the requested TAFI items before delivery.</p>
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
				) : (
					<>
						{pendingDeliveryDates.map((dateGroup) => (
							<section className="tafi-stock-delivery-date-group" key={dateGroup.dateKey}>
								<h3 className="tafi-stock-delivery-date-heading">
									Request date: {requestDateLabelFormatter.format(
										new Date(`${dateGroup.dateKey}T12:00:00+08:00`)
									)}
								</h3>
								{dateGroup.batches.map((batch) => (
									<section
										className="accountant-inventory-panel tafi-stock-delivery-branch"
										key={batch.key}
									>
										<div className="accountant-inventory-list-heading">
											<div>
												<h3>Branch: {batch.branchName}</h3>
												<p>{batch.items.length} requested item lines</p>
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
										<button
											type="button"
											className="accountant-inventory-submit"
											disabled={Boolean(preparingBatchKey)}
											onClick={() => handleStartPreparation(batch)}
										>
											{preparingBatchKey === batch.key ? 'Starting preparation...' : 'Preparing'}
										</button>
									</section>
								))}
							</section>
						))}

						{preparingDeliveryBatches.length > 0 && (
							<section className="tafi-stock-preparing-orders">
								<h3>Preparation in progress</h3>
								{preparingDeliveryBatches.map((batch) => (
									<section
										className="accountant-inventory-panel tafi-stock-delivery-branch"
										key={batch.key}
									>
										<div className="accountant-inventory-list-heading">
											<div>
												<h3>Branch: {batch.branchName}</h3>
												<p>
													Request date: {requestDateLabelFormatter.format(
														new Date(`${batch.dateKey}T12:00:00+08:00`)
													)}
												</p>
											</div>
										</div>
										<button
											type="button"
											className="accountant-inventory-add-toggle"
											onClick={() => openPreparation(batch.preparationId)}
											disabled={!batch.preparationId}
										>
											Continue preparing
										</button>
									</section>
								))}
							</section>
						)}

						{!pendingDeliveryDates.length && !preparingDeliveryBatches.length && (
							<p className="accountant-inventory-empty">
								No pending orders are waiting for preparation.
							</p>
						)}
					</>
				)}
			</div>

			<div
				id="tafi-stock-transform-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-transform-tab"
				hidden={activeTab !== 'transform'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Inventory Transform Form</h2>
						<p>Scan the requested barcode items, enter prepared quantities, and confirm unit prices if needed.</p>
					</div>
				</div>
				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}

				{!preparationId ? (
					<>
						{preparingDeliveryBatches.length ? (
							<div className="tafi-stock-preparing-orders">
								<p className="accountant-inventory-empty">
									Choose a preparation in progress to reopen its scan list.
								</p>
								{preparingDeliveryBatches.map((batch) => (
									<section
										className="accountant-inventory-panel tafi-stock-delivery-branch"
										key={batch.key}
									>
										<div className="accountant-inventory-list-heading">
											<div>
												<h3>Branch: {batch.branchName}</h3>
												<p>
													{requestDateLabelFormatter.format(
														new Date(`${batch.dateKey}T12:00:00+08:00`)
													)}
												</p>
											</div>
										</div>
										<button
											type="button"
											className="accountant-inventory-add-toggle"
											onClick={() => openPreparation(batch.preparationId)}
											disabled={!batch.preparationId}
										>
											Open preparation
										</button>
									</section>
								))}
							</div>
						) : (
							<p className="accountant-inventory-empty">
								Start a preparation from the Purchase Order Request Form to open its scan list.
							</p>
						)}

						<section className="tafi-stock-preparing-orders">
							<h3>Completed Inventory Transform Form records</h3>
							{isLoadingPreparationHistory ? (
								<p className="accountant-inventory-empty" role="status">
									Loading transform history...
								</p>
							) : preparationHistory.length ? (
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Branch</th>
												<th scope="col">Request date</th>
												<th scope="col">Stock no.</th>
												<th scope="col">Category</th>
												<th scope="col">Item description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Quantity</th>
												<th scope="col">Unit price</th>
												<th scope="col">Barcode</th>
											</tr>
										</thead>
										<tbody>
											{preparationHistory.map((item) => (
												<tr key={`${item.preparation_id}-${item.barcode}`}>
													<td>{item.branch_name}</td>
													<td>{item.request_date}</td>
													<td>{item.stock_no}</td>
													<td>{item.category || '—'}</td>
													<td>{item.item_description}</td>
													<td>{item.unit_of_measure}</td>
													<td>{item.quantity}</td>
													<td>{item.unit_price ?? '—'}</td>
													<td>{item.barcode}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : (
								<p className="accountant-inventory-empty">
									No completed transform records are available.
								</p>
							)}
						</section>
					</>
				) : activePreparationRequests.length ? (
					<>
						<div className="accountant-inventory-panel tafi-stock-preparation-card">
							<div className="accountant-inventory-list-heading">
								<div>
									<h3>Preparing for {activePreparationRequests[0].branch_name}</h3>
									<p>
										Request date: {requestDateLabelFormatter.format(
											new Date(`${getRequestDateKey(activePreparationRequests[0].created_at)}T12:00:00+08:00`)
										)}
									</p>
								</div>
								<button
									type="button"
									className="accountant-inventory-add-toggle"
									onClick={() => setPreparationId('')}
								>
									Close
								</button>
							</div>

							<h3>Requested quantities</h3>
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Stock no.</th>
											<th scope="col">Description</th>
											<th scope="col">Unit</th>
											<th scope="col">Requested</th>
											<th scope="col">Prepared</th>
											<th scope="col">Remaining</th>
										</tr>
									</thead>
									<tbody>
										{requiredPreparationByStock.map((item) => (
											<tr key={item.stockInventoryId}>
												<td>{item.stockNo}</td>
												<td>{item.description}</td>
												<td>{item.unit}</td>
												<td>{item.requested}</td>
												<td>{item.prepared}</td>
												<td>{item.requested - item.prepared}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>

							<h3>Scan item barcode</h3>
							<p className="accountant-inventory-field-note">
								Scan with the handheld scanner, then enter the quantity prepared. A barcode must match an item in this request.
							</p>
							<form className="tafi-stock-preparation-scan-form" onSubmit={handleLookupBarcode}>
								<label>
									<span>Barcode</span>
									<input
										ref={barcodeInputRef}
										type="text"
										autoComplete="off"
										value={barcodeInput}
										onChange={(event) => setBarcodeInput(event.target.value)}
										placeholder="Scan barcode and press Enter"
										disabled={isLookingUpBarcode || isSavingPreparedItem || isCompletingPreparation}
									/>
								</label>
								<button
									type="submit"
									className="accountant-inventory-add-toggle"
									disabled={!barcodeInput.trim() || isLookingUpBarcode}
								>
									{isLookingUpBarcode ? 'Looking up...' : 'Find item'}
								</button>
							</form>

							{scannedBarcodeItem && (
								<div className="tafi-stock-preparation-scanned">
									<p>
										<strong>{scannedBarcodeItem.stock_no}</strong>
										{' · '}{scannedBarcodeItem.category || 'Uncategorized'}
										{' · '}{scannedBarcodeItem.item_description}
										{' · '}{scannedBarcodeItem.unit_of_measure}
										{' · '}Barcode balance: {scannedBarcodeItem.barcode_available}
									</p>
									<form className="accountant-inventory-form tafi-stock-preparation-item-form" onSubmit={handleSavePreparedItem}>
										<label>
											<span>Quantity to prepare</span>
											<input
												type="number"
												min="1"
												step="1"
												value={preparedQuantity}
												onChange={(event) => setPreparedQuantity(event.target.value)}
												required
											/>
										</label>
										<label>
											<span>Unit price (optional)</span>
											<input
												type="number"
												min="0"
												step="0.01"
												value={unitPrice}
												onChange={(event) => setUnitPrice(event.target.value)}
												placeholder="Optional"
											/>
										</label>
										<button
											type="submit"
											className="accountant-inventory-submit"
											disabled={isSavingPreparedItem}
										>
											{isSavingPreparedItem ? 'Adding item...' : 'Add to preparation'}
										</button>
									</form>
								</div>
							)}

							<h3>Inventory Transform Form items</h3>
							{isLoadingPreparationItems ? (
								<p className="accountant-inventory-empty" role="status">Loading prepared items...</p>
							) : preparationItems.length ? (
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Stock no.</th>
												<th scope="col">Category</th>
												<th scope="col">Item description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Quantity</th>
												<th scope="col">Unit price</th>
												<th scope="col">Barcode</th>
												<th scope="col">Action</th>
											</tr>
										</thead>
										<tbody>
											{preparationItems.map((item) => (
												<tr key={item.item_id}>
													<td>{item.stock_no}</td>
													<td>{item.category || '—'}</td>
													<td>{item.item_description}</td>
													<td>{item.unit_of_measure}</td>
													<td>{item.quantity}</td>
													<td>{item.unit_price ?? '—'}</td>
													<td>{item.barcode}</td>
													<td>
														<button
															type="button"
															className="accountant-inventory-add-toggle"
															onClick={() => handleRemovePreparedItem(item)}
															disabled={Boolean(removingPreparationItemId) || isCompletingPreparation}
															aria-label={`Remove prepared barcode ${item.barcode}`}
														>
															<Trash2 size={16} aria-hidden="true" />
															{removingPreparationItemId === item.item_id ? 'Removing...' : 'Remove'}
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : (
								<p className="accountant-inventory-empty">No barcode items have been prepared yet.</p>
							)}

							{isPreparationComplete ? (
								<button
									type="button"
									className="accountant-inventory-submit"
									onClick={handleCompletePreparation}
									disabled={isCompletingPreparation || isLoadingPreparationItems}
								>
									{isCompletingPreparation ? 'Marking delivered...' : 'Mark Delivered'}
								</button>
							) : (
								<p className="accountant-inventory-empty">
									Complete every requested quantity to enable Mark Delivered.
								</p>
							)}
						</div>
					</>
				) : (
					<p className="accountant-inventory-empty">
						This preparation is no longer active. Refresh the Purchase Order Request Form.
					</p>
				)}
			</div>
		</section>
	)
}