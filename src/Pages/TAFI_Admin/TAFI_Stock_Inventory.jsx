import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import {
	addTafiAdminManualStockInventory,
	listTafiAdminBranchInventory,
	listTafiAdminStockInventory,
	listTafiAdminStockInScans,
	listTafiAdminStockInRecords,
	listTafiAdminStockOutRecords
} from '../../lib/supabase'

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

export default function TafiStockInventory({ sessionToken }) {
	const [stockItems, setStockItems] = useState([])
	const [branchStockItems, setBranchStockItems] = useState([])
	const [barcodeScans, setBarcodeScans] = useState([])
	const [stockInRecords, setStockInRecords] = useState([])
	const [stockOutRecords, setStockOutRecords] = useState([])
	const [activeTab, setActiveTab] = useState('stock')
	const [stockInMonth, setStockInMonth] = useState(getLocalMonthInputValue)
	const [stockInDay, setStockInDay] = useState('')
	const [stockOutMonth, setStockOutMonth] = useState(getLocalMonthInputValue)
	const [stockOutDay, setStockOutDay] = useState('')
	const [isManualStockFormOpen, setIsManualStockFormOpen] = useState(false)
	const [isExportingStock, setIsExportingStock] = useState(false)
	const [stockExportError, setStockExportError] = useState('')
	const [manualStockInventoryId, setManualStockInventoryId] = useState('')
	const [manualStockQuantity, setManualStockQuantity] = useState('')
	const [isSavingManualStock, setIsSavingManualStock] = useState(false)
	const [manualStockError, setManualStockError] = useState('')
	const [manualStockNotice, setManualStockNotice] = useState('')
	const [barcodeSearch, setBarcodeSearch] = useState('')
	const [stockSearch, setStockSearch] = useState('')
	const [stockCategory, setStockCategory] = useState('')
	const [branchStockSearch, setBranchStockSearch] = useState('')
	const [branchStockBranch, setBranchStockBranch] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [isBranchStockLoading, setIsBranchStockLoading] = useState(true)
	const [isBarcodeLoading, setIsBarcodeLoading] = useState(true)
	const [isStockInLoading, setIsStockInLoading] = useState(true)
	const [isStockOutLoading, setIsStockOutLoading] = useState(true)
	const [loadError, setLoadError] = useState('')
	const [branchStockLoadError, setBranchStockLoadError] = useState('')
	const [barcodeLoadError, setBarcodeLoadError] = useState('')
	const [stockInLoadError, setStockInLoadError] = useState('')
	const [stockOutLoadError, setStockOutLoadError] = useState('')
	useEffect(() => {
		let isCurrent = true

		const load = async () => {
			const [stockResult, branchStockResult, barcodeResult] = await Promise.all([
				listTafiAdminStockInventory(sessionToken),
				listTafiAdminBranchInventory(sessionToken),
				listTafiAdminStockInScans(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)
			setIsBranchStockLoading(false)
			setIsBarcodeLoading(false)
			if (stockResult.error) {
				setLoadError(stockResult.error.message)
			} else {
				setLoadError('')
				setStockItems(stockResult.data ?? [])
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

	const stockCategories = useMemo(
		() => [...new Set(stockItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
		[stockItems]
	)

	const filteredStockItems = useMemo(() => {
		const query = stockSearch.trim().toLocaleLowerCase()
		return stockItems.filter((item) => {
			if (stockCategory && item.category !== stockCategory) return false
			if (!query) return true
			return [item.stock_no, item.item_description, item.unit_of_measure, item.category]
				.some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [stockCategory, stockItems, stockSearch])

	const filteredBarcodeScans = useMemo(() => {
		const query = barcodeSearch.trim().toLocaleLowerCase()
		if (!query) return barcodeScans

		return barcodeScans.filter((item) => [
			item.barcode,
			item.stock_no,
			item.item_description,
			item.unit_of_measure,
			item.scan_count
		].some((value) => String(value ?? '').toLocaleLowerCase().includes(query)))
	}, [barcodeScans, barcodeSearch])

	const selectedManualStockItem = stockItems.find(
		(item) => item.stock_inventory_id === manualStockInventoryId
	)

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

	const toggleManualStockForm = () => {
		setIsManualStockFormOpen((isOpen) => !isOpen)
		setManualStockInventoryId('')
		setManualStockQuantity('')
		setManualStockError('')
		setManualStockNotice('')
	}

	const handleManualStockSubmit = async (event) => {
		event.preventDefault()
		setManualStockError('')
		setManualStockNotice('')

		const quantity = Number(manualStockQuantity)
		if (!selectedManualStockItem || !Number.isSafeInteger(quantity) || quantity <= 0) {
			setManualStockError('Choose a stock number and enter a whole quantity greater than zero.')
			return
		}

		setIsSavingManualStock(true)
		const { data, error } = await addTafiAdminManualStockInventory(
			sessionToken,
			manualStockInventoryId,
			quantity
		)
		setIsSavingManualStock(false)
		if (error) {
			setManualStockError(error.message)
			return
		}

		const nextAvailable = Number(data)
		if (data === null || data === undefined || !Number.isFinite(nextAvailable)) {
			setManualStockError('Stock was added, but the updated balance was not returned. Refresh the page to reload it.')
			return
		}

		setStockItems((items) => items.map((item) => (
			item.stock_inventory_id === manualStockInventoryId
				? { ...item, available: nextAvailable }
				: item
		)))
		setManualStockNotice(
			`Added ${quantity} to ${selectedManualStockItem.stock_no}. Available is now ${nextAvailable}.`
		)
		setIsManualStockFormOpen(false)
		setManualStockInventoryId('')
		setManualStockQuantity('')
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

	const exportStockOnHand = async () => {
		setIsExportingStock(true)
		setStockExportError('')
		try {
			const { default: ExcelJS } = await import('exceljs')
			const workbook = new ExcelJS.Workbook()
			const worksheet = workbook.addWorksheet('Stock on Hand')
			worksheet.columns = [
				{ header: 'Stock no.', key: 'stockNo', width: 18 },
				{ header: 'Item description', key: 'description', width: 48 },
				{ header: 'Unit of measure', key: 'unit', width: 22 },
				{ header: 'Available', key: 'available', width: 16 }
			]
			worksheet.addRows(stockItems.map((item) => ({
				stockNo: item.stock_no ?? '',
				description: item.item_description ?? '',
				unit: item.unit_of_measure ?? '',
				available: item.available ?? null
			})))
			worksheet.getRow(1).font = { bold: true }
			worksheet.autoFilter = 'A1:D1'
			worksheet.views = [{ state: 'frozen', ySplit: 1 }]

			const workbookBuffer = await workbook.xlsx.writeBuffer()
			const fileDate = new Date().toISOString().slice(0, 10)
			const fileName = `tafi-stock-on-hand-${fileDate}.xlsx`
			const downloadUrl = URL.createObjectURL(new Blob([workbookBuffer], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}))
			const link = document.createElement('a')
			link.href = downloadUrl
			link.download = fileName
			document.body.appendChild(link)
			link.click()
			link.remove()
			URL.revokeObjectURL(downloadUrl)
		} catch (error) {
			setStockExportError(
				error instanceof Error ? `Could not export stock on hand: ${error.message}` : 'Could not export stock on hand.'
			)
		} finally {
			setIsExportingStock(false)
		}
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
					<div className="tafi-stock-inventory-actions">
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={exportStockOnHand}
						disabled={isExportingStock || isLoading || Boolean(loadError) || !stockItems.length}
					>
						<Download size={16} aria-hidden="true" />
						{isExportingStock ? 'Preparing Excel...' : 'Download Excel (.xlsx)'}
					</button>
					<button
						type="button"
						className={`accountant-inventory-add-toggle${isManualStockFormOpen ? ' open' : ''}`}
						aria-expanded={isManualStockFormOpen}
						onClick={toggleManualStockForm}
						disabled={isSavingManualStock || isLoading || Boolean(loadError) || !stockItems.length}
					>
						{isManualStockFormOpen ? 'Cancel' : 'Add manually'}
					</button>
					</div>
				</div>
				{stockExportError && <p className="accountant-inventory-error" role="alert">{stockExportError}</p>}

				{isManualStockFormOpen && (
					<>
						<div className="accountant-inventory-heading">
							<div>
								<h2>Add stock manually</h2>
								<p>Choose a stock item and enter the quantity to add. Barcode inventory is not required.</p>
							</div>
						</div>
						<form className="accountant-inventory-form" onSubmit={handleManualStockSubmit}>
							<label>
								<span>Stock no.</span>
								<select
									value={manualStockInventoryId}
									onChange={(event) => setManualStockInventoryId(event.target.value)}
									required
								>
									<option value="">Select a stock number</option>
									{stockItems.map((item) => (
										<option key={item.stock_inventory_id} value={item.stock_inventory_id}>
											{item.stock_no}
										</option>
									))}
								</select>
							</label>
							<label className="accountant-inventory-description">
								<span>Item description</span>
								<input
									value={selectedManualStockItem?.item_description ?? ''}
									placeholder="Select a stock number first"
									readOnly
								/>
							</label>
							<label>
								<span>Unit of measure</span>
								<input
									value={selectedManualStockItem?.unit_of_measure ?? ''}
									placeholder="Select a stock number first"
									readOnly
								/>
							</label>
							<label>
								<span>Quantity to add</span>
								<input
									type="number"
									min="1"
									max="99999999999"
									step="1"
									value={manualStockQuantity}
									onChange={(event) => setManualStockQuantity(event.target.value)}
									required
								/>
							</label>
							<button
								type="submit"
								className="accountant-inventory-submit"
								disabled={isSavingManualStock || !selectedManualStockItem}
							>
								{isSavingManualStock ? 'Saving...' : 'Add stock'}
							</button>
						</form>
					</>
				)}
				{manualStockError && <p className="accountant-inventory-error" role="alert">{manualStockError}</p>}
				{manualStockNotice && <p className="accountant-inventory-notice" role="status">{manualStockNotice}</p>}

				{loadError && <p className="accountant-inventory-error" role="alert">{loadError}</p>}

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
											<tr
												key={item.stock_inventory_id}
												className={Number(item.available) === 0 ? 'accountant-inventory-row-zero-stock' : undefined}
											>
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
						<p>
							{filteredBarcodeScans.length === barcodeScans.length
								? `${barcodeScans.length} barcode item${barcodeScans.length === 1 ? '' : 's'}`
								: `${filteredBarcodeScans.length} of ${barcodeScans.length} barcode items`}
						</p>
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
					<>
						<div className="tafi-stock-inventory-filters" role="search" aria-label="Filter barcode inventory">
							<label>
								<span>Search barcode inventory</span>
								<input
									type="search"
									value={barcodeSearch}
									onChange={(event) => setBarcodeSearch(event.target.value)}
									placeholder="Search barcode, stock no., description, or unit"
								/>
							</label>
						</div>
						{filteredBarcodeScans.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Barcode</th>
											<th scope="col">Stock no.</th>
											<th scope="col">Item description</th>
											<th scope="col">Unit of measure</th>
											<th scope="col">Item count</th>
										</tr>
									</thead>
									<tbody>
										{filteredBarcodeScans.map((item) => (
											<tr key={item.barcode}>
												<td>{item.barcode}</td>
												<td>{item.stock_no}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.scan_count}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="accountant-inventory-empty">No barcode inventory items match your search.</p>
						)}
					</>
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