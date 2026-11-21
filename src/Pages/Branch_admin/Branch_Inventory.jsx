import { useEffect, useMemo, useState } from 'react'
import {
	addBranchInventoryRefItem,
	listBranchInventory,
	listBranchInventoryRef,
	listBranchTafiStockItems,
	updateBranchInventoryRefBarcode
} from '../../lib/supabase'

export default function BranchInventory({ branchName = 'Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [inventoryItems, setInventoryItems] = useState([])
	const [activeInventorySection, setActiveInventorySection] = useState('main')
	const [searchTerm, setSearchTerm] = useState('')
	const [categoryFilter, setCategoryFilter] = useState('')
	const [selectedInventoryItemId, setSelectedInventoryItemId] = useState(null)
	const [refInventoryItems, setRefInventoryItems] = useState([])
	const [refStockItems, setRefStockItems] = useState([])
	const [refStockInventoryId, setRefStockInventoryId] = useState('')
	const [isLoadingRefInventory, setIsLoadingRefInventory] = useState(false)
	const [isSubmittingRefItem, setIsSubmittingRefItem] = useState(false)
	const [barcodeDrafts, setBarcodeDrafts] = useState({})
	const [savingRefBarcodeId, setSavingRefBarcodeId] = useState('')
	const [refLoadError, setRefLoadError] = useState('')
	const [refBarcodeError, setRefBarcodeError] = useState('')
	const [refMessage, setRefMessage] = useState('')
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [loadError, setLoadError] = useState('')
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
						<button
							type="submit"
							className="accountant-inventory-submit"
							disabled={isLoadingRefInventory || isSubmittingRefItem || availableRefStockItems.length === 0}
						>
							{isSubmittingRefItem ? 'Adding stock...' : 'Add to Ref Inventory'}
						</button>
					</form>
					{isLoadingRefInventory ? (
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
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="accountant-inventory-empty">No reference stock has been added to this branch yet.</p>
					)}
				</div>
			)}
		</section>
	)
}