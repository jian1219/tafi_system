import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
	addBranchInventoryItem,
	listBranchInventory,
	listBranchTafiStockItems
} from '../../lib/supabase'

const emptyForm = {
	category: '',
	stockInventoryId: '',
	available: ''
}

async function loadInventoryData(sessionToken) {
	const [catalogResult, inventoryResult] = await Promise.all([
		listBranchTafiStockItems(sessionToken),
		listBranchInventory(sessionToken)
	])
	return {
		catalog: catalogResult.data ?? [],
		inventory: inventoryResult.data ?? [],
		error: catalogResult.error ?? inventoryResult.error
	}
}

export default function BranchInventory({ branchName = 'Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [catalogItems, setCatalogItems] = useState([])
	const [inventoryItems, setInventoryItems] = useState([])
	const [form, setForm] = useState(emptyForm)
	const [searchTerm, setSearchTerm] = useState('')
	const [categoryFilter, setCategoryFilter] = useState('')
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [loadError, setLoadError] = useState('')
	const [retryCount, setRetryCount] = useState(0)
	const [isSaving, setIsSaving] = useState(false)
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')

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

			const result = await loadInventoryData(sessionToken)
			if (!isCurrent) return
			setIsLoading(false)
			if (result.error) {
				setLoadError(result.error.message)
				return
			}
			setCatalogItems(result.catalog)
			setInventoryItems(result.inventory)
			setLoadError('')
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [retryCount, sessionToken])

	const categories = useMemo(
		() => [...new Set(catalogItems.map((item) => item.category).filter(Boolean))]
			.sort((a, b) => a.localeCompare(b)),
		[catalogItems]
	)

	const branchStockIds = useMemo(
		() => new Set(inventoryItems.map((item) => item.stock_inventory_id)),
		[inventoryItems]
	)

	const availableItems = useMemo(() => catalogItems.filter((item) => (
		!branchStockIds.has(item.stock_inventory_id)
		&& (!form.category || item.category === form.category)
	)), [branchStockIds, catalogItems, form.category])

	const filteredItems = useMemo(() => {
		const query = searchTerm.trim().toLocaleLowerCase()
		return inventoryItems.filter((item) => {
			if (categoryFilter && item.category !== categoryFilter) return false
			if (!query) return true
			return [item.stock_no, item.item_description, item.unit_of_measure, item.category]
				.some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [categoryFilter, inventoryItems, searchTerm])

	const handleSubmit = async (event) => {
		event.preventDefault()
		setIsSaving(true)
		setErrorMessage('')
		setNotice('')

		const { error } = await addBranchInventoryItem(
			sessionToken,
			form.stockInventoryId,
			Number(form.available)
		)
		if (error) {
			setIsSaving(false)
			setErrorMessage(error.message)
			return
		}

		setForm(emptyForm)
		setIsFormOpen(false)
		const result = await loadInventoryData(sessionToken)
		setIsSaving(false)
		if (result.error) {
			setLoadError(result.error.message)
			setNotice('Inventory item added, but the list could not be refreshed.')
			return
		}

		setCatalogItems(result.catalog)
		setInventoryItems(result.inventory)
		setLoadError('')
		setNotice('Item added to branch inventory.')
	}

	const toggleForm = () => {
		setIsFormOpen((current) => !current)
		setForm(emptyForm)
		setErrorMessage('')
		setNotice('')
	}

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-list-heading">
				<div>
					<h2>{branchName} inventory</h2>
					<p>{filteredItems.length} of {inventoryItems.length} items</p>
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
			{isFormOpen && (
				<>
					<div className="accountant-inventory-heading">
						<div>
							<h2>Add item from TAFI stock</h2>
							<p>Select an item from the shared TAFI Stock Inventory and enter this branch&apos;s on-hand quantity.</p>
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
									stockInventoryId: ''
								}))}
							>
								<option value="">All categories</option>
								{categories.map((category) => (
									<option key={category} value={category}>{category}</option>
								))}
							</select>
						</label>
						<label className="accountant-inventory-description">
							<span>TAFI stock item</span>
							<select
								value={form.stockInventoryId}
								onChange={(event) => setForm((current) => ({
									...current,
									stockInventoryId: event.target.value
								}))}
								required
							>
								<option value="">Select a TAFI stock item</option>
								{availableItems.map((item) => (
									<option key={item.stock_inventory_id} value={item.stock_inventory_id}>
										{item.stock_no} - {item.item_description} ({item.unit_of_measure})
									</option>
								))}
							</select>
							{availableItems.length === 0 && (
								<span className="accountant-inventory-field-note">
									No unassigned TAFI stock items are available in this category.
								</span>
							)}
						</label>
						<label>
							<span>Available</span>
							<input
								type="number"
								min="0"
								step="0.001"
								value={form.available}
								onChange={(event) => setForm((current) => ({ ...current, available: event.target.value }))}
								required
							/>
						</label>
						<button type="submit" className="accountant-inventory-submit" disabled={isSaving || !form.stockInventoryId}>
							{isSaving ? 'Saving...' : 'Add to branch inventory'}
						</button>
					</form>
				</>
			)}

			{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
			{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}

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
							<table className="accountant-inventory-table">
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
										<tr key={item.branch_inventory_id}>
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
			) : errorMessage ? null : (
				<p className="accountant-inventory-empty">No items have been added to this branch yet.</p>
			)}
		</section>
	)
}