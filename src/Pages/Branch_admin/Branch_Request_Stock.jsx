import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import {
	createBranchStockRequestBatch,
	listBranchStockReceiptHistory,
	listBranchStockRequests,
	listBranchTafiStockItems,
	receiveBranchStockRequestBatch
} from '../../lib/supabase'
import {
	downloadBranchStockRequestWorkbook,
	getBranchStockRequestDate
} from './branchStockRequestXlsxExport'

let nextRequestLineId = 0

const createRequestLine = () => ({
	lineId: ++nextRequestLineId,
	stockInventoryId: '',
	quantityRequested: '',
	quantityBuffer: '0'
})

const getRequestDraftStorageKey = (branchId) => (
	branchId ? `tafi-branch-stock-request-draft:${branchId}` : null
)

const readRequestDraft = (storageKey) => {
	const emptyDraft = () => [createRequestLine()]
	if (!storageKey) {
		return {
			requestLines: emptyDraft(),
			error: 'This branch could not be identified, so draft saving is unavailable.'
		}
	}

	try {
		const serializedDraft = window.localStorage.getItem(storageKey)
		if (!serializedDraft) return { requestLines: emptyDraft(), error: '' }

		const parsedDraft = JSON.parse(serializedDraft)
		if (!Array.isArray(parsedDraft)) throw new Error('Saved request draft must be a list.')
		if (parsedDraft.length === 0) return { requestLines: emptyDraft(), error: '' }

		const requestLines = parsedDraft.map((line) => {
			if (
				!line
				|| !Number.isInteger(line.lineId)
				|| line.lineId < 1
				|| typeof line.stockInventoryId !== 'string'
				|| typeof line.quantityRequested !== 'string'
				|| typeof line.quantityBuffer !== 'string'
			) {
				throw new Error('Saved request draft contains an invalid item.')
			}
			return line
		})
		if (new Set(requestLines.map((line) => line.lineId)).size !== requestLines.length) {
			throw new Error('Saved request draft contains duplicate item IDs.')
		}

		nextRequestLineId = Math.max(nextRequestLineId, ...requestLines.map((line) => line.lineId))
		return { requestLines, error: '' }
	} catch (error) {
		console.error('Unable to load the saved Branch Admin stock request draft.', error)
		return {
			requestLines: emptyDraft(),
			error: 'The saved request draft could not be loaded. Use Clear all draft items to reset it.'
		}
	}
}

const formatOrderNumber = (groupId) => groupId?.slice(0, 8).toUpperCase() ?? '—'
const formatPrice = (value) => value === null || value === undefined
	? '—'
	: new Intl.NumberFormat('en-PH', {
		style: 'currency',
		currency: 'PHP'
	}).format(Number(value))
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

