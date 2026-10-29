import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
	createTafiAdminStockInventory,
	listTafiAdminBranchInventory,
	listTafiAdminInventoryInformation,
	listTafiAdminStockInventory,
	listTafiAdminStockInScans,
	listTafiAdminStockInRecords,
	listTafiAdminStockOutRecords
} from '../../lib/supabase'

const emptyForm = {
	category: '',
	inventoryId: ''
}

function formatBarcodeDate(value) {
	if (!value) return 'Date unavailable'

	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString()
}

function getLocalMonthInputValue() {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	return `${year}-${month}`
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

async function loadStockInventoryData(sessionToken) {
	const [inventoryResult, stockResult] = await Promise.all([
		listTafiAdminInventoryInformation(sessionToken),
		listTafiAdminStockInventory(sessionToken)
	])

	if (inventoryResult.error || stockResult.error) {
		return {
			error: inventoryResult.error ?? stockResult.error,
			inventory: null,
			stock: null
		}
	}

	return {
		error: null,
		inventory: inventoryResult.data ?? [],
		stock: stockResult.data ?? []
	}
}

export default function TafiStockInventory({ sessionToken }) {
	const [inventoryItems, setInventoryItems] = useState([])
	const [stockItems, setStockItems] = useState([])
	const [branchStockItems, setBranchStockItems] = useState([])
	const [barcodeScans, setBarcodeScans] = useState([])
	const [stockInRecords, setStockInRecords] = useState([])
	const [stockOutRecords, setStockOutRecords] = useState([])
	const [form, setForm] = useState(emptyForm)
	const [activeTab, setActiveTab] = useState('stock')
	const [stockInMonth, setStockInMonth] = useState(getLocalMonthInputValue)
	const [stockInDay, setStockInDay] = useState('')
	const [stockOutMonth, setStockOutMonth] = useState(getLocalMonthInputValue)
	const [stockOutDay, setStockOutDay] = useState('')
	const [stockSearch, setStockSearch] = useState('')
	const [stockCategory, setStockCategory] = useState('')
	const [branchStockSearch, setBranchStockSearch] = useState('')
	const [branchStockBranch, setBranchStockBranch] = useState('')
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [isLoading, setIsLoading] = useState(true)
	const [isBranchStockLoading, setIsBranchStockLoading] = useState(true)
	const [isBarcodeLoading, setIsBarcodeLoading] = useState(true)
	const [isStockInLoading, setIsStockInLoading] = useState(true)
	const [isStockOutLoading, setIsStockOutLoading] = useState(true)
	const [isSaving, setIsSaving] = useState(false)
	const [loadError, setLoadError] = useState('')
	const [branchStockLoadError, setBranchStockLoadError] = useState('')
	const [barcodeLoadError, setBarcodeLoadError] = useState('')
	const [stockInLoadError, setStockInLoadError] = useState('')
	const [stockOutLoadError, setStockOutLoadError] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')

	useEffect(() => {
		let isCurrent = true

		const load = async () => {
			const [result, branchStockResult, barcodeResult] = await Promise.all([
				loadStockInventoryData(sessionToken),
				listTafiAdminBranchInventory(sessionToken),
				listTafiAdminStockInScans(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)
			setIsBranchStockLoading(false)
			setIsBarcodeLoading(false)
			if (result.error) {
				setLoadError(result.error.message)
			} else {
				setLoadError('')
				setInventoryItems(result.inventory)
				setStockItems(result.stock)
			}
			if (branchStockResult.error) {
				setBranchStockLoadError(branchStockResult.error.message)
			} else {
				setBranchStockLoadError('')
				setBranchStockItems(branchStockResult.data ?? [])
			}
			if (barcodeResult.error) {
				setBarcodeLoadError(barcodeResult.error.message)
			} else {
				setBarcodeLoadError('')
				setBarcodeScans(barcodeResult.data ?? [])
			}
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadStockInRecords = async () => {
			setIsStockInLoading(true)
			setStockInLoadError('')
			const { data, error } = await listTafiAdminStockInRecords(
				sessionToken,
				stockInMonth || null,
				stockInDay || null
			)
			if (!isCurrent) return
			setIsStockInLoading(false)
			if (error) {
				setStockInLoadError(error.message)
				return
			}
			setStockInRecords(data ?? [])
		}

		loadStockInRecords()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, stockInMonth, stockInDay])

	useEffect(() => {
		let isCurrent = true

		const loadStockOutRecords = async () => {
			setIsStockOutLoading(true)
			setStockOutLoadError('')
			const { data, error } = await listTafiAdminStockOutRecords(
				sessionToken,
				stockOutMonth || null,
				stockOutDay || null
			)
			if (!isCurrent) return
			setIsStockOutLoading(false)
			if (error) {
				setStockOutLoadError(error.message)
				return
			}
			setStockOutRecords(data ?? [])
		}

		loadStockOutRecords()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, stockOutMonth, stockOutDay])

	const categories = useMemo(
		() => [...new Set(inventoryItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
		[inventoryItems]
	)

	const stockCategories = useMemo(
		() => [...new Set(stockItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
		[stockItems]
	)

	const stockInventoryIds = useMemo(
		() => new Set(stockItems.map((item) => item.inventory_id)),
		[stockItems]
	)

	const availableItems = useMemo(() => {
		return inventoryItems.filter((item) => {
			if (stockInventoryIds.has(item.inventory_id)) return false
			if (form.category && item.category !== form.category) return false
			return true
		})
	}, [form.category, inventoryItems, stockInventoryIds])

	const filteredStockItems = useMemo(() => {
		const query = stockSearch.trim().toLocaleLowerCase()
		return stockItems.filter((item) => {
			if (stockCategory && item.category !== stockCategory) return false
			if (!query) return true
			return [item.stock_no, item.item_description, item.unit_of_measure, item.category]
				.some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [stockCategory, stockItems, stockSearch])

	const branchNames = useMemo(
		() => [...new Set(branchStockItems.map((item) => item.branch_name).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[branchStockItems]
	)

	const filteredBranchStockItems = useMemo(() => {
		if (!branchStockBranch) return []

		const query = branchStockSearch.trim().toLocaleLowerCase()
		return branchStockItems.filter((item) => {
			if (item.branch_name !== branchStockBranch) return false
			if (!query) return true
			return [
				item.branch_name,
				item.stock_no,
				item.item_description,
				item.unit_of_measure,
				item.category
			].some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [branchStockBranch, branchStockItems, branchStockSearch])

	const refreshBranchStock = async () => {
		setIsBranchStockLoading(true)
		setBranchStockLoadError('')
		const { data, error } = await listTafiAdminBranchInventory(sessionToken)
		setIsBranchStockLoading(false)
		if (error) {
			setBranchStockLoadError(error.message)
			return
		}
		setBranchStockItems(data ?? [])
	}

	const refreshBarcodeScans = async () => {
		setIsBarcodeLoading(true)
		setBarcodeLoadError('')
		const { data, error } = await listTafiAdminStockInScans(sessionToken)
		setIsBarcodeLoading(false)
		if (error) {
			setBarcodeLoadError(error.message)
			return
		}
		setBarcodeScans(data ?? [])
	}

	const refreshStockInRecords = async () => {
		setIsStockInLoading(true)
		setStockInLoadError('')
		const { data, error } = await listTafiAdminStockInRecords(
			sessionToken,
			stockInMonth || null,
			stockInDay || null
		)
		setIsStockInLoading(false)
		if (error) {
			setStockInLoadError(error.message)
			return
		}
		setStockInRecords(data ?? [])
	}

	const refreshStockOutRecords = async () => {
		setIsStockOutLoading(true)
		setStockOutLoadError('')
		const { data, error } = await listTafiAdminStockOutRecords(
			sessionToken,
			stockOutMonth || null,
			stockOutDay || null
		)
		setIsStockOutLoading(false)
		if (error) {
			setStockOutLoadError(error.message)
			return
		}
		setStockOutRecords(data ?? [])
	}

	const handleSubmit = async (event) => {
		event.preventDefault()
		setIsSaving(true)
		setErrorMessage('')
		setNotice('')

		const { error } = await createTafiAdminStockInventory(sessionToken, form.inventoryId)
		if (error) {
			setIsSaving(false)
			setErrorMessage(error.message)
			return
		}

		const result = await loadStockInventoryData(sessionToken)
		setIsSaving(false)
		if (result.error) {
			setLoadError(result.error.message)
			setNotice('Stock item added, but the list could not be refreshed.')
			setErrorMessage(result.error.message)
			return
		}

		setInventoryItems(result.inventory)
		setStockItems(result.stock)
		setForm(emptyForm)
		setIsFormOpen(false)
		setNotice('Stock item added successfully.')
	}

	const toggleForm = () => {
		setIsFormOpen((current) => !current)
		setForm(emptyForm)
		setErrorMessage('')
		setNotice('')
	}

	return (
		<div className="tafi-admin-section accountant-inventory-section">
			<div className="accountant-inventory-tabs" role="tablist" aria-label="Stock inventory">
				<button
					type="button"
					id="tafi-stock-inventory-tab"
					className={`accountant-inventory-tab${activeTab === 'stock' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'stock'}
					aria-controls="tafi-stock-inventory-panel"
					onClick={() => setActiveTab('stock')}
				>
					TAFI Stock Inventory
				</button>
				<button
					type="button"
					id="tafi-barcode-inventory-tab"
					className={`accountant-inventory-tab${activeTab === 'barcodes' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'barcodes'}
					aria-controls="tafi-barcode-inventory-panel"
					onClick={() => setActiveTab('barcodes')}
				>
					Barcode Inventory
				</button>
				<button
					type="button"
					id="tafi-stock-in-records-tab"
					className={`accountant-inventory-tab${activeTab === 'stockIn' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'stockIn'}
					aria-controls="tafi-stock-in-records-panel"
					onClick={() => setActiveTab('stockIn')}
				>
					Stock In Records
				</button>
				<button
					type="button"
					id="tafi-stock-out-records-tab"
					className={`accountant-inventory-tab${activeTab === 'stockOut' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'stockOut'}
					aria-controls="tafi-stock-out-records-panel"
					onClick={() => setActiveTab('stockOut')}
				>
					Stock Out Records
				</button>
				<button
					type="button"
					id="tafi-branch-inventory-tab"
					className={`accountant-inventory-tab${activeTab === 'branchInventory' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'branchInventory'}
					aria-controls="tafi-branch-inventory-panel"
					onClick={() => setActiveTab('branchInventory')}
				>
					Branch Inventory Stock
				</button>
			</div>
			<div
				id="tafi-stock-inventory-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-inventory-tab"
				hidden={activeTab !== 'stock'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Stock on hand</h2>
						<p>
							{filteredStockItems.length === stockItems.length
								? `${stockItems.length} item${stockItems.length === 1 ? '' : 's'}`
								: `${filteredStockItems.length} of ${stockItems.length} items`}
						</p>
					</div>
					<button
						type="button"
						className={`accountant-inventory-add-toggle${isFormOpen ? ' open' : ''}`}
						aria-expanded={isFormOpen}
						disabled={isSaving || Boolean(loadError)}
						onClick={toggleForm}
					>
						{isFormOpen ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
						{isFormOpen ? 'Cancel' : 'Add item'}
					</button>
				</div>

				{isFormOpen && (
					<>
						<div className="accountant-inventory-heading">
							<div>
								<h2>Add stock item</h2>
								<p>Select an item from the inventory catalogue. Barcode stock-in scans determine its available count.</p>
							</div>
						</div>
						<form className="accountant-inventory-form" onSubmit={handleSubmit}>
							<label>
								<span>Category</span>
								<select
									value={form.category}
									onChange={(event) => setForm((current) => ({
										...current,
										category: event.target.value,
										inventoryId: ''
									}))}
								>
									<option value="">All categories</option>
									{categories.map((category) => (
										<option key={category} value={category}>{category}</option>
									))}
								</select>
							</label>
							<label className="accountant-inventory-description">
								<span>Inventory item</span>
								<select
									value={form.inventoryId}
									onChange={(event) => setForm((current) => ({ ...current, inventoryId: event.target.value }))}
									required
								>
									<option value="">Select an inventory item</option>
									{availableItems.map((item) => (
										<option key={item.inventory_id} value={item.inventory_id}>
											{item.stock_no} - {item.item_description} ({item.unit_of_measure})
										</option>
									))}
								</select>
								{availableItems.length === 0 && (
									<span className="accountant-inventory-field-note">
										No unstocked items are available in this category.
									</span>
								)}
							</label>
							<button type="submit" className="accountant-inventory-submit" disabled={isSaving || !form.inventoryId}>
								{isSaving ? 'Saving...' : 'Add stock item'}
							</button>
						</form>
					</>
				)}

				{loadError && <p className="accountant-inventory-error" role="alert">{loadError}</p>}
				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}

				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading stock inventory...</p>
				) : stockItems.length ? (
					<>
						<div className="tafi-stock-inventory-filters" role="search" aria-label="Filter stock inventory">
							<label>
								<span>Search items</span>
								<input
									type="search"
									value={stockSearch}
									onChange={(event) => setStockSearch(event.target.value)}
									placeholder="Search stock no., description, or unit"
								/>
							</label>
							<label>
								<span>Category</span>
								<select value={stockCategory} onChange={(event) => setStockCategory(event.target.value)}>
									<option value="">All categories</option>
									{stockCategories.map((category) => (
										<option key={category} value={category}>{category}</option>
									))}
								</select>
							</label>
						</div>
						{filteredStockItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Stock no.</th>
											<th scope="col">Item description</th>
											<th scope="col">Unit of measure</th>
											<th scope="col">Available</th>
										</tr>
									</thead>
									<tbody>
										{filteredStockItems.map((item) => (
											<tr key={item.stock_inventory_id}>
												<td>{item.stock_no}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.available}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="accountant-inventory-empty">No stock items match those filters.</p>
						)}
					</>
				) : loadError ? null : (
					<p className="accountant-inventory-empty">No stock items have been added yet.</p>
				)}
			</div>
			<div
				id="tafi-barcode-inventory-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-barcode-inventory-tab"
				hidden={activeTab !== 'barcodes'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Barcode inventory</h2>
						<p>{barcodeScans.length} barcode item{barcodeScans.length === 1 ? '' : 's'}</p>
						<p>Date shows when the barcode was most recently scanned.</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={refreshBarcodeScans}
						disabled={isBarcodeLoading}
					>
						{isBarcodeLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				{barcodeLoadError && (
					<p className="accountant-inventory-error" role="alert">{barcodeLoadError}</p>
				)}
				{isBarcodeLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading barcode inventory...</p>
				) : barcodeLoadError ? null : barcodeScans.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Barcode</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Item description</th>
									<th scope="col">Unit of measure</th>
									<th scope="col">Item count</th>
									<th scope="col">Date</th>
								</tr>
							</thead>
							<tbody>
								{barcodeScans.map((item) => (
									<tr key={item.barcode}>
										<td>{item.barcode}</td>
										<td>{item.stock_no}</td>
										<td>{item.item_description}</td>
										<td>{item.unit_of_measure}</td>
										<td>{item.scan_count}</td>
										<td>{formatBarcodeDate(item.updated_at ?? item.created_at)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">No barcode scans have been recorded yet.</p>
				)}
			</div>
			<div
				id="tafi-stock-in-records-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-in-records-tab"
				hidden={activeTab !== 'stockIn'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Stock in records</h2>
						<p>
							{stockInRecords.length} record{stockInRecords.length === 1 ? '' : 's'}
							{stockInDay
								? ` for ${formatRecordDate(stockInDay)}`
								: ` for ${formatRecordMonth(stockInMonth)}`}
						</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={refreshStockInRecords}
						disabled={isStockInLoading}
					>
						{isStockInLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				<div className="tafi-stock-record-filters">
					<label htmlFor="tafi-stock-in-record-month">
						<span>Filter by month</span>
						<input
							id="tafi-stock-in-record-month"
							type="month"
							value={stockInMonth}
							required
							onChange={(event) => {
								if (event.target.value) setStockInMonth(event.target.value)
								setStockInDay('')
							}}
						/>
					</label>
					<label htmlFor="tafi-stock-in-record-day">
						<span>Filter by day (optional)</span>
						<input
							id="tafi-stock-in-record-day"
							type="date"
							value={stockInDay}
							onChange={(event) => {
								const selectedDay = event.target.value
								setStockInDay(selectedDay)
								if (selectedDay) setStockInMonth(selectedDay.slice(0, 7))
							}}
						/>
					</label>
				</div>
				{stockInLoadError && (
					<p className="accountant-inventory-error" role="alert">{stockInLoadError}</p>
				)}
				{isStockInLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading stock-in records...</p>
				) : stockInLoadError ? null : stockInRecords.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Barcode</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Item description</th>
									<th scope="col">Unit of measure</th>
									<th scope="col">Stock in count</th>
									<th scope="col">Date</th>
								</tr>
							</thead>
							<tbody>
								{stockInRecords.map((record) => (
									<tr key={`${record.barcode}-${record.date}`}>
										<td>{record.barcode}</td>
										<td>{record.stock_no}</td>
										<td>{record.item_description}</td>
										<td>{record.unit_of_measure}</td>
										<td>{record.stock_in_count}</td>
										<td>{formatRecordDate(record.date)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">
						No stock-in records found{stockInDay ? ' for this day.' : ' for this month.'}
					</p>
				)}
			</div>
			<div
				id="tafi-stock-out-records-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-out-records-tab"
				hidden={activeTab !== 'stockOut'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Stock out records</h2>
						<p>
							{stockOutRecords.length} record{stockOutRecords.length === 1 ? '' : 's'}
							{stockOutDay
								? ` for ${formatRecordDate(stockOutDay)}`
								: ` for ${formatRecordMonth(stockOutMonth)}`}
						</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={refreshStockOutRecords}
						disabled={isStockOutLoading}
					>
						{isStockOutLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				<div className="tafi-stock-record-filters">
					<label htmlFor="tafi-stock-out-record-month">
						<span>Filter by month</span>
						<input
							id="tafi-stock-out-record-month"
							type="month"
							value={stockOutMonth}
							required
							onChange={(event) => {
								if (event.target.value) setStockOutMonth(event.target.value)
								setStockOutDay('')
							}}
						/>
					</label>
					<label htmlFor="tafi-stock-out-record-day">
						<span>Filter by day (optional)</span>
						<input
							id="tafi-stock-out-record-day"
							type="date"
							value={stockOutDay}
							onChange={(event) => {
								const selectedDay = event.target.value
								setStockOutDay(selectedDay)
								if (selectedDay) setStockOutMonth(selectedDay.slice(0, 7))
							}}
						/>
					</label>
				</div>
				{stockOutLoadError && (
					<p className="accountant-inventory-error" role="alert">{stockOutLoadError}</p>
				)}
				{isStockOutLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading stock-out records...</p>
				) : stockOutLoadError ? null : stockOutRecords.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Barcode</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Item description</th>
									<th scope="col">Unit of measure</th>
									<th scope="col">Stock out count</th>
									<th scope="col">Date</th>
								</tr>
							</thead>
							<tbody>
								{stockOutRecords.map((record) => (
									<tr key={`${record.barcode}-${record.date}`}>
										<td>{record.barcode}</td>
										<td>{record.stock_no}</td>
										<td>{record.item_description}</td>
										<td>{record.unit_of_measure}</td>
										<td>{record.stock_out_count}</td>
										<td>{formatRecordDate(record.date)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">
						No stock-out records found{stockOutDay ? ' for this day.' : ' for this month.'}
					</p>
				)}
			</div>
			<div
				id="tafi-branch-inventory-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-branch-inventory-tab"
				hidden={activeTab !== 'branchInventory'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Branch inventory stock</h2>
						<p>Current quantities recorded in each branch's inventory.</p>
						<p>
							{branchStockBranch
								? `${filteredBranchStockItems.length} stock item${filteredBranchStockItems.length === 1 ? '' : 's'} in ${branchStockBranch}`
								: 'Select a branch to view its inventory.'}
						</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={refreshBranchStock}
						disabled={isBranchStockLoading}
					>
						{isBranchStockLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				{branchStockLoadError && (
					<p className="accountant-inventory-error" role="alert">{branchStockLoadError}</p>
				)}
				{isBranchStockLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading branch inventory stock...</p>
				) : !branchStockLoadError && branchStockItems.length ? (
					<>
						<div className="tafi-stock-inventory-filters" role="search" aria-label="Filter branch inventory stock">
							<label>
								<span>Search branch or item</span>
								<input
									type="search"
									value={branchStockSearch}
									onChange={(event) => setBranchStockSearch(event.target.value)}
									placeholder="Search branch, stock no., or description"
								/>
							</label>
							<label>
								<span>Branch</span>
								<select
									value={branchStockBranch}
									onChange={(event) => setBranchStockBranch(event.target.value)}
								>
									<option value="">Select a branch</option>
									{branchNames.map((branch) => (
										<option key={branch} value={branch}>{branch}</option>
									))}
								</select>
							</label>
						</div>
						{filteredBranchStockItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Stock no.</th>
											<th scope="col">Item description</th>
											<th scope="col">Unit</th>
											<th scope="col">Available</th>
										</tr>
									</thead>
									<tbody>
										{filteredBranchStockItems.map((item) => (
											<tr key={item.branch_inventory_id}>
												<td>{item.stock_no}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.available}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : branchStockBranch ? (
							<p className="accountant-inventory-empty">No branch stock items match those filters.</p>
						) : (
							<p className="accountant-inventory-empty">Select a branch to view its inventory.</p>
						)}
					</>
				) : branchStockLoadError ? null : (
					<p className="accountant-inventory-empty">No branch inventory stock has been recorded yet.</p>
				)}
			</div>
		</div>
	)
}