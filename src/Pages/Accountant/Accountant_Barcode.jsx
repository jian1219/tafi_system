import { useEffect, useMemo, useState } from 'react'
import {
	listAccountantTafiBarcodeInventory,
	listAccountantTafiStockInRecords,
	listAccountantTafiStockOutRecords,
	listAccountantTafiSummaryStockRecords
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

function formatPrice(value) {
	if (value === null || value === undefined || value === '') return 'Not set'

	return new Intl.NumberFormat('en-PH', {
		style: 'currency',
		currency: 'PHP'
	}).format(Number(value))
}

export default function AccountantBarcode({ sessionToken }) {
	const [activeTab, setActiveTab] = useState('barcodes')
	const [activeRecordTab, setActiveRecordTab] = useState('stockIn')
	const [barcodeItems, setBarcodeItems] = useState([])
	const [barcodeSearch, setBarcodeSearch] = useState('')
	const [isBarcodeLoading, setIsBarcodeLoading] = useState(true)
	const [barcodeError, setBarcodeError] = useState('')
	const [stockInRecords, setStockInRecords] = useState([])
	const [stockInMonth, setStockInMonth] = useState(getLocalMonthInputValue)
	const [stockInDay, setStockInDay] = useState('')
	const [isStockInLoading, setIsStockInLoading] = useState(true)
	const [stockInError, setStockInError] = useState('')
	const [stockOutRecords, setStockOutRecords] = useState([])
	const [stockOutMonth, setStockOutMonth] = useState(getLocalMonthInputValue)
	const [stockOutBranch, setStockOutBranch] = useState('')
	const [isStockOutLoading, setIsStockOutLoading] = useState(true)
	const [stockOutError, setStockOutError] = useState('')
	const [summaryStockRecords, setSummaryStockRecords] = useState([])
	const [summaryMonth, setSummaryMonth] = useState(getLocalMonthInputValue)
	const [isSummaryLoading, setIsSummaryLoading] = useState(true)
	const [summaryError, setSummaryError] = useState('')

	const filteredBarcodeItems = useMemo(() => {
		const query = barcodeSearch.trim().toLocaleLowerCase()
		if (!query) return barcodeItems

		return barcodeItems.filter((item) => [
			item.barcode,
			item.stock_no,
			item.item_description,
			item.unit_of_measure,
			item.scan_count,
			item.price,
			item.total_price
		].some((value) => String(value ?? '').toLocaleLowerCase().includes(query)))
	}, [barcodeItems, barcodeSearch])
	const stockOutBranches = useMemo(
		() => [...new Set([
			...stockOutRecords.map((record) => record.branch),
			stockOutBranch
		].filter(Boolean))]
			.sort((left, right) => left.localeCompare(right)),
		[stockOutBranch, stockOutRecords]
	)
	const filteredStockOutRecords = useMemo(
		() => stockOutRecords.filter((record) => record.branch === stockOutBranch),
		[stockOutBranch, stockOutRecords]
	)
	const stockOutRecordsByDate = useMemo(() => {
		const groups = new Map()
		filteredStockOutRecords.forEach((record) => {
			const dateKey = String(record.date ?? '').slice(0, 10)
			if (!groups.has(dateKey)) groups.set(dateKey, [])
			groups.get(dateKey).push(record)
		})
		return [...groups.entries()]
			.sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
			.map(([dateKey, records]) => ({ dateKey, records }))
	}, [filteredStockOutRecords])

	useEffect(() => {
		if (activeTab !== 'barcodes') return

		let isCurrent = true

		const loadBarcodeInventory = async () => {
			if (!sessionToken) {
				setIsBarcodeLoading(false)
				setBarcodeError('Accountant session is unavailable. Please sign in again.')
				return
			}

			setIsBarcodeLoading(true)
			const { data, error } = await listAccountantTafiBarcodeInventory(sessionToken)
			if (!isCurrent) return
			setIsBarcodeLoading(false)
			if (error) {
				setBarcodeError(error.message)
				return
			}

			setBarcodeError('')
			setBarcodeItems(data ?? [])
		}

		loadBarcodeInventory()
		window.addEventListener('focus', loadBarcodeInventory)
		return () => {
			isCurrent = false
			window.removeEventListener('focus', loadBarcodeInventory)
		}
	}, [activeTab, sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadStockInRecords = async () => {
			if (!sessionToken) {
				setIsStockInLoading(false)
				setStockInError('Accountant session is unavailable. Please sign in again.')
				return
			}

			setIsStockInLoading(true)
			setStockInError('')
			const { data, error } = await listAccountantTafiStockInRecords(
				sessionToken,
				stockInMonth || null,
				stockInDay || null
			)
			if (!isCurrent) return
			setIsStockInLoading(false)
			if (error) {
				setStockInError(error.message)
				return
			}

			setStockInRecords(data ?? [])
		}

		loadStockInRecords()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, stockInDay, stockInMonth])

	useEffect(() => {
		let isCurrent = true

		const loadStockOutRecords = async () => {
			if (!sessionToken) {
				setIsStockOutLoading(false)
				setStockOutError('Accountant session is unavailable. Please sign in again.')
				return
			}

			setIsStockOutLoading(true)
			setStockOutError('')
			const { data, error } = await listAccountantTafiStockOutRecords(
				sessionToken,
				stockOutMonth || null
			)
			if (!isCurrent) return
			setIsStockOutLoading(false)
			if (error) {
				setStockOutError(error.message)
				return
			}

			setStockOutRecords(data ?? [])
		}

		loadStockOutRecords()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, stockOutMonth])

	useEffect(() => {
		let isCurrent = true

		const loadSummaryRecords = async () => {
			if (!sessionToken) {
				setIsSummaryLoading(false)
				setSummaryError('Accountant session is unavailable. Please sign in again.')
				return
			}

			setIsSummaryLoading(true)
			setSummaryError('')
			const { data, error } = await listAccountantTafiSummaryStockRecords(
				sessionToken,
				summaryMonth || null
			)
			if (!isCurrent) return
			setIsSummaryLoading(false)
			if (error) {
				setSummaryError(error.message)
				return
			}

			setSummaryStockRecords(data ?? [])
		}

		loadSummaryRecords()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, summaryMonth])

	const refreshBarcodeInventory = async () => {
		setIsBarcodeLoading(true)
		setBarcodeError('')
		const { data, error } = await listAccountantTafiBarcodeInventory(sessionToken)
		setIsBarcodeLoading(false)
		if (error) {
			setBarcodeError(error.message)
			return
		}

		setBarcodeItems(data ?? [])
	}

	const refreshStockInRecords = async () => {
		setIsStockInLoading(true)
		setStockInError('')
		const { data, error } = await listAccountantTafiStockInRecords(
			sessionToken,
			stockInMonth || null,
			stockInDay || null
		)
		setIsStockInLoading(false)
		if (error) {
			setStockInError(error.message)
			return
		}

		setStockInRecords(data ?? [])
	}

	const refreshStockOutRecords = async () => {
		setIsStockOutLoading(true)
		setStockOutError('')
		const { data, error } = await listAccountantTafiStockOutRecords(
			sessionToken,
			stockOutMonth || null
		)
		setIsStockOutLoading(false)
		if (error) {
			setStockOutError(error.message)
			return
		}

		setStockOutRecords(data ?? [])
	}

	const refreshSummaryRecords = async () => {
		setIsSummaryLoading(true)
		setSummaryError('')
		const { data, error } = await listAccountantTafiSummaryStockRecords(
			sessionToken,
			summaryMonth || null
		)
		setIsSummaryLoading(false)
		if (error) {
			setSummaryError(error.message)
			return
		}

		setSummaryStockRecords(data ?? [])
	}

	return (
		<div className="tafi-admin-section accountant-inventory-section">
			<div className="accountant-inventory-tabs" role="tablist" aria-label="TAFI barcode and stock records">
				<button
					type="button"
					id="accountant-tafi-barcode-tab"
					className={`accountant-inventory-tab${activeTab === 'barcodes' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'barcodes'}
					aria-controls="accountant-tafi-barcode-panel"
					onClick={() => setActiveTab('barcodes')}
				>
					TAFI Barcode Inventory
				</button>
				<button
					type="button"
					id="accountant-tafi-stock-records-tab"
					className={`accountant-inventory-tab${activeTab === 'records' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'records'}
					aria-controls="accountant-tafi-stock-records-panel"
					onClick={() => setActiveTab('records')}
				>
					Stock Records
				</button>
			</div>

			<div
				id="accountant-tafi-barcode-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="accountant-tafi-barcode-tab"
				hidden={activeTab !== 'barcodes'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>TAFI Barcode Inventory</h2>
						<p>
							{filteredBarcodeItems.length === barcodeItems.length
								? `${barcodeItems.length} barcode item${barcodeItems.length === 1 ? '' : 's'}`
								: `${filteredBarcodeItems.length} of ${barcodeItems.length} barcode items`}
						</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={refreshBarcodeInventory}
						disabled={isBarcodeLoading}
					>
						{isBarcodeLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				{barcodeError && <p className="accountant-inventory-error" role="alert">{barcodeError}</p>}
				{isBarcodeLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading barcode inventory...</p>
				) : barcodeError ? null : barcodeItems.length ? (
					<>
						<div className="tafi-stock-inventory-filters" role="search" aria-label="Search TAFI barcode inventory">
							<label>
								<span>Search barcode inventory</span>
								<input
									type="search"
									value={barcodeSearch}
									onChange={(event) => setBarcodeSearch(event.target.value)}
									placeholder="Search barcode, stock no., description, unit, or price"
								/>
							</label>
						</div>
						{filteredBarcodeItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Barcode</th>
											<th scope="col">Stock no.</th>
											<th scope="col">Item description</th>
											<th scope="col">Unit of measure</th>
											<th scope="col">Item count</th>
											<th scope="col">Per item price</th>
											<th scope="col">Total Price</th>
										</tr>
									</thead>
									<tbody>
										{filteredBarcodeItems.map((item) => (
											<tr key={item.barcode}>
												<td>{item.barcode}</td>
												<td>{item.stock_no}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.scan_count}</td>
												<td>{formatPrice(item.price)}</td>
												<td>{formatPrice(item.total_price)}</td>
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
				id="accountant-tafi-stock-records-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="accountant-tafi-stock-records-tab"
				hidden={activeTab !== 'records'}
			>
				<div className="accountant-inventory-tabs tafi-stock-record-tabs" role="tablist" aria-label="Stock record type">
					<button
						type="button"
						id="accountant-tafi-stock-in-tab"
						className={`accountant-inventory-tab${activeRecordTab === 'stockIn' ? ' active' : ''}`}
						role="tab"
						aria-selected={activeRecordTab === 'stockIn'}
						aria-controls="accountant-tafi-stock-in-panel"
						onClick={() => setActiveRecordTab('stockIn')}
					>
						Stock In Records
					</button>
					<button
						type="button"
						id="accountant-tafi-stock-out-tab"
						className={`accountant-inventory-tab${activeRecordTab === 'stockOut' ? ' active' : ''}`}
						role="tab"
						aria-selected={activeRecordTab === 'stockOut'}
						aria-controls="accountant-tafi-stock-out-panel"
						onClick={() => setActiveRecordTab('stockOut')}
					>
						Stock Out Records
					</button>
					<button
						type="button"
						id="accountant-tafi-stock-summary-tab"
						className={`accountant-inventory-tab${activeRecordTab === 'summary' ? ' active' : ''}`}
						role="tab"
						aria-selected={activeRecordTab === 'summary'}
						aria-controls="accountant-tafi-stock-summary-panel"
						onClick={() => setActiveRecordTab('summary')}
					>
						COGS
					</button>
				</div>

				<div
					id="accountant-tafi-stock-in-panel"
					className="tafi-stock-records-subpanel"
					role="tabpanel"
					aria-labelledby="accountant-tafi-stock-in-tab"
					hidden={activeRecordTab !== 'stockIn'}
				>
					<div className="accountant-inventory-list-heading">
						<div>
							<h2>Stock In Records</h2>
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
						<label htmlFor="accountant-tafi-stock-in-month">
							<span>Filter by month</span>
							<input
								id="accountant-tafi-stock-in-month"
								type="month"
								value={stockInMonth}
								required
								onChange={(event) => {
									if (event.target.value) setStockInMonth(event.target.value)
									setStockInDay('')
								}}
							/>
						</label>
						<label htmlFor="accountant-tafi-stock-in-day">
							<span>Filter by day (optional)</span>
							<input
								id="accountant-tafi-stock-in-day"
								type="date"
								value={stockInDay}
								onChange={(event) => {
									const date = event.target.value
									setStockInDay(date)
									if (date) setStockInMonth(date.slice(0, 7))
								}}
							/>
						</label>
					</div>
					{stockInError && <p className="accountant-inventory-error" role="alert">{stockInError}</p>}
					{isStockInLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading stock-in records...</p>
					) : stockInError ? null : stockInRecords.length ? (
						<div className="accountant-inventory-table-wrap">
							<table className="accountant-inventory-table">
								<thead>
									<tr>
										<th scope="col">Barcode</th>
										<th scope="col">Stock no.</th>
										<th scope="col">Item description</th>
										<th scope="col">Unit of measure</th>
										<th scope="col">Stock in count</th>
										<th scope="col">Per Item Price</th>
										<th scope="col">Total Price</th>
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
											<td>{formatPrice(record.price)}</td>
											<td>{formatPrice(record.total_price)}</td>
											<td>{formatRecordDate(record.date)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="accountant-inventory-empty">No stock-in records found for this filter.</p>
					)}
				</div>

				<div
					id="accountant-tafi-stock-out-panel"
					className="tafi-stock-records-subpanel"
					role="tabpanel"
					aria-labelledby="accountant-tafi-stock-out-tab"
					hidden={activeRecordTab !== 'stockOut'}
				>
					<div className="accountant-inventory-list-heading">
						<div>
							<h2>Stock Out Records</h2>
							<p>
								{stockOutBranch
									? `${filteredStockOutRecords.length} record${filteredStockOutRecords.length === 1 ? '' : 's'} for ${stockOutBranch} in ${formatRecordMonth(stockOutMonth)}`
									: `Select a branch to view stock-out records for ${formatRecordMonth(stockOutMonth)}`}
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
						<label htmlFor="accountant-tafi-stock-out-month">
							<span>Filter by month</span>
							<input
								id="accountant-tafi-stock-out-month"
								type="month"
								value={stockOutMonth}
								required
								onChange={(event) => {
									if (event.target.value) setStockOutMonth(event.target.value)
								}}
							/>
						</label>
						<label htmlFor="accountant-tafi-stock-out-branch">
							<span>Filter by branch</span>
							<select
								id="accountant-tafi-stock-out-branch"
								value={stockOutBranch}
								onChange={(event) => setStockOutBranch(event.target.value)}
							>
								<option value="" disabled>Select a branch</option>
								{stockOutBranches.map((branch) => (
									<option key={branch} value={branch}>{branch}</option>
								))}
							</select>
						</label>
					</div>
					{stockOutError && <p className="accountant-inventory-error" role="alert">{stockOutError}</p>}
					{isStockOutLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading stock-out records...</p>
					) : stockOutError ? null : !stockOutBranch ? (
						<p className="accountant-inventory-empty" role="status">
							Select a branch to view its stock-out records.
						</p>
					) : filteredStockOutRecords.length ? (
						stockOutRecordsByDate.map(({ dateKey, records }) => (
							<div className="tafi-stock-delivery-date-group" key={dateKey || 'date-unavailable'}>
								<h3 className="tafi-stock-delivery-date-heading">{formatRecordDate(dateKey)}</h3>
								<div className="accountant-inventory-table-wrap">
									<table className="accountant-inventory-table">
										<thead>
											<tr>
												<th scope="col">Barcode</th>
												<th scope="col">Stock no.</th>
												<th scope="col">Item description</th>
												<th scope="col">Unit of measure</th>
												<th scope="col">Branch</th>
												<th scope="col">Stock out count</th>
												<th scope="col">Per Item Price</th>
												<th scope="col">Total Price</th>
											</tr>
										</thead>
										<tbody>
											{records.map((record, index) => (
												<tr key={`${record.barcode}-${record.stock_no}-${dateKey}-${index}`}>
													<td>{record.barcode}</td>
													<td>{record.stock_no}</td>
													<td>{record.item_description}</td>
													<td>{record.unit_of_measure}</td>
													<td>{record.branch || '—'}</td>
													<td>{record.stock_out_count}</td>
													<td>{formatPrice(record.price)}</td>
													<td>{formatPrice(record.total_price)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						))
					) : (
						<p className="accountant-inventory-empty">No stock-out records found for this filter.</p>
					)}
				</div>

				<div
					id="accountant-tafi-stock-summary-panel"
					className="tafi-stock-records-subpanel"
					role="tabpanel"
					aria-labelledby="accountant-tafi-stock-summary-tab"
					hidden={activeRecordTab !== 'summary'}
				>
					<div className="accountant-inventory-list-heading">
						<div>
							<h2>Summary Stock Record</h2>
							<p>
								{summaryStockRecords.length} item summar{summaryStockRecords.length === 1 ? 'y' : 'ies'}
								{` for ${formatRecordMonth(summaryMonth)}`}
							</p>
						</div>
						<button
							type="button"
							className="accountant-inventory-add-toggle"
							onClick={refreshSummaryRecords}
							disabled={isSummaryLoading}
						>
							{isSummaryLoading ? 'Refreshing...' : 'Refresh'}
						</button>
					</div>
					<div className="tafi-stock-record-filters">
						<label htmlFor="accountant-tafi-stock-summary-month">
							<span>Filter by month</span>
							<input
								id="accountant-tafi-stock-summary-month"
								type="month"
								value={summaryMonth}
								required
								onChange={(event) => {
									if (event.target.value) setSummaryMonth(event.target.value)
								}}
							/>
						</label>
					</div>
					{summaryError && <p className="accountant-inventory-error" role="alert">{summaryError}</p>}
					{isSummaryLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading stock record summary...</p>
					) : summaryError ? null : summaryStockRecords.length ? (
						<div
							className="accountant-inventory-table-wrap tafi-summary-stock-record-table-wrap"
							role="region"
							aria-label="Summary stock record table"
							tabIndex={0}
						>
							<table className="accountant-inventory-table tafi-summary-stock-record-table">
								<thead>
									<tr>
										<th scope="col" rowSpan="2">Stock no.</th>
										<th scope="col" rowSpan="2">Item description</th>
										<th scope="col" rowSpan="2">Unit of measure</th>
										<th scope="colgroup" colSpan="2">Beginning Inventory</th>
										<th scope="colgroup" colSpan="2">Stock in</th>
										<th scope="colgroup" colSpan="2">Stock out</th>
										<th scope="colgroup" colSpan="2">Ending Inventory</th>
									</tr>
									<tr>
										<th scope="col">Quantity</th>
										<th scope="col">Total</th>
										<th scope="col">Quantity</th>
										<th scope="col">Total</th>
										<th scope="col">Quantity</th>
										<th scope="col">Total</th>
										<th scope="col">Quantity</th>
										<th scope="col">Total</th>
									</tr>
								</thead>
								<tbody>
									{summaryStockRecords.map((record) => (
										<tr key={record.stock_no}>
											<td>{record.stock_no}</td>
											<td>{record.item_description}</td>
											<td>{record.unit_of_measure}</td>
											<td>{Number(record.beginning_inventory_quantity).toLocaleString()}</td>
											<td>{formatPrice(record.beginning_inventory_total)}</td>
											<td>{Number(record.stock_in_quantity).toLocaleString()}</td>
											<td>{formatPrice(record.stock_in_total)}</td>
											<td>{Number(record.stock_out_quantity).toLocaleString()}</td>
											<td>{formatPrice(record.stock_out_total)}</td>
											<td>{Number(record.ending_inventory_quantity).toLocaleString()}</td>
											<td>{formatPrice(record.ending_inventory_total)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="accountant-inventory-empty">No stock records found for this month.</p>
					)}
				</div>
			</div>
		</div>
	)
}