function SearchableStockItemSelect({ items, value, onChange, lineId, lineNumber }) {
	const [isOpen, setIsOpen] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const selectRef = useRef(null)
	const listboxId = `branch-stock-request-items-${lineId}`
	const selectedItem = items.find((item) => item.stock_inventory_id === value)
	const query = searchTerm.trim().toLocaleLowerCase()
	const filteredItems = items.filter((item) => (
		!query
		|| [item.stock_no, item.item_description, item.unit_of_measure]
			.some((text) => text?.toLocaleLowerCase().includes(query))
	))

	useEffect(() => {
		if (!isOpen) return undefined

		const closeOnOutsideClick = (event) => {
			if (!selectRef.current?.contains(event.target)) {
				setIsOpen(false)
				setSearchTerm('')
			}
		}

		document.addEventListener('mousedown', closeOnOutsideClick)
		return () => document.removeEventListener('mousedown', closeOnOutsideClick)
	}, [isOpen])

	const chooseItem = (item) => {
		onChange(item.stock_inventory_id)
		setIsOpen(false)
		setSearchTerm('')
	}

	return (
		<div className="branch-stock-request-item-select" ref={selectRef}>
			<button
				type="button"
				className="branch-stock-request-item-select-trigger"
				aria-label={`Select an item for request line ${lineNumber}`}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-controls={listboxId}
				onClick={() => {
					setIsOpen((open) => !open)
					setSearchTerm('')
				}}
			>
				<span>{selectedItem?.item_description ?? 'Select an item'}</span>
				<ChevronDown size={16} aria-hidden="true" />
			</button>
			{isOpen && (
				<div className="branch-stock-request-item-select-menu">
					<input
						type="search"
						className="branch-stock-request-item-select-search"
						autoFocus
						aria-label={`Search items for request line ${lineNumber}`}
						aria-controls={listboxId}
						placeholder="Search stock no., description, or unit"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Escape') {
								event.preventDefault()
								setIsOpen(false)
								setSearchTerm('')
							} else if (event.key === 'Enter') {
								event.preventDefault()
								if (filteredItems[0]) chooseItem(filteredItems[0])
							}
						}}
					/>
					<div id={listboxId} role="listbox" aria-label="Stock items">
						{filteredItems.length ? filteredItems.map((item) => (
							<button
								type="button"
								role="option"
								aria-selected={item.stock_inventory_id === value}
								className="branch-stock-request-item-select-option"
								key={item.stock_inventory_id}
								onClick={() => chooseItem(item)}
							>
								<span>{item.item_description}</span>
								<small>{item.stock_no} · {item.unit_of_measure}</small>
							</button>
						)) : (
							<p className="branch-stock-request-item-select-empty">No matching stock items.</p>
						)}
					</div>
				</div>
			)}
		</div>
	)
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
	const requestDraftStorageKey = getRequestDraftStorageKey(branchAdmin?.branch_id)
	const [initialDraft] = useState(() => readRequestDraft(requestDraftStorageKey))
	const [stockItems, setStockItems] = useState([])
	const [requests, setRequests] = useState([])
	const [receiptHistory, setReceiptHistory] = useState([])
	const [requestLines, setRequestLines] = useState(() => initialDraft.requestLines)
	const requestLinesRef = useRef(requestLines)
	const [draftLoadError, setDraftLoadError] = useState(initialDraft.error)
	const [draftSaveError, setDraftSaveError] = useState('')
	const [isReviewingRequest, setIsReviewingRequest] = useState(false)
	const [showRequestValidation, setShowRequestValidation] = useState(false)
	const [activeTab, setActiveTab] = useState('request')
	const [selectedRequestMonth, setSelectedRequestMonth] = useState('')
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [receivingDeliveryDate, setReceivingDeliveryDate] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')
	const [pendingRequestExport, setPendingRequestExport] = useState(null)
	const [requestExportFormat, setRequestExportFormat] = useState('')
	const [requestExportError, setRequestExportError] = useState('')
	const [receiptError, setReceiptError] = useState('')
	const [receiptNotice, setReceiptNotice] = useState('')

	const saveRequestDraft = (lines) => {
		if (!requestDraftStorageKey || draftLoadError) return
		try {
			const hasDraftContent = lines.length > 1 || lines.some((line) => (
				line.stockInventoryId
				|| line.quantityRequested
				|| line.quantityBuffer !== '0'
			))
			if (hasDraftContent) {
				window.localStorage.setItem(requestDraftStorageKey, JSON.stringify(lines))
			} else {
				window.localStorage.removeItem(requestDraftStorageKey)
			}
			setDraftSaveError('')
		} catch (error) {
			console.error('Unable to save the Branch Admin stock request draft.', error)
			setDraftSaveError('Your draft could not be saved on this device. Keep this page open until you submit it.')
		}
	}

	const updateRequestLines = (update) => {
		const currentLines = requestLinesRef.current
		const nextLines = typeof update === 'function' ? update(currentLines) : update
		requestLinesRef.current = nextLines
		setRequestLines(nextLines)
		saveRequestDraft(nextLines)
	}

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

	const availableItemsByLine = useMemo(() => requestLines.map((line) => {
		const selectedElsewhere = new Set(requestLines
			.filter((otherLine) => otherLine.lineId !== line.lineId)
			.map((otherLine) => otherLine.stockInventoryId)
			.filter(Boolean))

		return stockItems.filter((item) => (
			!selectedElsewhere.has(item.stock_inventory_id)
			|| item.stock_inventory_id === line.stockInventoryId
		))
	}), [requestLines, stockItems])

	const deliveredRequests = useMemo(
		() => requests.filter((request) => request.status === 'delivered'),
		[requests]
	)
	const deliveredRequestDateGroups = useMemo(() => {
		const groups = new Map()
		deliveredRequests.forEach((request) => {
			const dateKey = getRequestDateKey(request.created_at)
			if (!groups.has(dateKey)) {
				groups.set(dateKey, { dateKey, createdAt: request.created_at, requests: [] })
			}
			groups.get(dateKey).requests.push(request)
		})
		return [...groups.values()].sort((first, second) => second.dateKey.localeCompare(first.dateKey))
	}, [deliveredRequests])
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
	const receiptDateGroups = useMemo(() => {
		const groups = new Map()
		receiptHistory.forEach((receipt) => {
			const dateKey = getRequestDateKey(receipt.received_at)
			if (!groups.has(dateKey)) {
				groups.set(dateKey, { dateKey, receivedAt: receipt.received_at, receipts: [] })
			}
			groups.get(dateKey).receipts.push(receipt)
		})
		return [...groups.values()].sort((first, second) => second.dateKey.localeCompare(first.dateKey))
	}, [receiptHistory])

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
			|| !Number.isInteger(Number(line.quantityRequested))
			|| !Number.isFinite(Number(line.quantityBuffer || 0))
			|| Number(line.quantityBuffer || 0) < 0
			|| !Number.isInteger(Number(line.quantityBuffer || 0))
		))
		if (hasDuplicateItems || hasInvalidLine) {
			setShowRequestValidation(true)
			setErrorMessage(hasDuplicateItems
				? 'Choose a different stock item for each request line.'
				: 'Select an item and enter a whole-number quantity greater than zero for every line.')
			return
		}
		setShowRequestValidation(false)

		const requestedItems = requestLines.map((line) => {
			const stockItem = stockItems.find((item) => item.stock_inventory_id === line.stockInventoryId)
			return stockItem ? {
				stockNo: stockItem.stock_no,
				description: stockItem.item_description,
				unit: stockItem.unit_of_measure,
				quantityRequested: Number(line.quantityRequested),
				quantityBuffer: Number(line.quantityBuffer || 0),
				quantityTotal: Number(line.quantityRequested) + Number(line.quantityBuffer || 0),
				currentStock: stockItem.branch_current_stock
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
				quantityRequested: Number(line.quantityRequested),
				quantityBuffer: Number(line.quantityBuffer || 0)
			}))
		)
		if (error) {
			setIsSubmitting(false)
			setErrorMessage(error.message)
			return
		}

		const submittedItemCount = requestLines.length
		updateRequestLines([createRequestLine()])
		setIsReviewingRequest(false)
		const exportDetails = { branchName, requestedItems, requestDate, submittedItemCount }
		let fileName = ''
		setPendingRequestExport(null)
		setRequestExportError('')
		try {
			fileName = await downloadBranchStockRequestWorkbook(branchName, requestedItems, requestDate)
		} catch (error) {
			setPendingRequestExport(exportDetails)
			setRequestExportError(
				error instanceof Error ? error.message : 'Unable to prepare the requested download.'
			)
		}

		const result = await loadRequestData(sessionToken)
		setIsSubmitting(false)
		if (result.error) {
			setErrorMessage(result.error.message)
			setNotice(fileName
				? `Request submitted, but the request list could not be refreshed. Downloaded ${fileName}.`
				: 'Request submitted, but the request list could not be refreshed. Use the prompt to retry the Excel download.')
			return
		}

		setStockItems(result.stockItems)
		setRequests(result.requests)
		setReceiptHistory(result.history)
		setNotice(fileName
			? `${submittedItemCount} item${submittedItemCount === 1 ? '' : 's'} submitted in one stock request to TAFI Admin. Downloaded ${fileName}.`
			: `${submittedItemCount} item${submittedItemCount === 1 ? '' : 's'} submitted in one stock request to TAFI Admin. Use the prompt to retry the Excel download.`)
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

	const handleClearAllDraft = () => {
		if (!window.confirm('Clear all unsent stock request items for this branch?')) return

		try {
			if (!requestDraftStorageKey) {
				throw new Error('This branch could not be identified.')
			}
			window.localStorage.removeItem(requestDraftStorageKey)
			setDraftLoadError('')
			setDraftSaveError('')
		} catch (error) {
			console.error('Unable to clear the Branch Admin stock request draft.', error)
			setDraftSaveError('Unable to clear the saved draft on this device.')
		}

		const emptyDraft = [createRequestLine()]
		requestLinesRef.current = emptyDraft
		setRequestLines(emptyDraft)
		setShowRequestValidation(false)
		setIsReviewingRequest(false)
		setErrorMessage('')
	}

	const cancelRequestExport = () => {
		if (!pendingRequestExport || requestExportFormat) return
		setNotice(
			`${pendingRequestExport.submittedItemCount} item${pendingRequestExport.submittedItemCount === 1 ? '' : 's'} submitted in one stock request to TAFI Admin. No file was downloaded.`
		)
		setPendingRequestExport(null)
		setRequestExportError('')
	}

	const handleReceiveDateGroup = async ({ dateKey, createdAt, requests: dateRequests }) => {
		setReceivingDeliveryDate(dateKey)
		setReceiptError('')
		setReceiptNotice('')

		const { data: receivedCount, error } = await receiveBranchStockRequestBatch(
			sessionToken,
			dateRequests.map((request) => request.request_id)
		)
		if (error) {
			setReceivingDeliveryDate('')
			setReceiptError(error.message)
			return
		}

		const result = await loadRequestData(sessionToken)
		setReceivingDeliveryDate('')
		if (result.error) {
			setReceiptError(result.error.message)
			setReceiptNotice('Receipts confirmed and branch stock updated, but the order list could not be refreshed.')
			return
		}

		setStockItems(result.stockItems)
		setRequests(result.requests)
		setReceiptHistory(result.history)
		const dateLabel = requestDateLabelFormatter.format(new Date(createdAt))
		setReceiptNotice(
			`${receivedCount} item${receivedCount === 1 ? '' : 's'} received for ${dateLabel}. Full shipped quantities added to branch inventory.`
		)
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
				{draftLoadError && <p className="accountant-inventory-error" role="alert">{draftLoadError}</p>}
				{draftSaveError && <p className="accountant-inventory-error" role="alert">{draftSaveError}</p>}
				{!draftLoadError && !draftSaveError && (
					<p className="accountant-inventory-field-note" role="status">
						Unsent request items save automatically on this device until submitted or cleared.
					</p>
				)}

				<form
					className="accountant-inventory-form branch-stock-request-form"
					onSubmit={handleSubmit}
					onInvalidCapture={() => setShowRequestValidation(true)}
				>
					{isReviewingRequest ? (
						<div className="branch-stock-request-review">
							<h3>Review stock request</h3>
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Stock no.</th>
											<th scope="col">Description</th>
											<th scope="col">Unit</th>
											<th scope="col">Branch current stock</th>
											<th scope="col">Requested</th>
											<th scope="col">Buffer</th>
											<th scope="col">Total</th>
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
													<td>{item?.branch_current_stock ?? '—'}</td>
													<td>{line.quantityRequested}</td>
													<td>{Number(line.quantityBuffer || 0)}</td>
													<td>{Number(line.quantityRequested || 0) + Number(line.quantityBuffer || 0)}</td>
												</tr>
											)
										})}
									</tbody>
								</table>
							</div>
							<div className="branch-stock-request-review-actions">
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
							</div>
						</div>
					) : (
						<>
							{requestLines.map((line, index) => {
								const selectedItem = stockItems.find((item) => item.stock_inventory_id === line.stockInventoryId)
								const isRequestedQuantityMissing = showRequestValidation && !line.quantityRequested
								return (
									<fieldset
										className={[
											'branch-stock-request-line',
											isRequestedQuantityMissing && 'branch-stock-request-line-missing-requested'
										].filter(Boolean).join(' ')}
										key={line.lineId}
									>
										<legend>Request item {index + 1}</legend>
										<div className="branch-stock-request-fields">
											<div className="branch-stock-request-item-field">
												<span>Description</span>
												<SearchableStockItemSelect
													items={availableItemsByLine[index]}
													value={line.stockInventoryId}
													lineId={line.lineId}
													lineNumber={index + 1}
													onChange={(stockInventoryId) => {
														updateRequestLines((current) => current.map((item) => (
															item.lineId === line.lineId
																? { ...item, stockInventoryId }
																: item
														)))
														setErrorMessage('')
													}}
												/>
											</div>
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
												<span>Branch current stock</span>
												<input value={selectedItem?.branch_current_stock ?? ''} readOnly />
											</label>
											<label>
												<span>Requested</span>
												<input
													type="number"
													min="1"
													step="1"
													value={line.quantityRequested}
													className={isRequestedQuantityMissing ? 'branch-stock-request-quantity-missing' : undefined}
													aria-invalid={isRequestedQuantityMissing || undefined}
													onChange={(event) => {
														updateRequestLines((current) => current.map((item) => (
															item.lineId === line.lineId
																? { ...item, quantityRequested: event.target.value }
																: item
														)))
														setErrorMessage('')
													}}
													required
												/>
											</label>
											<label>
												<span>Buffer</span>
												<input
													type="number"
													min="0"
													step="1"
													value={line.quantityBuffer}
													onChange={(event) => {
														updateRequestLines((current) => current.map((item) => (
															item.lineId === line.lineId
																? { ...item, quantityBuffer: event.target.value }
																: item
														)))
														setErrorMessage('')
													}}
												/>
											</label>
											<label>
												<span>Total</span>
												<input
													value={selectedItem
														? Number(line.quantityRequested || 0) + Number(line.quantityBuffer || 0)
														: ''}
													readOnly
												/>
											</label>
										</div>
										{requestLines.length > 1 && (
											<button
												type="button"
												className="branch-stock-remove-line"
												onClick={() => {
													updateRequestLines((current) => current.filter((item) => item.lineId !== line.lineId))
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
							<div className="branch-stock-request-draft-actions">
								<button
									type="button"
									className="branch-stock-add-line"
									onClick={() => {
										updateRequestLines((current) => [...current, createRequestLine()])
										setErrorMessage('')
									}}
									disabled={isSubmitting}
								>
									<Plus size={16} aria-hidden="true" />
									Add another item
								</button>
								<button
									type="button"
									className="branch-stock-remove-line branch-stock-clear-all"
									onClick={handleClearAllDraft}
									disabled={isSubmitting}
								>
									<Trash2 size={15} aria-hidden="true" />
									Clear all draft items
								</button>
							</div>
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
												<th scope="col">Branch current stock</th>
												<th scope="col">Requested</th>
												<th scope="col">Buffer</th>
												<th scope="col">Total</th>
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
															<td>{request.branch_current_stock ?? '—'}</td>
															<td>{request.quantity_requested_base}</td>
															<td>{request.quantity_buffer}</td>
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
						<p>Orders are grouped by request date. Confirm all delivered items for a day to add their full shipped quantities to branch inventory.</p>
					</div>
				</div>
				{receiptError && <p className="accountant-inventory-error" role="alert">{receiptError}</p>}
				{receiptNotice && <p className="accountant-inventory-notice" role="status">{receiptNotice}</p>}

				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading delivered orders...</p>
				) : deliveredRequests.length ? (
					<div className="accountant-inventory-table-wrap">
						{deliveredRequestDateGroups.map((group) => (
							<section className="branch-stock-receipt-date-group" key={group.dateKey}>
								<div className="branch-stock-receipt-date-heading">
									<div>
										<strong>{requestDateLabelFormatter.format(new Date(group.createdAt))}</strong>
										<span>{group.requests.length} item{group.requests.length === 1 ? '' : 's'}</span>
									</div>
									<button
										type="button"
										className="accountant-inventory-submit"
										disabled={Boolean(receivingDeliveryDate)}
										onClick={() => handleReceiveDateGroup(group)}
									>
										{receivingDeliveryDate === group.dateKey
											? 'Receiving all...'
											: 'Confirm receive all'}
									</button>
								</div>
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Order no.</th>
											<th scope="col">Stock no.</th>
											<th scope="col">Description</th>
											<th scope="col">Unit</th>
											<th scope="col">Branch current stock</th>
											<th scope="col">Requested</th>
											<th scope="col">Buffer</th>
											<th scope="col">Total</th>
											<th scope="col">Quantity shipped</th>
											<th scope="col">Per item price</th>
											<th scope="col">Total</th>
										</tr>
									</thead>
									<tbody>
										{group.requests.map((request) => (
											<tr key={request.request_id}>
												<td>{formatOrderNumber(request.request_group_id)}</td>
												<td>{request.stock_no}</td>
												<td>{request.item_description}</td>
												<td>{request.unit_of_measure}</td>
												<td>{request.branch_current_stock ?? '—'}</td>
												<td>{request.quantity_requested_base}</td>
												<td>{request.quantity_buffer}</td>
												<td>{request.quantity_requested}</td>
												<td>{request.quantity_delivered}</td>
												<td>{formatPrice(request.unit_price)}</td>
												<td>{formatPrice(request.total_price)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</section>
						))}
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
						{receiptDateGroups.map(({ dateKey, receivedAt, receipts }) => (
							<section className="branch-stock-receipt-date-group" key={dateKey}>
								<div className="branch-stock-receipt-date-heading">
									<strong>{requestDateLabelFormatter.format(new Date(receivedAt))}</strong>
									<span>{receipts.length} receipt{receipts.length === 1 ? '' : 's'}</span>
								</div>
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Received on</th>
											<th scope="col">Order no.</th>
											<th scope="col">Stock no.</th>
											<th scope="col">Description</th>
											<th scope="col">Unit</th>
											<th scope="col">Branch current stock</th>
											<th scope="col">Requested</th>
											<th scope="col">Buffer</th>
											<th scope="col">Total</th>
											<th scope="col">Shipped</th>
											<th scope="col">Per item price</th>
											<th scope="col">Total</th>
											<th scope="col">Received quantity</th>
										</tr>
									</thead>
									<tbody>
										{receipts.map((receipt) => (
											<tr key={receipt.receipt_id}>
												<td>{new Date(receipt.received_at).toLocaleString()}</td>
												<td>{formatOrderNumber(receipt.request_group_id)}</td>
												<td>{receipt.stock_no}</td>
												<td>{receipt.item_description}</td>
												<td>{receipt.unit_of_measure}</td>
												<td>{receipt.branch_current_stock ?? '—'}</td>
												<td>{receipt.quantity_requested_base}</td>
												<td>{receipt.quantity_buffer}</td>
												<td>{receipt.quantity_requested}</td>
												<td>{receipt.quantity_delivered}</td>
												<td>{formatPrice(receipt.unit_price)}</td>
												<td>{formatPrice(receipt.total_price)}</td>
												<td>{receipt.quantity_received}</td>
											</tr>
										))}
									</tbody>
								</table>
							</section>
						))}
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