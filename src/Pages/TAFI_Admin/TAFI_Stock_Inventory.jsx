import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
	createTafiAdminStockInventory,
	createTafiAdminStockInventoryArrival,
	listTafiAdminBranchInventory,
	listTafiAdminInventoryInformation,
	listTafiAdminStockInventory,
	listTafiAdminStockInventoryArrivals
} from '../../lib/supabase'

const emptyForm = {
	category: '',
	inventoryId: '',
	onhand: ''
}

const emptyArrivalForm = {
	stockInventoryId: '',
	qty: ''
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
	const [arrivals, setArrivals] = useState([])
	const [form, setForm] = useState(emptyForm)
	const [arrivalForm, setArrivalForm] = useState(emptyArrivalForm)
	const [activeTab, setActiveTab] = useState('stock')
	const [stockSearch, setStockSearch] = useState('')
	const [stockCategory, setStockCategory] = useState('')
	const [branchStockSearch, setBranchStockSearch] = useState('')
	const [branchStockBranch, setBranchStockBranch] = useState('')
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [isArrivalFormOpen, setIsArrivalFormOpen] = useState(false)
	const [isLoading, setIsLoading] = useState(true)
	const [isBranchStockLoading, setIsBranchStockLoading] = useState(true)
	const [isSaving, setIsSaving] = useState(false)
	const [isArrivalsLoading, setIsArrivalsLoading] = useState(true)
	const [isSavingArrival, setIsSavingArrival] = useState(false)
	const [loadError, setLoadError] = useState('')
	const [branchStockLoadError, setBranchStockLoadError] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')
	const [arrivalLoadError, setArrivalLoadError] = useState('')
	const [arrivalError, setArrivalError] = useState('')
	const [arrivalNotice, setArrivalNotice] = useState('')

	useEffect(() => {
		let isCurrent = true

		const load = async () => {
			const [result, arrivalResult, branchStockResult] = await Promise.all([
				loadStockInventoryData(sessionToken),
				listTafiAdminStockInventoryArrivals(sessionToken),
				listTafiAdminBranchInventory(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)
			setIsBranchStockLoading(false)
			setIsArrivalsLoading(false)
			if (result.error) {
				setLoadError(result.error.message)
			} else {
				setLoadError('')
				setInventoryItems(result.inventory)
				setStockItems(result.stock)
			}
			if (arrivalResult.error) {
				setArrivalLoadError(arrivalResult.error.message)
			} else {
				setArrivalLoadError('')
				setArrivals(arrivalResult.data ?? [])
			}
			if (branchStockResult.error) {
				setBranchStockLoadError(branchStockResult.error.message)
			} else {
				setBranchStockLoadError('')
				setBranchStockItems(branchStockResult.data ?? [])
			}
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

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

	const handleSubmit = async (event) => {
		event.preventDefault()
		setIsSaving(true)
		setErrorMessage('')
		setNotice('')

		const { error } = await createTafiAdminStockInventory(sessionToken, form.inventoryId, Number(form.onhand))
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

	const handleArrivalSubmit = async (event) => {
		event.preventDefault()
		setIsSavingArrival(true)
		setArrivalError('')
		setArrivalNotice('')

		const { error } = await createTafiAdminStockInventoryArrival(
			sessionToken,
			arrivalForm.stockInventoryId,
			Number(arrivalForm.qty)
		)
		if (error) {
			setIsSavingArrival(false)
			setArrivalError(error.message)
			return
		}

		setArrivalForm(emptyArrivalForm)
		setIsArrivalFormOpen(false)
		const [stockResult, arrivalsResult] = await Promise.all([
			loadStockInventoryData(sessionToken),
			listTafiAdminStockInventoryArrivals(sessionToken)
		])
		setIsSavingArrival(false)
		if (stockResult.error) {
			setLoadError(stockResult.error.message)
		} else {
			setInventoryItems(stockResult.inventory)
			setStockItems(stockResult.stock)
			setLoadError('')
		}
		if (arrivalsResult.error) {
			setArrivalLoadError(arrivalsResult.error.message)
			setArrivalError(arrivalsResult.error.message)
			setArrivalNotice('Arrival recorded, but the arrival history could not be refreshed.')
			return
		}

		setArrivals(arrivalsResult.data ?? [])
		setArrivalLoadError('')
		setArrivalNotice('New arrival recorded and stock quantity updated.')
		if (stockResult.error) {
			setArrivalNotice('Arrival recorded, but stock levels could not be refreshed.')
		}
	}

	const toggleForm = () => {
		setIsFormOpen((current) => !current)
		setForm(emptyForm)
		setErrorMessage('')
		setNotice('')
	}

	const toggleArrivalForm = () => {
		setIsArrivalFormOpen((current) => !current)
		setArrivalForm(emptyArrivalForm)
		setArrivalError('')
		setArrivalNotice('')
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
					id="tafi-branch-inventory-tab"
					className={`accountant-inventory-tab${activeTab === 'branchInventory' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'branchInventory'}
					aria-controls="tafi-branch-inventory-panel"
					onClick={() => setActiveTab('branchInventory')}
				>
					Branch Inventory Stock
				</button>
				<button
					type="button"
					id="tafi-stock-arrivals-tab"
					className={`accountant-inventory-tab${activeTab === 'arrivals' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'arrivals'}
					aria-controls="tafi-stock-arrivals-panel"
					onClick={() => setActiveTab('arrivals')}
				>
					New Arrivals
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
								<p>Select an item from the inventory catalogue and enter its on-hand quantity.</p>
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
							<label>
								<span>On hand</span>
								<input
									type="number"
									min="0"
									step="0.001"
									value={form.onhand}
									onChange={(event) => setForm((current) => ({ ...current, onhand: event.target.value }))}
									required
								/>
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
											<th scope="col">On hand</th>
											<th scope="col">Allocated</th>
											<th scope="col">Available</th>
										</tr>
									</thead>
									<tbody>
										{filteredStockItems.map((item) => (
											<tr key={item.stock_inventory_id}>
												<td>{item.stock_no}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.onhand}</td>
												<td>{item.allocated}</td>
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
			<div
				id="tafi-stock-arrivals-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-arrivals-tab"
				hidden={activeTab !== 'arrivals'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>New arrivals</h2>
						<p>{arrivals.length} arrival{arrivals.length === 1 ? '' : 's'}</p>
					</div>
					<button
						type="button"
						className={`accountant-inventory-add-toggle${isArrivalFormOpen ? ' open' : ''}`}
						aria-expanded={isArrivalFormOpen}
						disabled={isSavingArrival || Boolean(arrivalLoadError)}
						onClick={toggleArrivalForm}
					>
						{isArrivalFormOpen ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
						{isArrivalFormOpen ? 'Cancel' : 'Record arrival'}
					</button>
				</div>

				{isArrivalFormOpen && (
					<>
						<div className="accountant-inventory-heading">
							<div>
								<h2>Record a new arrival</h2>
								<p>Choose an existing stock item and enter the quantity received.</p>
							</div>
						</div>
						<form className="accountant-inventory-form" onSubmit={handleArrivalSubmit}>
							<label className="accountant-inventory-description">
								<span>Stock item</span>
								<select
									value={arrivalForm.stockInventoryId}
									onChange={(event) => setArrivalForm((current) => ({
										...current,
										stockInventoryId: event.target.value
									}))}
									required
								>
									<option value="">Select an existing stock item</option>
									{stockItems.map((item) => (
										<option key={item.stock_inventory_id} value={item.stock_inventory_id}>
											{item.stock_no} - {item.item_description} ({item.unit_of_measure})
										</option>
									))}
								</select>
								{stockItems.length === 0 && (
									<span className="accountant-inventory-field-note">
										Add an item to TAFI Stock Inventory before recording an arrival.
									</span>
								)}
							</label>
							<label>
								<span>Quantity received</span>
								<input
									type="number"
									min="0.001"
									step="0.001"
									value={arrivalForm.qty}
									onChange={(event) => setArrivalForm((current) => ({ ...current, qty: event.target.value }))}
									required
								/>
							</label>
							<button
								type="submit"
								className="accountant-inventory-submit"
								disabled={isSavingArrival || !arrivalForm.stockInventoryId || stockItems.length === 0}
							>
								{isSavingArrival ? 'Saving...' : 'Save arrival'}
							</button>
						</form>
					</>
				)}

				{arrivalLoadError && <p className="accountant-inventory-error" role="alert">{arrivalLoadError}</p>}
				{arrivalError && <p className="accountant-inventory-error" role="alert">{arrivalError}</p>}
				{arrivalNotice && <p className="accountant-inventory-notice" role="status">{arrivalNotice}</p>}

				{isArrivalsLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading arrival history...</p>
				) : arrivals.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Date received</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Item description</th>
									<th scope="col">Unit of measure</th>
									<th scope="col">Quantity received</th>
								</tr>
							</thead>
							<tbody>
								{arrivals.map((arrival) => (
									<tr key={arrival.arrival_id}>
										<td>{new Date(arrival.created_at).toLocaleString()}</td>
										<td>{arrival.stock_no}</td>
										<td>{arrival.item_description}</td>
										<td>{arrival.unit_of_measure}</td>
										<td>{arrival.qty}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : arrivalLoadError ? null : (
					<p className="accountant-inventory-empty">No arrivals have been recorded yet.</p>
				)}
			</div>
		</div>
	)
}