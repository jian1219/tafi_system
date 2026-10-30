import { useEffect, useMemo, useState } from 'react'
import { Download, History, Plus, X } from 'lucide-react'
import {
	createAccountantInventoryInformation,
	listAccountantBranchStockInventory,
	listAccountantInventoryInformation,
	listAccountantManualStockInventoryHistory,
	listAccountantTafiStockInventory
} from '../../lib/supabase'

const emptyForm = {
	stockNo: '',
	category: '',
	itemDescription: '',
	unitOfMeasure: '',
	supplier: ''
}

const formatHistoryDate = (value) => {
	if (!value) return 'Date unavailable'
	return new Intl.DateTimeFormat('en-PH', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
}

export default function AccountantInventoryInformation({ sessionToken }) {
	const [activeTab, setActiveTab] = useState('inventory-info')
	const [branchStockBranch, setBranchStockBranch] = useState('')
	const [branchStockCategory, setBranchStockCategory] = useState('')
	const [tafiStockCategory, setTafiStockCategory] = useState('')
	const [tafiStockSearch, setTafiStockSearch] = useState('')
	const [form, setForm] = useState(emptyForm)
	const [inventoryItems, setInventoryItems] = useState([])
	const [tafiStockItems, setTafiStockItems] = useState([])
	const [manualStockHistory, setManualStockHistory] = useState([])
	const [branchStockItems, setBranchStockItems] = useState([])
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [isManualStockHistoryOpen, setIsManualStockHistoryOpen] = useState(false)
	const [manualStockHistoryReloadVersion, setManualStockHistoryReloadVersion] = useState(0)
	const [isManualStockHistoryLoading, setIsManualStockHistoryLoading] = useState(false)
	const [manualStockHistoryError, setManualStockHistoryError] = useState('')
	const [isExportingTafiStock, setIsExportingTafiStock] = useState(false)
	const [tafiStockExportError, setTafiStockExportError] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [isTafiStockLoading, setIsTafiStockLoading] = useState(true)
	const [isBranchStockLoading, setIsBranchStockLoading] = useState(true)
	const [loadError, setLoadError] = useState(false)
	const [tafiStockLoadError, setTafiStockLoadError] = useState('')
	const [branchStockLoadError, setBranchStockLoadError] = useState('')
	const [isSaving, setIsSaving] = useState(false)
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')

	const branchNames = useMemo(
		() => [...new Set(branchStockItems.map((item) => item.branch_name).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[branchStockItems]
	)
	const branchStockCategories = useMemo(
		() => [...new Set(branchStockItems
			.filter((item) => item.branch_name === branchStockBranch)
			.map((item) => item.category)
			.filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[branchStockBranch, branchStockItems]
	)
	const tafiStockCategories = useMemo(
		() => [...new Set(tafiStockItems.map((item) => item.category).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[tafiStockItems]
	)
	const filteredTafiStockItems = useMemo(() => {
		const query = tafiStockSearch.trim().toLocaleLowerCase()
		return tafiStockItems.filter((item) => (
			(!tafiStockCategory || item.category === tafiStockCategory)
			&& (!query || [
				item.stock_no,
				item.category,
				item.item_description,
				item.unit_of_measure,
				item.available
			].some((value) => String(value ?? '').toLocaleLowerCase().includes(query)))
		))
	}, [tafiStockCategory, tafiStockItems, tafiStockSearch])
	const filteredBranchStockItems = useMemo(
		() => branchStockItems.filter((item) => (
			branchStockBranch
			&& item.branch_name === branchStockBranch
			&& (!branchStockCategory || item.category === branchStockCategory)
		)),
		[branchStockBranch, branchStockCategory, branchStockItems]
	)

	useEffect(() => {
		let isCurrent = true

		const loadInventory = async () => {
			const [inventoryResult, tafiStockResult, branchStockResult] = await Promise.all([
				listAccountantInventoryInformation(sessionToken),
				listAccountantTafiStockInventory(sessionToken),
				listAccountantBranchStockInventory(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)
			setIsTafiStockLoading(false)
			setIsBranchStockLoading(false)

			if (inventoryResult.error) {
				setLoadError(true)
				setErrorMessage(inventoryResult.error.message)
			} else {
				setLoadError(false)
				setInventoryItems(inventoryResult.data ?? [])
			}
			if (tafiStockResult.error) {
				setTafiStockLoadError(tafiStockResult.error.message)
			} else {
				setTafiStockLoadError('')
				setTafiStockItems(tafiStockResult.data ?? [])
			}
			if (branchStockResult.error) {
				setBranchStockLoadError(branchStockResult.error.message)
			} else {
				setBranchStockLoadError('')
				setBranchStockItems(branchStockResult.data ?? [])
			}
		}

		loadInventory()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		if (!isManualStockHistoryOpen) return undefined

		let isCurrent = true
		const loadManualStockHistory = async () => {
			setIsManualStockHistoryLoading(true)
			setManualStockHistoryError('')
			const { data, error } = await listAccountantManualStockInventoryHistory(sessionToken)
			if (!isCurrent) return

			setIsManualStockHistoryLoading(false)
			if (error) {
				setManualStockHistoryError(error.message)
				return
			}

			setManualStockHistory(data ?? [])
		}

		loadManualStockHistory()
		return () => {
			isCurrent = false
		}
	}, [isManualStockHistoryOpen, manualStockHistoryReloadVersion, sessionToken])

	useEffect(() => {
		if (!isManualStockHistoryOpen) return undefined
		const handleKeyDown = (event) => {
			if (event.key === 'Escape') setIsManualStockHistoryOpen(false)
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [isManualStockHistoryOpen])

	const handleChange = (event) => {
		setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
	}

	const handleSubmit = async (event) => {
		event.preventDefault()
		setIsSaving(true)
		setErrorMessage('')
		setNotice('')

		const { error } = await createAccountantInventoryInformation(sessionToken, form)
		if (error) {
			setIsSaving(false)
			setErrorMessage(error.message)
			return
		}

		setForm(emptyForm)
		const { data, error: refreshError } = await listAccountantInventoryInformation(sessionToken)
		setIsSaving(false)
		if (refreshError) {
			setLoadError(true)
			setNotice('Inventory item saved, but the list could not be refreshed.')
			setErrorMessage(refreshError.message)
			return
		}

		setLoadError(false)
		setInventoryItems(data ?? [])
		setIsFormOpen(false)
		setNotice('Inventory item added successfully.')
	}

	const toggleForm = () => {
		setIsFormOpen((current) => !current)
		setForm(emptyForm)
		setErrorMessage('')
		setNotice('')
	}

	const exportTafiStock = async () => {
		setIsExportingTafiStock(true)
		setTafiStockExportError('')
		try {
			const { default: ExcelJS } = await import('exceljs')
			const workbook = new ExcelJS.Workbook()
			const worksheet = workbook.addWorksheet('TAFI Stock')
			worksheet.columns = [
				{ header: 'Stock no.', key: 'stockNo', width: 18 },
				{ header: 'Category', key: 'category', width: 24 },
				{ header: 'Item description', key: 'description', width: 48 },
				{ header: 'Unit of measure', key: 'unit', width: 22 },
				{ header: 'Available', key: 'available', width: 16 }
			]
			worksheet.addRows(tafiStockItems.map((item) => ({
				stockNo: item.stock_no ?? '',
				category: item.category ?? '',
				description: item.item_description ?? '',
				unit: item.unit_of_measure ?? '',
				available: item.available ?? null
			})))
			worksheet.getRow(1).font = { bold: true }
			worksheet.autoFilter = 'A1:E1'
			worksheet.views = [{ state: 'frozen', ySplit: 1 }]

			const workbookBuffer = await workbook.xlsx.writeBuffer()
			const fileDate = new Date().toISOString().slice(0, 10)
			const downloadUrl = URL.createObjectURL(new Blob([workbookBuffer], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}))
			const link = document.createElement('a')
			link.href = downloadUrl
			link.download = `accountant-tafi-stock-${fileDate}.xlsx`
			document.body.appendChild(link)
			link.click()
			link.remove()
			window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
		} catch (error) {
			setTafiStockExportError(
				error instanceof Error ? `Could not export TAFI stock: ${error.message}` : 'Could not export TAFI stock.'
			)
		} finally {
			setIsExportingTafiStock(false)
		}
	}

	return (
		<div className="tafi-admin-section accountant-inventory-section">
			<div className="accountant-inventory-tabs" role="tablist" aria-label="Inventory information">
				{[
					{ id: 'inventory-info', label: 'TRITON Inventory Info' },
					{ id: 'tafi-stock', label: 'TAFI Stock' },
					{ id: 'branch-stock', label: 'Branch Inventory' }
				].map((tab) => (
					<button
						key={tab.id}
						type="button"
						id={`${tab.id}-tab`}
						className={`accountant-inventory-tab${activeTab === tab.id ? ' active' : ''}`}
						role="tab"
						aria-selected={activeTab === tab.id}
						aria-controls={`${tab.id}-panel`}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{activeTab === 'inventory-info' && <div
				id="inventory-info-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="inventory-info-tab"
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Inventory items</h2>
						<p>{inventoryItems.length} item{inventoryItems.length === 1 ? '' : 's'}</p>
					</div>
					<button
						type="button"
						className={`accountant-inventory-add-toggle${isFormOpen ? ' open' : ''}`}
						aria-expanded={isFormOpen}
						disabled={isSaving}
						onClick={toggleForm}
					>
						{isFormOpen ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
						{isFormOpen ? 'Cancel' : 'Add'}
					</button>
				</div>
				{isFormOpen && (
					<>
						<div className="accountant-inventory-heading">
							<div>
								<h2>Add inventory information</h2>
								<p>Enter the stock details to add an item to the inventory list.</p>
							</div>
						</div>
						<form id="accountant-inventory-form" className="accountant-inventory-form" onSubmit={handleSubmit}>
							<label>
								<span>Stock no.</span>
								<input name="stockNo" value={form.stockNo} onChange={handleChange} required />
							</label>
							<label>
								<span>Category</span>
								<input name="category" value={form.category} onChange={handleChange} required />
							</label>
							<label className="accountant-inventory-description">
								<span>Item Description</span>
								<textarea name="itemDescription" value={form.itemDescription} onChange={handleChange} rows="2" required />
							</label>
							<label>
								<span>Unit of measure</span>
								<input name="unitOfMeasure" value={form.unitOfMeasure} onChange={handleChange} required />
							</label>
							<label>
								<span>Supplier</span>
								<input name="supplier" value={form.supplier} onChange={handleChange} required />
							</label>
							<button type="submit" className="accountant-inventory-submit" disabled={isSaving}>
								{isSaving ? 'Saving...' : 'Add inventory item'}
							</button>
						</form>
					</>
				)}

				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}

				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading inventory items...</p>
				) : inventoryItems.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Stock no.</th>
									<th scope="col">Category</th>
									<th scope="col">Item Description</th>
									<th scope="col">Unit of measure</th>
									<th scope="col">Supplier</th>
								</tr>
							</thead>
							<tbody>
								{inventoryItems.map((item) => (
									<tr key={item.inventory_id}>
										<td>{item.stock_no}</td>
										<td>{item.category}</td>
										<td>{item.item_description}</td>
										<td>{item.unit_of_measure}</td>
										<td>{item.supplier}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : loadError ? null : (
					<p className="accountant-inventory-empty">No inventory items have been added yet.</p>
				)}
			</div>}

			{activeTab === 'tafi-stock' && (
				<div
					id="tafi-stock-panel"
					className="accountant-inventory-panel"
					role="tabpanel"
					aria-labelledby="tafi-stock-tab"
				>
					<div className="accountant-inventory-list-heading">
						<div>
							<h2>TAFI Stock</h2>
							<p>
								{filteredTafiStockItems.length === tafiStockItems.length
									? `${tafiStockItems.length} item${tafiStockItems.length === 1 ? '' : 's'}`
									: `${filteredTafiStockItems.length} of ${tafiStockItems.length} items`}
							</p>
						</div>
						<div className="tafi-stock-inventory-actions">
							<button
									type="button"
									className="accountant-inventory-add-toggle"
									onClick={exportTafiStock}
									disabled={isExportingTafiStock || isTafiStockLoading || Boolean(tafiStockLoadError) || !tafiStockItems.length}
							>
									<Download size={16} aria-hidden="true" />
									{isExportingTafiStock ? 'Preparing Excel...' : 'Download Excel (.xlsx)'}
							</button>
							<button
									type="button"
									className={`accountant-inventory-add-toggle tafi-manual-stock-history-toggle${isManualStockHistoryOpen ? ' open' : ''}`}
									onClick={() => setIsManualStockHistoryOpen((isOpen) => !isOpen)}
									aria-label={isManualStockHistoryOpen ? 'Hide manual stock addition history' : 'Show manual stock addition history'}
									aria-expanded={isManualStockHistoryOpen}
									aria-controls="accountant-manual-stock-history"
									title={isManualStockHistoryOpen ? 'Hide manual stock addition history' : 'Show manual stock addition history'}
									disabled={isManualStockHistoryLoading}
							>
									<History size={18} aria-hidden="true" />
							</button>
						</div>
					</div>
					{tafiStockExportError && <p className="accountant-inventory-error" role="alert">{tafiStockExportError}</p>}
					{tafiStockLoadError && <p className="accountant-inventory-error" role="alert">{tafiStockLoadError}</p>}
					{isTafiStockLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading TAFI stock...</p>
					) : tafiStockItems.length ? (
						<>
							<div className="tafi-stock-inventory-filters" role="search" aria-label="Search and filter TAFI stock">
								<label>
									<span>Search TAFI stock</span>
									<input
										type="search"
										value={tafiStockSearch}
										onChange={(event) => setTafiStockSearch(event.target.value)}
										placeholder="Search stock no., description, unit, or available"
									/>
								</label>
								<label>
									<span>Category</span>
									<select
										value={tafiStockCategory}
										onChange={(event) => setTafiStockCategory(event.target.value)}
									>
										<option value="">All categories</option>
										{tafiStockCategories.map((category) => (
											<option key={category} value={category}>{category}</option>
										))}
									</select>
								</label>
							</div>
							{filteredTafiStockItems.length ? (
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Stock no.</th>
												<th scope="col">Category</th>
												<th scope="col">Item Description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Available</th>
											</tr>
										</thead>
										<tbody>
											{filteredTafiStockItems.map((item) => (
												<tr
													key={item.stock_inventory_id}
													className={Number(item.available) === 0 ? 'accountant-inventory-row-zero-stock' : undefined}
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
								<p className="accountant-inventory-empty">No TAFI stock items match these filters.</p>
							)}
						</>
					) : !tafiStockLoadError && (
						<p className="accountant-inventory-empty">No TAFI stock items have been added yet.</p>
					)}
					{isManualStockHistoryOpen && (
						<div
							className="tafi-manual-history-backdrop"
							role="presentation"
							onMouseDown={(event) => {
								if (event.target === event.currentTarget) setIsManualStockHistoryOpen(false)
							}}
						>
							<section
								id="accountant-manual-stock-history"
								className="tafi-manual-history-dialog"
								role="dialog"
								aria-modal="true"
								aria-labelledby="accountant-manual-stock-history-title"
							>
								<div className="tafi-manual-history-heading">
									<div>
										<h2 id="accountant-manual-stock-history-title">Manual stock addition history</h2>
										<p>
											{manualStockHistory.length} addition{manualStockHistory.length === 1 ? '' : 's'}
										</p>
									</div>
									<div className="tafi-manual-history-actions">
										<button
											type="button"
											className="accountant-inventory-add-toggle"
											onClick={() => setManualStockHistoryReloadVersion((version) => version + 1)}
											disabled={isManualStockHistoryLoading}
										>
											{isManualStockHistoryLoading ? 'Refreshing...' : 'Refresh'}
										</button>
										<button
											type="button"
											className="payroll-xlsx-dialog-close"
											aria-label="Close manual stock addition history"
											onClick={() => setIsManualStockHistoryOpen(false)}
											autoFocus
										>
											<X size={18} aria-hidden="true" />
										</button>
									</div>
								</div>
								{manualStockHistoryError && (
									<p className="accountant-inventory-error" role="alert">{manualStockHistoryError}</p>
								)}
								{isManualStockHistoryLoading ? (
									<p className="accountant-inventory-empty" role="status">Loading manual stock history...</p>
								) : manualStockHistoryError ? null : manualStockHistory.length ? (
									<div className="accountant-inventory-table-wrap tafi-manual-history-table-wrap">
										<table className="accountant-inventory-table">
											<thead>
												<tr>
													<th scope="col">Stock no.</th>
													<th scope="col">Item description</th>
													<th scope="col">Unit of measure</th>
													<th scope="col">Manually added</th>
													<th scope="col">Date</th>
												</tr>
											</thead>
											<tbody>
												{manualStockHistory.map((record) => (
													<tr key={record.history_id}>
														<td>{record.stock_no}</td>
														<td>{record.item_description}</td>
														<td>{record.unit_of_measure}</td>
														<td>{record.manually_add}</td>
														<td>{formatHistoryDate(record.date)}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								) : (
									<p className="accountant-inventory-empty">No manual stock additions have been recorded yet.</p>
								)}
							</section>
						</div>
					)}
				</div>
			)}

			{activeTab === 'branch-stock' && (
				<div
					id="branch-stock-panel"
					className="accountant-inventory-panel"
					role="tabpanel"
					aria-labelledby="branch-stock-tab"
				>
					<div className="accountant-inventory-list-heading">
						<div>
							<h2>Branch Inventory</h2>
							<p>
								{branchStockBranch
									? `${filteredBranchStockItems.length} item${filteredBranchStockItems.length === 1 ? '' : 's'} in ${branchStockBranch}`
									: 'Select a branch to view its inventory.'}
							</p>
						</div>
					</div>
					{branchStockLoadError && <p className="accountant-inventory-error" role="alert">{branchStockLoadError}</p>}
					{isBranchStockLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading branch inventory...</p>
					) : branchStockItems.length ? (
						<>
							<div className="tafi-stock-inventory-filters" aria-label="Filter branch inventory">
								<label>
									<span>Branch</span>
									<select
										value={branchStockBranch}
										onChange={(event) => {
											setBranchStockBranch(event.target.value)
											setBranchStockCategory('')
										}}
									>
										<option value="">Select a branch</option>
										{branchNames.map((branch) => (
											<option key={branch} value={branch}>{branch}</option>
										))}
									</select>
								</label>
								{branchStockBranch && (
									<label>
										<span>Category</span>
										<select
											value={branchStockCategory}
											onChange={(event) => setBranchStockCategory(event.target.value)}
										>
											<option value="">All categories</option>
											{branchStockCategories.map((category) => (
												<option key={category} value={category}>{category}</option>
											))}
										</select>
									</label>
								)}
							</div>
							{filteredBranchStockItems.length ? (
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Branch</th>
												<th scope="col">Stock no.</th>
												<th scope="col">Category</th>
												<th scope="col">Item Description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Available</th>
											</tr>
										</thead>
										<tbody>
											{filteredBranchStockItems.map((item) => (
												<tr key={item.branch_inventory_id}>
													<td>{item.branch_name}</td>
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
							) : branchStockBranch ? (
								<p className="accountant-inventory-empty">No branch inventory items match these filters.</p>
							) : (
								<p className="accountant-inventory-empty">Select a branch to view its inventory.</p>
							)}
						</>
					) : !branchStockLoadError && (
						<p className="accountant-inventory-empty">No branch inventory items have been added yet.</p>
					)}
				</div>
			)}
		</div>
	)
}