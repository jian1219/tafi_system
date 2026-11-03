import { useEffect, useMemo, useState } from 'react'
import { listTafiAdminBranchInventory } from '../../lib/supabase'

export default function TafiBranchInventoryStock({ sessionToken }) {
	const [branchStockItems, setBranchStockItems] = useState([])
	const [branchStockSearch, setBranchStockSearch] = useState('')
	const [branchStockBranch, setBranchStockBranch] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [loadError, setLoadError] = useState('')

	useEffect(() => {
		let isCurrent = true

		const loadBranchStock = async () => {
			setIsLoading(true)
			setLoadError('')
			const { data, error } = await listTafiAdminBranchInventory(sessionToken)
			if (!isCurrent) return
			setIsLoading(false)
			if (error) {
				setLoadError(error.message)
				return
			}
			setBranchStockItems(data ?? [])
		}

		loadBranchStock()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	const branchNames = useMemo(
		() => [...new Set(branchStockItems.map((item) => item.branch_name).filter(Boolean))]
			.sort((left, right) => left.localeCompare(right)),
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
		setIsLoading(true)
		setLoadError('')
		const { data, error } = await listTafiAdminBranchInventory(sessionToken)
		setIsLoading(false)
		if (error) {
			setLoadError(error.message)
			return
		}
		setBranchStockItems(data ?? [])
	}

	return (
		<div className="tafi-admin-section accountant-inventory-section">
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
					disabled={isLoading}
				>
					{isLoading ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>
			{loadError && (
				<p className="accountant-inventory-error" role="alert">{loadError}</p>
			)}
			{isLoading ? (
				<p className="accountant-inventory-empty" role="status">Loading branch inventory stock...</p>
			) : !loadError && branchStockItems.length ? (
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
			) : loadError ? null : (
				<p className="accountant-inventory-empty">No branch inventory stock has been recorded yet.</p>
			)}
		</div>
	)
}