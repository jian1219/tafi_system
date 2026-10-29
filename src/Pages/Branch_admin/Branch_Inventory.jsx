import { useEffect, useMemo, useState } from 'react'
import { listBranchInventory } from '../../lib/supabase'

export default function BranchInventory({ branchName = 'Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [inventoryItems, setInventoryItems] = useState([])
	const [searchTerm, setSearchTerm] = useState('')
	const [categoryFilter, setCategoryFilter] = useState('')
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [loadError, setLoadError] = useState('')
	const [retryCount, setRetryCount] = useState(0)

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

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-list-heading">
				<div>
					<h2>{branchName} inventory</h2>
					<p>{filteredItems.length} of {inventoryItems.length} items</p>
				</div>
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
			) : (
				<p className="accountant-inventory-empty">No shared inventory items are available yet.</p>
			)}
		</section>
	)
}