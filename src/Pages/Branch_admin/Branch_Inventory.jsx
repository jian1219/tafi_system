import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
	addBranchInventoryRefItem,
	deleteBranchInventoryRefItem,
	deleteBranchInventoryItem,
	listBranchInventory,
	listBranchInventoryRef,
	listBranchInventoryRefHistory,
	listBranchInventoryRefStockOutTotals,
	listBranchInventoryRefStockOutMonthlyTotals,
	listBranchInventoryRefStockInHistory,
	listBranchTafiStockItems,
	updateBranchInventoryRefBarcode
} from '../../lib/supabase'

const refHistoryPageSize = 50

const getManilaDateKey = () => {
	const dateParts = new Intl.DateTimeFormat('en', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date())
	const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
	return `${dateValues.year}-${dateValues.month}-${dateValues.day}`
}

export default function BranchInventory({ branchName = 'Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [inventoryItems, setInventoryItems] = useState([])
	const [activeInventorySection, setActiveInventorySection] = useState('main')
	const [searchTerm, setSearchTerm] = useState('')
	const [categoryFilter, setCategoryFilter] = useState('')
	const [selectedInventoryItemId, setSelectedInventoryItemId] = useState(null)
	const [refInventoryItems, setRefInventoryItems] = useState([])
	const [refHistoryItems, setRefHistoryItems] = useState([])
	const [showRefHistory, setShowRefHistory] = useState(false)
	const [activeRefHistoryType, setActiveRefHistoryType] = useState('out')
	const [refStockOutHistoryDay, setRefStockOutHistoryDay] = useState(getManilaDateKey)
	const [refStockOutHistoryMonth, setRefStockOutHistoryMonth] = useState(
		() => getManilaDateKey().slice(0, 7)
	)
	const [refStockOutTotals, setRefStockOutTotals] = useState([])
	const [isLoadingRefStockOutTotals, setIsLoadingRefStockOutTotals] = useState(false)
	const [refStockOutTotalsError, setRefStockOutTotalsError] = useState('')
	const [refStockOutMonthlyTotals, setRefStockOutMonthlyTotals] = useState([])
	const [isLoadingRefStockOutMonthlyTotals, setIsLoadingRefStockOutMonthlyTotals] = useState(false)
	const [refStockOutMonthlyTotalsError, setRefStockOutMonthlyTotalsError] = useState('')
	const [refStockItems, setRefStockItems] = useState([])
	const [refStockInventoryId, setRefStockInventoryId] = useState('')
	const [isLoadingRefInventory, setIsLoadingRefInventory] = useState(false)
	const [isLoadingRefHistory, setIsLoadingRefHistory] = useState(false)
	const [hasMoreRefHistory, setHasMoreRefHistory] = useState(false)
	const [isSubmittingRefItem, setIsSubmittingRefItem] = useState(false)
	const [deletingRefItemId, setDeletingRefItemId] = useState('')
	const [barcodeDrafts, setBarcodeDrafts] = useState({})
	const [savingRefBarcodeId, setSavingRefBarcodeId] = useState('')
	const [refLoadError, setRefLoadError] = useState('')
	const [refHistoryError, setRefHistoryError] = useState('')
	const [refBarcodeError, setRefBarcodeError] = useState('')
	const [refMessage, setRefMessage] = useState('')
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [loadError, setLoadError] = useState('')
	const [mainInventoryActionError, setMainInventoryActionError] = useState('')
	const [mainInventoryActionMessage, setMainInventoryActionMessage] = useState('')
	const [deletingInventoryId, setDeletingInventoryId] = useState('')
	const [retryCount, setRetryCount] = useState(0)
	const [refRetryCount, setRefRetryCount] = useState(0)

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

			const { data, error } = await listBranchInventory(sessionToken)
			if (!isCurrent) return
			setIsLoading(false)
			if (error) {
				setLoadError(error.message)
				return
			}
			setInventoryItems(data ?? [])
			setLoadError('')
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [retryCount, sessionToken])

	useEffect(() => {
		if (activeInventorySection !== 'ref') return undefined
		let isCurrent = true

		const load = async () => {
			setIsLoadingRefInventory(true)
			setRefLoadError('')
			if (!sessionToken) {
				setIsLoadingRefInventory(false)
				setRefLoadError('Branch Admin session is unavailable. Please sign in again.')
				return
			}

			const [inventoryResult, stockResult] = await Promise.all([
				listBranchInventoryRef(sessionToken),
				listBranchTafiStockItems(sessionToken)
			])
			if (!isCurrent) return

			const errors = [inventoryResult.error, stockResult.error].filter(Boolean)
			setRefLoadError(errors.map((error) => error.message).join(' '))
			setRefInventoryItems(inventoryResult.error ? [] : inventoryResult.data ?? [])
			setRefStockItems(stockResult.error ? [] : stockResult.data ?? [])
			setIsLoadingRefInventory(false)
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [activeInventorySection, refRetryCount, sessionToken])

	useEffect(() => {
		if (activeInventorySection !== 'ref' || !showRefHistory) return undefined
		let isCurrent = true

		const loadHistory = async () => {
			setIsLoadingRefHistory(true)
			setRefHistoryError('')
			setRefHistoryItems([])
			setHasMoreRefHistory(false)
			if (!sessionToken) {
				setIsLoadingRefHistory(false)
				setRefHistoryError('Branch Admin session is unavailable. Please sign in again.')
				return
			}

			const { data, error } = activeRefHistoryType === 'in'
				? await listBranchInventoryRefStockInHistory(sessionToken, refHistoryPageSize, 0)
				: await listBranchInventoryRefHistory(
					sessionToken,
					refHistoryPageSize,
					0,
					refStockOutHistoryDay || null
				)
			if (!isCurrent) return

			setIsLoadingRefHistory(false)
			if (error) {
				setRefHistoryError(error.message)
				return
			}

			const firstPage = data ?? []
			setRefHistoryItems(firstPage)
			setHasMoreRefHistory(firstPage.length === refHistoryPageSize)
		}

		loadHistory()
		return () => {
			isCurrent = false
		}
	}, [
		activeInventorySection,
		activeRefHistoryType,
		refStockOutHistoryDay,
		sessionToken,
		showRefHistory
	])

	useEffect(() => {
		if (
			activeInventorySection !== 'ref'
			|| !showRefHistory
			|| activeRefHistoryType !== 'out'
			|| !refStockOutHistoryDay
		) {
			return undefined
		}

		let isCurrent = true
		const loadStockOutTotals = async () => {
			setIsLoadingRefStockOutTotals(true)
			setRefStockOutTotalsError('')
			if (!sessionToken) {
				setIsLoadingRefStockOutTotals(false)
				setRefStockOutTotalsError('Branch Admin session is unavailable. Please sign in again.')
				return
			}

			const { data, error } = await listBranchInventoryRefStockOutTotals(
				sessionToken,
				refStockOutHistoryDay
			)
			if (!isCurrent) return

			setIsLoadingRefStockOutTotals(false)
			if (error) {
				setRefStockOutTotalsError(error.message)
				return
			}

			setRefStockOutTotals(data ?? [])
		}

		loadStockOutTotals()
		return () => {
			isCurrent = false
		}
	}, [
		activeInventorySection,
		activeRefHistoryType,
		refStockOutHistoryDay,
		sessionToken,
		showRefHistory
	])

	useEffect(() => {
		if (
			activeInventorySection !== 'ref'
			|| !showRefHistory
			|| activeRefHistoryType !== 'out'
			|| !refStockOutHistoryMonth
		) {
			return undefined
		}

		let isCurrent = true
		const loadMonthlyStockOutTotals = async () => {
			setIsLoadingRefStockOutMonthlyTotals(true)
			setRefStockOutMonthlyTotalsError('')
			if (!sessionToken) {
				setIsLoadingRefStockOutMonthlyTotals(false)
				setRefStockOutMonthlyTotalsError('Branch Admin session is unavailable. Please sign in again.')
				return
			}

			const { data, error } = await listBranchInventoryRefStockOutMonthlyTotals(
				sessionToken,
				refStockOutHistoryMonth
			)
			if (!isCurrent) return

			setIsLoadingRefStockOutMonthlyTotals(false)
			if (error) {
				setRefStockOutMonthlyTotalsError(error.message)
				return
			}

			setRefStockOutMonthlyTotals(data ?? [])
		}

		loadMonthlyStockOutTotals()
		return () => {
			isCurrent = false
		}
	}, [
		activeInventorySection,
		activeRefHistoryType,
		refStockOutHistoryMonth,
		sessionToken,
		showRefHistory
	])

	const categories = useMemo(
		() => [...new Set(inventoryItems.map((item) => item.category).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[inventoryItems]
	)

	const filteredItems = useMemo(() => {
		const query = searchTerm.trim().toLocaleLowerCase()
		return inventoryItems.filter((item) => {
			if (categoryFilter && item.category !== categoryFilter) return false
			if (!query) return true
			return [item.stock_no, item.item_description, item.unit_of_measure, item.category]
				.some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [categoryFilter, inventoryItems, searchTerm])

	const availableRefStockItems = useMemo(() => {
		const existingStockIds = new Set(refInventoryItems.map((item) => item.stock_inventory_id))
		return refStockItems.filter((item) => !existingStockIds.has(item.stock_inventory_id))
	}, [refInventoryItems, refStockItems])

	const deleteMainInventoryItem = async (item) => {
		if (!sessionToken) {
			setMainInventoryActionError('Branch Admin session is unavailable. Please sign in again.')
			return
		}
		if (Number(item.available) !== 0) {
			setMainInventoryActionError('Main Inventory items can only be deleted when Available is 0.')
			return
		}
		if (!window.confirm(
			`Delete ${item.stock_no} — ${item.item_description} from Main Inventory? This permanently deletes its linked daily usage history. Ref Inventory will not be changed.`
		)) {
			return
		}

		setDeletingInventoryId(item.branch_inventory_id)
		setMainInventoryActionError('')
		setMainInventoryActionMessage('')
		const { error } = await deleteBranchInventoryItem(sessionToken, item.branch_inventory_id)
		setDeletingInventoryId('')
		if (error) {
			setMainInventoryActionError(error.message)
			return
		}

		setInventoryItems((current) => current.filter(
			(currentItem) => currentItem.branch_inventory_id !== item.branch_inventory_id
		))
		setSelectedInventoryItemId((current) => (
			current === item.branch_inventory_id ? null : current
		))
		setMainInventoryActionMessage(`${item.item_description} deleted from Main Inventory.`)
	}

	const addRefInventoryItem = async (event) => {
		event.preventDefault()
		if (!sessionToken) {
			setRefLoadError('Branch Admin session is unavailable. Please sign in again.')
			return
		}
		if (!refStockInventoryId) {
			setRefLoadError('Select a stock item to add.')
			return
		}

		setIsSubmittingRefItem(true)
		setRefLoadError('')
		setRefMessage('')
		const { error } = await addBranchInventoryRefItem(sessionToken, refStockInventoryId)
		setIsSubmittingRefItem(false)
		if (error) {
			setRefLoadError(error.message)
			return
		}

		const addedItem = refStockItems.find((item) => item.stock_inventory_id === refStockInventoryId)
		setRefMessage(`${addedItem?.item_description ?? 'Stock item'} added to Ref Inventory.`)
		setRefStockInventoryId('')
		setRefRetryCount((count) => count + 1)
	}

	const saveRefBarcode = async (item) => {
		if (!sessionToken) {
			setRefBarcodeError('Branch Admin session is unavailable. Please sign in again.')
			return
		}

		const barcode = (barcodeDrafts[item.stock_inventory_id] ?? item.barcode ?? '').trim()
		if (barcode.length > 128) {
			setRefBarcodeError('Barcode cannot exceed 128 characters.')
			return
		}

		setSavingRefBarcodeId(item.stock_inventory_id)
		setRefBarcodeError('')
		setRefMessage('')
		const { error } = await updateBranchInventoryRefBarcode(
			sessionToken,
			item.stock_inventory_id,
			barcode || null
		)
		setSavingRefBarcodeId('')
		if (error) {
			setRefBarcodeError(error.message)
			return
		}

		setRefInventoryItems((current) => current.map((currentItem) => (
			currentItem.stock_inventory_id === item.stock_inventory_id
				? { ...currentItem, barcode: barcode || null }
				: currentItem
		)))
		setBarcodeDrafts((current) => ({ ...current, [item.stock_inventory_id]: barcode }))
		setRefMessage(`Barcode saved for ${item.stock_no}.`)
	}

	const loadMoreRefHistory = async () => {
		if (!sessionToken || isLoadingRefHistory || !hasMoreRefHistory) return

		setIsLoadingRefHistory(true)
		setRefHistoryError('')
		const { data, error } = activeRefHistoryType === 'in'
			? await listBranchInventoryRefStockInHistory(
				sessionToken,
				refHistoryPageSize,
				refHistoryItems.length
			)
			: await listBranchInventoryRefHistory(
				sessionToken,
				refHistoryPageSize,
				refHistoryItems.length,
				refStockOutHistoryDay || null
			)
		setIsLoadingRefHistory(false)
		if (error) {
			setRefHistoryError(error.message)
			return
		}

		const nextPage = data ?? []
		setRefHistoryItems((current) => [...current, ...nextPage])
		setHasMoreRefHistory(nextPage.length === refHistoryPageSize)
	}

	const deleteRefInventoryItem = async (item) => {
		if (!sessionToken) {
			setRefLoadError('Branch Admin session is unavailable. Please sign in again.')
			return
		}
		if (Number(item.available) !== 0) {
			setRefLoadError('Scan out all available Ref stock before deleting this item.')
			return
		}
		if (!window.confirm(
			`Remove ${item.stock_no} — ${item.item_description} from Ref Inventory? This will not delete the item from Main Inventory.`
		)) {
			return
		}

		setDeletingRefItemId(item.stock_inventory_id)
		setRefLoadError('')
		setRefBarcodeError('')
		setRefMessage('')
		const { error } = await deleteBranchInventoryRefItem(sessionToken, item.stock_inventory_id)
		setDeletingRefItemId('')
		if (error) {
			setRefLoadError(error.message)
			return
		}

		setRefInventoryItems((current) => current.filter(
			(currentItem) => currentItem.stock_inventory_id !== item.stock_inventory_id
		))
		setRefMessage(`${item.item_description} deleted from Ref Inventory.`)
	}

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-list-heading">
				<div>
					<h2>{branchName} {activeInventorySection === 'main' ? 'inventory' : 'reference inventory'}</h2>
					<p>
						{activeInventorySection === 'main'
							? `${filteredItems.length} of ${inventoryItems.length} items`
							: `${refInventoryItems.length} items`}
					</p>
				</div>
			</div>

			<div className="accountant-inventory-tabs" role="tablist" aria-label="Branch inventory sections">
				<button
					type="button"
					id="branch-main-inventory-tab"
					role="tab"
					aria-selected={activeInventorySection === 'main'}
					aria-controls="branch-main-inventory-panel"
					className={`accountant-inventory-tab${activeInventorySection === 'main' ? ' active' : ''}`}
					onClick={() => setActiveInventorySection('main')}
				>
					Main Inventory
				</button>
				<button
					type="button"
					id="branch-ref-inventory-tab"
					role="tab"
					aria-selected={activeInventorySection === 'ref'}
					aria-controls="branch-ref-inventory-panel"
					className={`accountant-inventory-tab${activeInventorySection === 'ref' ? ' active' : ''}`}
					onClick={() => setActiveInventorySection('ref')}
				>
					Ref Inventory
				</button>
			</div>

			{activeInventorySection === 'main' ? (
				<div
					id="branch-main-inventory-panel"
					className="accountant-inventory-panel"
					role="tabpanel"
					aria-labelledby="branch-main-inventory-tab"
				>
					{loadError && (
						<p className="accountant-inventory-error" role="alert">
							{loadError}{' '}
							<button
								type="button"
								className="accountant-inventory-add-toggle"
								onClick={() => setRetryCount((count) => count + 1)}
								disabled={isLoading}
							>
								{isLoading ? 'Retrying...' : 'Retry connection'}
							</button>
						</p>
					)}
					{mainInventoryActionError && (
						<p className="accountant-inventory-error" role="alert">
							{mainInventoryActionError}
						</p>
					)}
					{mainInventoryActionMessage && (
						<p className="accountant-inventory-notice" role="status">
							{mainInventoryActionMessage}
						</p>
					)}
					<p className="accountant-inventory-empty">
						Main Inventory items can only be deleted when Available is 0. Deleting also removes their daily usage history; Ref Inventory is unaffected.
					</p>
					{isLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading branch inventory...</p>
					) : inventoryItems.length ? (
						<>
							<div className="tafi-stock-inventory-filters" role="search" aria-label="Filter branch inventory">
								<label>
									<span>Search items</span>
									<input
										type="search"
										value={searchTerm}
										onChange={(event) => setSearchTerm(event.target.value)}
										placeholder="Search stock no., description, or unit"
									/>
								</label>
								<label>
									<span>Category</span>
									<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
										<option value="">All categories</option>
										{categories.map((category) => (
											<option key={category} value={category}>{category}</option>
										))}
									</select>
								</label>
							</div>
							{filteredItems.length ? (
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table branch-inventory-table">
										<thead>
											<tr>
												<th scope="col">Stock no.</th>
												<th scope="col">Category</th>
												<th scope="col">Item description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Available</th>
												<th scope="col">Action</th>
											</tr>
										</thead>
										<tbody>
											{filteredItems.map((item) => (
												<tr
													key={item.branch_inventory_id}
													className={[
														selectedInventoryItemId === item.branch_inventory_id && 'branch-inventory-row-selected',
														Number(item.available) === 0 && 'accountant-inventory-row-zero-stock',
													].filter(Boolean).join(' ') || undefined}
													aria-label={`Select inventory row for stock ${item.stock_no}`}
													aria-selected={selectedInventoryItemId === item.branch_inventory_id}
													tabIndex={0}
													onClick={() => setSelectedInventoryItemId(item.branch_inventory_id)}
													onKeyDown={(event) => {
														if (event.key === 'Enter' || event.key === ' ') {
															event.preventDefault()
															setSelectedInventoryItemId(item.branch_inventory_id)
														}
													}}
												>
													<td>{item.stock_no}</td>
													<td>{item.category}</td>
													<td>{item.item_description}</td>
													<td>{item.unit_of_measure}</td>
													<td>{item.available}</td>
													<td>
														<button
															type="button"
															className="accountant-inventory-action delete"
															disabled={
																Boolean(deletingInventoryId)
																|| Number(item.available) !== 0
															}
															title={Number(item.available) !== 0
																? 'Main Inventory Available must be 0 before deleting.'
																: 'Delete this item from Main Inventory.'}
															onClick={(event) => {
																event.stopPropagation()
																deleteMainInventoryItem(item)
															}}
														>
															<Trash2 size={14} aria-hidden="true" />
															{deletingInventoryId === item.branch_inventory_id ? 'Deleting…' : 'Delete'}
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : (
								<p className="accountant-inventory-empty">No branch items match those filters.</p>
							)}
						</>
					) : (
						<p className="accountant-inventory-empty">No shared inventory items are available yet.</p>
					)}
				</div>
			) : (
				<div
					id="branch-ref-inventory-panel"
					className="accountant-inventory-panel"
					role="tabpanel"
					aria-labelledby="branch-ref-inventory-tab"
				>
					{refLoadError && (
						<p className="accountant-inventory-error" role="alert">
							{refLoadError}{' '}
							<button
								type="button"
								className="accountant-inventory-add-toggle"
								onClick={() => setRefRetryCount((count) => count + 1)}
								disabled={isLoadingRefInventory}
							>
								{isLoadingRefInventory ? 'Retrying...' : 'Retry connection'}
							</button>
						</p>
					)}
					{refBarcodeError && <p className="accountant-inventory-error" role="alert">{refBarcodeError}</p>}
					{refMessage && <p className="accountant-inventory-notice" role="status">{refMessage}</p>}
					<p className="accountant-inventory-empty">
						Ref items can only be deleted when Available is 0. Scan out any remaining Ref stock first.
					</p>
					<form
						className="tafi-stock-inventory-filters accountant-inventory-ref-form"
						onSubmit={addRefInventoryItem}
					>
						<label>
							<span>Stock item</span>
							<select
								value={refStockInventoryId}
								onChange={(event) => setRefStockInventoryId(event.target.value)}
								disabled={isLoadingRefInventory || isSubmittingRefItem || availableRefStockItems.length === 0}
								required
							>
								<option value="">
									{availableRefStockItems.length ? 'Select a TAFI stock item' : 'No stock items available to add'}
								</option>
								{availableRefStockItems.map((item) => (
									<option key={item.stock_inventory_id} value={item.stock_inventory_id}>
										{item.stock_no} — {item.item_description}
									</option>
								))}
							</select>
						</label>
						<div className="branch-ref-inventory-actions">
							<button
								type="submit"
								className="accountant-inventory-submit"
								disabled={isLoadingRefInventory || isSubmittingRefItem || availableRefStockItems.length === 0}
							>
								{isSubmittingRefItem ? 'Adding stock...' : 'Add to Ref Inventory'}
							</button>
							<button
								type="button"
								className="accountant-inventory-add-toggle"
								aria-expanded={showRefHistory}
								aria-controls="branch-ref-history-panel"
								onClick={() => setShowRefHistory((current) => !current)}
							>
								{showRefHistory ? 'Back to Ref Inventory' : 'Ref Stock History'}
							</button>
						</div>
					</form>
					{!showRefHistory && (
						isLoadingRefInventory ? (
							<p className="accountant-inventory-empty" role="status">Loading reference inventory...</p>
						) : refInventoryItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table branch-inventory-table">
									<thead>
										<tr>
											<th scope="col">Stock no.</th>
											<th scope="col">Barcode</th>
											<th scope="col">Category</th>
											<th scope="col">Item description</th>
											<th scope="col">Unit of measure</th>
											<th scope="col">Available</th>
											<th scope="col">Action</th>
										</tr>
									</thead>
									<tbody>
										{refInventoryItems.map((item) => (
											<tr
												key={item.stock_inventory_id}
												className={Number(item.available) === 0
													? 'accountant-inventory-row-zero-stock'
													: undefined}
											>
												<td>{item.stock_no}</td>
												<td>
													<div className="branch-ref-barcode-editor">
														<input
															type="text"
															value={barcodeDrafts[item.stock_inventory_id] ?? item.barcode ?? ''}
															maxLength={128}
															aria-label={`Barcode for ${item.item_description}`}
															placeholder="Enter barcode"
															disabled={savingRefBarcodeId === item.stock_inventory_id}
															onChange={(event) => {
																setBarcodeDrafts((current) => ({
																	...current,
																	[item.stock_inventory_id]: event.target.value
																}))
																setRefBarcodeError('')
															}}
														/>
														<button
															type="button"
															disabled={savingRefBarcodeId === item.stock_inventory_id}
															onClick={() => saveRefBarcode(item)}
														>
															{savingRefBarcodeId === item.stock_inventory_id ? 'Saving...' : 'Save'}
														</button>
													</div>
												</td>
												<td>{item.category}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.available}</td>
												<td>
													<button
														type="button"
														className="accountant-inventory-action delete"
														disabled={
															Boolean(deletingRefItemId)
															|| savingRefBarcodeId === item.stock_inventory_id
															|| Number(item.available) !== 0
														}
														title={Number(item.available) !== 0
															? 'Scan out all available Ref stock before deleting.'
															: 'Delete this item from Ref Inventory.'}
														onClick={() => deleteRefInventoryItem(item)}
													>
														<Trash2 size={14} aria-hidden="true" />
														{deletingRefItemId === item.stock_inventory_id ? 'Deleting…' : 'Delete'}
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="accountant-inventory-empty">No reference stock has been added to this branch yet.</p>
						)
					)}
					{showRefHistory && (
						<section
							id="branch-ref-history-panel"
							className="branch-ref-history-section"
							aria-labelledby="branch-ref-history-title"
						>
							<div className="accountant-inventory-list-heading">
								<div>
									<h3 id="branch-ref-history-title">Ref Stock History</h3>
									<p>{refHistoryItems.length} records loaded, newest first</p>
								</div>
							</div>
							<div className="accountant-inventory-tabs" role="tablist" aria-label="Ref stock history type">
								<button
									type="button"
									role="tab"
									aria-selected={activeRefHistoryType === 'in'}
									className={`accountant-inventory-tab${activeRefHistoryType === 'in' ? ' active' : ''}`}
									onClick={() => setActiveRefHistoryType('in')}
									disabled={isLoadingRefHistory}
								>
									Stock In
								</button>
								<button
									type="button"
									role="tab"
									aria-selected={activeRefHistoryType === 'out'}
									className={`accountant-inventory-tab${activeRefHistoryType === 'out' ? ' active' : ''}`}
									onClick={() => setActiveRefHistoryType('out')}
									disabled={isLoadingRefHistory}
								>
									Stock Out
								</button>
							</div>
							{activeRefHistoryType === 'out' && (
								<div className="branch-ref-history-date-summary-row">
									<label className="branch-ref-history-period-selector">
										<span>Stock Out day</span>
										<input
											type="date"
											value={refStockOutHistoryDay}
											onChange={(event) => {
												setRefStockOutHistoryDay(event.target.value)
												setRefStockOutTotals([])
												setRefStockOutTotalsError('')
											}}
										/>
										<small>Leave blank to show all days.</small>
									</label>
									<aside
										className="branch-ref-history-daily-totals"
										aria-label="Daily Stock Out totals by item"
										aria-live="polite"
									>
										<h4>Total Stock Out by Item</h4>
										{!refStockOutHistoryDay ? (
											<p>Select a day to see each item's total.</p>
										) : isLoadingRefStockOutTotals ? (
											<p role="status">Loading daily totals...</p>
										) : refStockOutTotalsError ? (
											<p className="accountant-inventory-error" role="alert">
												{refStockOutTotalsError}
											</p>
										) : refStockOutTotals.length ? (
											<ul>
												{refStockOutTotals.map((item) => (
													<li key={`${item.stock_no}-${item.unit_of_measure}`}>
														<span>{item.description}</span>
														<strong>
															{Number(item.total_stock_out).toLocaleString()}
															{item.unit_of_measure ? ` ${item.unit_of_measure}` : ''}
														</strong>
													</li>
												))}
											</ul>
										) : (
											<p>No Stock Out records on this day.</p>
										)}
									</aside>
									<div className="branch-ref-history-monthly-summary">
										<label className="branch-ref-history-period-selector">
											<span>Stock Out month</span>
											<input
												type="month"
												value={refStockOutHistoryMonth}
												onChange={(event) => {
													setRefStockOutHistoryMonth(event.target.value)
													setRefStockOutMonthlyTotals([])
													setIsLoadingRefStockOutMonthlyTotals(false)
													setRefStockOutMonthlyTotalsError('')
												}}
											/>
											<small>Choose a month to view monthly totals.</small>
										</label>
										<aside
											className="branch-ref-history-daily-totals"
											aria-label="Monthly Stock Out totals by item"
											aria-live="polite"
										>
											<h4>Total Stock Out by Item This Month</h4>
											{!refStockOutHistoryMonth ? (
												<p>Select a month to see each item's total.</p>
											) : isLoadingRefStockOutMonthlyTotals ? (
												<p role="status">Loading monthly totals...</p>
											) : refStockOutMonthlyTotalsError ? (
												<p className="accountant-inventory-error" role="alert">
													{refStockOutMonthlyTotalsError}
												</p>
											) : refStockOutMonthlyTotals.length ? (
												<ul>
													{refStockOutMonthlyTotals.map((item) => (
														<li key={`${item.stock_no}-${item.unit_of_measure}`}>
															<span>{item.description}</span>
															<strong>
																{Number(item.total_stock_out).toLocaleString()}
																{item.unit_of_measure ? ` ${item.unit_of_measure}` : ''}
															</strong>
														</li>
													))}
												</ul>
											) : (
												<p>No Stock Out records in this month.</p>
											)}
										</aside>
									</div>
								</div>
							)}
							{activeRefHistoryType === 'in' && (
								<p className="accountant-inventory-empty">
									Stock In records are transfers from Main Inventory to Ref Inventory.
								</p>
							)}
							{refHistoryError && <p className="accountant-inventory-error" role="alert">{refHistoryError}</p>}
							{isLoadingRefHistory && refHistoryItems.length === 0 ? (
								<p className="accountant-inventory-empty" role="status">Loading Ref Stock History...</p>
							) : refHistoryItems.length ? (
								<>
									<div className="accountant-inventory-table-wrap">
										<table className="accountant-inventory-table branch-inventory-table">
											<thead>
												<tr>
													<th scope="col">Time</th>
													<th scope="col">Stock no.</th>
													<th scope="col">Description</th>
													<th scope="col">Unit of measure</th>
													<th scope="col">{activeRefHistoryType === 'in' ? 'Stock in quantity' : 'Stock out quantity'}</th>
												</tr>
											</thead>
											<tbody>
												{refHistoryItems.map((record) => (
													<tr key={record.history_id}>
														<td>
															{new Date(activeRefHistoryType === 'in'
																? record.stock_in_at
																: record.stock_out_at).toLocaleString('en-PH', {
																timeZone: 'Asia/Manila',
																year: 'numeric',
																month: 'short',
																day: 'numeric',
																hour: 'numeric',
																minute: '2-digit'
															})}
														</td>
														<td>{record.stock_no}</td>
														<td>{record.description}</td>
														<td>{record.unit_of_measure}</td>
														<td>{Number(activeRefHistoryType === 'in'
															? record.stock_in_qty
															: record.stock_out_qty).toLocaleString()}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									{hasMoreRefHistory && (
										<button
											type="button"
											className="accountant-inventory-add-toggle"
											onClick={loadMoreRefHistory}
											disabled={isLoadingRefHistory}
										>
											{isLoadingRefHistory ? 'Loading...' : 'Load more history'}
										</button>
									)}
								</>
							) : (
								<p className="accountant-inventory-empty">
									No Ref Stock {activeRefHistoryType === 'in' ? 'In' : 'Out'} history yet.
								</p>
							)}
						</section>
					)}
				</div>
			)}
		</section>
	)
}