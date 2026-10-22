import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
	createAccountantInventoryInformation,
	listAccountantBranchStockInventory,
	listAccountantInventoryInformation,
	listAccountantTafiStockInventory
} from '../../lib/supabase'

const emptyForm = {
	stockNo: '',
	category: '',
	itemDescription: '',
	unitOfMeasure: '',
	supplier: ''
}

export default function AccountantInventoryInformation({ sessionToken }) {
	const [activeTab, setActiveTab] = useState('inventory-info')
	const [branchStockBranch, setBranchStockBranch] = useState('')
	const [branchStockCategory, setBranchStockCategory] = useState('')
	const [form, setForm] = useState(emptyForm)
	const [inventoryItems, setInventoryItems] = useState([])
	const [tafiStockItems, setTafiStockItems] = useState([])
	const [branchStockItems, setBranchStockItems] = useState([])
	const [isFormOpen, setIsFormOpen] = useState(false)
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
							<p>{tafiStockItems.length} item{tafiStockItems.length === 1 ? '' : 's'}</p>
						</div>
					</div>
					{tafiStockLoadError && <p className="accountant-inventory-error" role="alert">{tafiStockLoadError}</p>}
					{isTafiStockLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading TAFI stock...</p>
					) : tafiStockItems.length ? (
						<div className="accountant-inventory-table-wrap">
							<table className="accountant-inventory-table">
								<thead>
									<tr>
										<th scope="col">Stock no.</th>
										<th scope="col">Category</th>
										<th scope="col">Item Description</th>
										<th scope="col">Unit of measure</th>
										<th scope="col">On hand</th>
										<th scope="col">Allocated</th>
										<th scope="col">Available</th>
									</tr>
								</thead>
								<tbody>
									{tafiStockItems.map((item) => (
										<tr key={item.stock_inventory_id}>
											<td>{item.stock_no}</td>
											<td>{item.category}</td>
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
					) : !tafiStockLoadError && (
						<p className="accountant-inventory-empty">No TAFI stock items have been added yet.</p>
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