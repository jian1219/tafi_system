import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
	createTafiAdminInventoryInformation,
	deleteTafiAdminInventoryInformation,
	listTafiAdminInventoryInformation,
	updateTafiAdminInventoryInformation
} from '../../lib/supabase'

const emptyForm = {
	stockNo: '',
	category: '',
	itemDescription: '',
	unitOfMeasure: '',
	supplier: ''
}

export default function TafiInventory({ sessionToken }) {
	const [form, setForm] = useState(emptyForm)
	const [inventoryItems, setInventoryItems] = useState([])
	const [inventorySearch, setInventorySearch] = useState('')
	const [inventoryCategory, setInventoryCategory] = useState('')
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [editingItemId, setEditingItemId] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [loadError, setLoadError] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')

	const inventoryCategories = useMemo(
		() => [...new Set(inventoryItems.map((item) => item.category).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[inventoryItems]
	)
	const filteredInventoryItems = useMemo(() => {
		const query = inventorySearch.trim().toLocaleLowerCase()
		return inventoryItems.filter((item) => {
			if (inventoryCategory && item.category !== inventoryCategory) return false
			if (!query) return true
			return [
				item.stock_no,
				item.category,
				item.item_description,
				item.unit_of_measure,
				item.supplier
			].some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [inventoryCategory, inventoryItems, inventorySearch])

	useEffect(() => {
		let isCurrent = true

		const loadInventory = async () => {
			const { data, error } = await listTafiAdminInventoryInformation(sessionToken)
			if (!isCurrent) return
			setIsLoading(false)
			if (error) {
				setLoadError(true)
				setErrorMessage(error.message)
				return
			}
			setLoadError(false)
			setInventoryItems(data ?? [])
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

		const { error } = editingItemId
			? await updateTafiAdminInventoryInformation(sessionToken, editingItemId, form)
			: await createTafiAdminInventoryInformation(sessionToken, form)
		if (error) {
			setIsSaving(false)
			setErrorMessage(error.message)
			return
		}

		setForm(emptyForm)
		setEditingItemId(null)
		const { data, error: refreshError } = await listTafiAdminInventoryInformation(sessionToken)
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
		setNotice(`Inventory item ${editingItemId ? 'updated' : 'added'} successfully.`)
	}

	const toggleForm = () => {
		setIsFormOpen((current) => !current)
		setForm(emptyForm)
		setEditingItemId(null)
		setErrorMessage('')
		setNotice('')
	}

	const editItem = (item) => {
		setForm({
			stockNo: item.stock_no,
			category: item.category,
			itemDescription: item.item_description,
			unitOfMeasure: item.unit_of_measure,
			supplier: item.supplier
		})
		setEditingItemId(item.inventory_id)
		setIsFormOpen(true)
		setErrorMessage('')
		setNotice('')
	}

	const deleteItem = async (item) => {
		if (!window.confirm(
			`Permanently delete "${item.item_description}" and all linked stock balances, barcode records, requests, receipts, usage logs, stock history, and preparation records? This cannot be undone.`
		)) return

		setIsSaving(true)
		setErrorMessage('')
		setNotice('')

		const { data: deleted, error } = await deleteTafiAdminInventoryInformation(
			sessionToken,
			item.inventory_id
		)
		if (error) {
			setIsSaving(false)
			setErrorMessage(error.message)
			return
		}
		if (deleted !== true) {
			setIsSaving(false)
			setErrorMessage('The inventory item was not deleted.')
			return
		}

		const { data, error: refreshError } = await listTafiAdminInventoryInformation(sessionToken)
		setIsSaving(false)
		if (refreshError) {
			setLoadError(true)
			setNotice('Inventory item deleted, but the list could not be refreshed.')
			setErrorMessage(refreshError.message)
			return
		}

		setLoadError(false)
		setInventoryItems(data ?? [])
		if (editingItemId === item.inventory_id) {
			setForm(emptyForm)
			setEditingItemId(null)
			setIsFormOpen(false)
		}
		setNotice('Inventory item deleted successfully.')
	}

	return (
		<div className="tafi-admin-section accountant-inventory-section">
			<div className="accountant-inventory-tabs" role="tablist" aria-label="Inventory information">
				<button
					type="button"
					id="tafi-inventory-tab"
					className="accountant-inventory-tab active"
					role="tab"
					aria-selected="true"
					aria-controls="tafi-inventory-panel"
				>
					Shared Inventory Information
				</button>
			</div>
			<div
				id="tafi-inventory-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-inventory-tab"
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Inventory items</h2>
						<p>
							{filteredInventoryItems.length === inventoryItems.length
								? `${inventoryItems.length} item${inventoryItems.length === 1 ? '' : 's'}`
								: `${filteredInventoryItems.length} of ${inventoryItems.length} items`}
						</p>
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
								<h2>{editingItemId ? 'Edit inventory information' : 'Add inventory information'}</h2>
								<p>
									{editingItemId
										? 'Update the stock details in the shared inventory list.'
										: 'Enter the stock details to add an item to the shared inventory list.'}
								</p>
							</div>
						</div>
						<form className="accountant-inventory-form" onSubmit={handleSubmit}>
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
								{isSaving ? 'Saving...' : editingItemId ? 'Update inventory item' : 'Add inventory item'}
							</button>
						</form>
					</>
				)}

				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}

				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading inventory items...</p>
				) : inventoryItems.length ? (
					<>
						<div className="tafi-stock-inventory-filters" role="search" aria-label="Filter inventory information">
							<label>
								<span>Search inventory</span>
								<input
									type="search"
									value={inventorySearch}
									onChange={(event) => setInventorySearch(event.target.value)}
									placeholder="Search stock no., description, unit, or supplier"
								/>
							</label>
							<label>
								<span>Category</span>
								<select
									value={inventoryCategory}
									onChange={(event) => setInventoryCategory(event.target.value)}
								>
									<option value="">All categories</option>
									{inventoryCategories.map((category) => (
										<option key={category} value={category}>{category}</option>
									))}
								</select>
							</label>
						</div>
						{filteredInventoryItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Stock no.</th>
											<th scope="col">Category</th>
											<th scope="col">Item Description</th>
											<th scope="col">Unit of measure</th>
											<th scope="col">Supplier</th>
											<th scope="col">Actions</th>
										</tr>
									</thead>
									<tbody>
										{filteredInventoryItems.map((item) => (
											<tr key={item.inventory_id}>
												<td>{item.stock_no}</td>
												<td>{item.category}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.supplier}</td>
												<td>
													<div className="accountant-inventory-actions">
														<button
															type="button"
															className="accountant-inventory-action"
															aria-label={`Edit ${item.item_description}`}
															disabled={isSaving}
															onClick={() => editItem(item)}
														>
															<Pencil size={15} aria-hidden="true" />
															Edit
														</button>
														<button
															type="button"
															className="accountant-inventory-action delete"
															aria-label={`Delete ${item.item_description}`}
															disabled={isSaving}
															onClick={() => deleteItem(item)}
														>
															<Trash2 size={15} aria-hidden="true" />
															Delete
														</button>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="accountant-inventory-empty">No inventory items match those filters.</p>
						)}
					</>
				) : loadError ? null : (
					<p className="accountant-inventory-empty">No inventory items have been added yet.</p>
				)}
			</div>
		</div>
	)
}