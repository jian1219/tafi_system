import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
	createTafiAdminInventoryInformation,
	listTafiAdminInventoryInformation
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
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [isLoading, setIsLoading] = useState(true)
	const [loadError, setLoadError] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')

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

		const { error } = await createTafiAdminInventoryInformation(sessionToken, form)
		if (error) {
			setIsSaving(false)
			setErrorMessage(error.message)
			return
		}

		setForm(emptyForm)
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
								<p>Enter the stock details to add an item to the shared inventory list.</p>
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
			</div>
		</div>
	)
}