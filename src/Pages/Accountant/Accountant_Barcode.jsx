import { useEffect, useMemo, useState } from 'react'
import {
	listAccountantTafiBarcodeInventory,
	listAccountantTafiStockInRecords,
	listAccountantTafiStockOutRecords,
	listAccountantTafiSummaryStockRecords,
	listAccountantInventoryStockCardRecords,
	listAccountantInventoryInformation,
	updateAccountantInventoryStockCardMetadata
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

function formatStockCardPrice(value) {
	if (value === null || value === undefined || value === '') return ''
	return formatPrice(value)
}

function formatStockCardQuantity(value) {
	if (value === null || value === undefined || value === '') return ''
	return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function hasStockCardOutQuantity(record) {
	return record.out_qty !== null && record.out_qty !== undefined && record.out_qty !== ''
}

function getStockCardMovementTotal(total, quantity, unitCost) {
	if (total !== null && total !== undefined && total !== '') {
		const numericTotal = Number(total)
		return Number.isFinite(numericTotal) ? numericTotal : null
	}

	const numericQuantity = Number(quantity ?? 0)
	if (!Number.isFinite(numericQuantity)) return null
	if (numericQuantity === 0) return 0

	const numericUnitCost = Number(unitCost)
	return unitCost !== null && unitCost !== undefined && unitCost !== ''
		&& Number.isFinite(numericUnitCost)
		? numericQuantity * numericUnitCost
		: null
}

function calculateStockCardBalances(records) {
	let balanceQty = 0
	let balanceUnitCost = null
	let runningBalance = 0

	return records.map((record) => {
		const previousBalanceQty = balanceQty
		const inQty = Number(record.in_qty ?? 0)
		const outQty = Number(record.out_qty ?? 0)
		balanceQty += inQty - outQty

		const inUnitCostKey = getStockCardCostKey(record.in_unit_cost)
		if (inQty > 0) {
			if (previousBalanceQty === 0) {
				balanceUnitCost = inUnitCostKey ? record.in_unit_cost : null
			} else if (
				inUnitCostKey
				&& balanceUnitCost !== null
				&& getStockCardCostKey(balanceUnitCost) !== inUnitCostKey
			) {
				balanceUnitCost = null
			}
		}

		const inTotal = getStockCardMovementTotal(record.in_total, record.in_qty, record.in_unit_cost)
		const outTotal = getStockCardMovementTotal(record.out_total, record.out_qty, record.out_unit_cost)
		if (runningBalance !== null) {
			runningBalance = inTotal === null || outTotal === null
				? null
				: runningBalance + inTotal - outTotal
		}

		return {
			...record,
			balance_qty: balanceQty,
			balance_unit_cost: balanceUnitCost,
			running_balance: runningBalance
		}
	})
}

function getStockCardCostKey(value) {
	if (value === null || value === undefined || value === '') return ''
	const cost = Number(value)
	return Number.isFinite(cost) ? cost.toFixed(2) : String(value).trim()
}

function sumStockCardField(records, field) {
	const values = records
		.map((record) => record[field])
		.filter((value) => value !== null && value !== undefined && value !== '')
		.map(Number)
		.filter(Number.isFinite)

	return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function combineStockCardText(records, field) {
	const values = [...new Set(records
		.map((record) => String(record[field] ?? '').trim())
		.filter(Boolean))]

	return values.length ? values.join(' · ') : null
}

function groupStockCardRecords(records) {
	const groups = new Map()

	records.forEach((record) => {
		const inCost = getStockCardCostKey(record.in_unit_cost)
		const outCost = getStockCardCostKey(record.out_unit_cost)
		const costKey = inCost && outCost && inCost !== outCost
			? `in:${inCost}|out:${outCost}`
			: `unit:${inCost || outCost}`
		const groupKey = JSON.stringify([
			String(record.date ?? '').slice(0, 10),
			costKey,
			String(record.branch ?? '').trim()
		])
		if (!groups.has(groupKey)) groups.set(groupKey, [])
		groups.get(groupKey).push(record)
	})

	return [...groups.entries()].map(([groupKey, group]) => {
		const stockOutRecords = group.filter((record) => record.source === 'stock-out')
		const outRecords = stockOutRecords.length ? stockOutRecords : group

		return {
			...group[0],
			id: JSON.stringify([group[0].stock_no, groupKey]),
			reference: combineStockCardText(group, 'reference'),
			description: combineStockCardText(group, 'description'),
			stockCardRecordIds: [...new Set(group.flatMap((record) => record.stockCardRecordIds ?? []))],
			stockInRecordKeys: [...new Map(
				group
					.flatMap((record) => record.stockInRecordKeys ?? [])
					.map((record) => [`${record.barcode}|${record.date}`, record])
			).values()],
			stockOutRecordKeys: [...new Map(
				group
					.flatMap((record) => record.stockOutRecordKeys ?? [])
					.map((record) => [`${record.barcode}|${record.date}`, record])
			).values()],
			in_qty: sumStockCardField(group, 'in_qty'),
			in_unit_cost: group.find((record) => getStockCardCostKey(record.in_unit_cost))?.in_unit_cost ?? null,
			in_total: sumStockCardField(group, 'in_total'),
			out_qty: sumStockCardField(outRecords, 'out_qty'),
			out_unit_cost: outRecords.find((record) => getStockCardCostKey(record.out_unit_cost))?.out_unit_cost ?? null,
			out_total: sumStockCardField(outRecords, 'out_total')
		}
	})
}

export default function AccountantBarcode({ sessionToken }) {
	const [activeTab, setActiveTab] = useState('barcodes')
	const [activeRecordTab, setActiveRecordTab] = useState('stockIn')
	const [stockCardRecords, setStockCardRecords] = useState([])
	const [stockInStockCardRecords, setStockInStockCardRecords] = useState([])
	const [stockOutStockCardRecords, setStockOutStockCardRecords] = useState([])
	const [tritonInventoryItems, setTritonInventoryItems] = useState([])
	const [selectedStockNo, setSelectedStockNo] = useState('')
	const [stockCardMonth, setStockCardMonth] = useState(getLocalMonthInputValue)
	const [stockCardReloadVersion, setStockCardReloadVersion] = useState(0)
	const [isStockCardLoading, setIsStockCardLoading] = useState(false)
	const [stockCardError, setStockCardError] = useState('')
	const [stockInStockCardError, setStockInStockCardError] = useState('')
	const [stockOutStockCardError, setStockOutStockCardError] = useState('')
	const [tritonInventoryError, setTritonInventoryError] = useState('')
	const [editingStockCardRecordId, setEditingStockCardRecordId] = useState('')
	const [stockCardMetadataDraft, setStockCardMetadataDraft] = useState({ reference: '', description: '' })
	const [isSavingStockCardMetadata, setIsSavingStockCardMetadata] = useState(false)
	const [stockCardMetadataError, setStockCardMetadataError] = useState('')
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
	const [isStockOutLoading, setIsStockOutLoading] = useState(true)
	const [stockOutError, setStockOutError] = useState('')
	const [summaryStockRecords, setSummaryStockRecords] = useState([])
	const [summaryMonth, setSummaryMonth] = useState(getLocalMonthInputValue)
	const [selectedCogsStockNo, setSelectedCogsStockNo] = useState('')
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
	const stockOutRecordsByDate = useMemo(() => {
		const groups = new Map()
		stockOutRecords.forEach((record) => {
			const dateKey = String(record.date ?? '').slice(0, 10)
			if (!groups.has(dateKey)) groups.set(dateKey, [])
			groups.get(dateKey).push(record)
		})
		return [...groups.entries()]
			.sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
			.map(([dateKey, records]) => ({ dateKey, records }))
	}, [stockOutRecords])
	const stockCardGroups = useMemo(() => {
		const groups = new Map()

		tritonInventoryItems.forEach((item) => {
			if (!groups.has(item.stock_no)) {
				groups.set(item.stock_no, {
					stockNo: item.stock_no,
					itemDescription: item.item_description,
					category: item.category,
					unitOfMeasure: item.unit_of_measure,
					records: []
				})
			}
		})

		stockCardRecords.forEach((record) => {
			if (!groups.has(record.stock_no)) {
				groups.set(record.stock_no, {
					stockNo: record.stock_no,
					itemDescription: record.item_description,
					category: record.category,
					unitOfMeasure: record.unit_of_measure,
					records: []
				})
			}
			groups.get(record.stock_no).records.push({
				...record,
				stockCardRecordIds: [record.id],
				stockInRecordKeys: [],
				stockOutRecordKeys: []
			})
		})
		stockInStockCardRecords.forEach((record) => {
			if (!groups.has(record.stock_no)) {
				groups.set(record.stock_no, {
					stockNo: record.stock_no,
					itemDescription: record.item_description,
					category: '',
					unitOfMeasure: record.unit_of_measure,
					records: []
				})
			}
			groups.get(record.stock_no).records.push({
				id: `stock-in-${record.barcode}-${record.date}`,
				date: record.date,
				reference: record.reference,
				description: record.description,
				stockCardRecordIds: [],
				stockInRecordKeys: [{ barcode: record.barcode, date: record.date }],
				stockOutRecordKeys: [],
				in_qty: record.stock_in_count,
				in_unit_cost: record.price,
				in_total: record.total_price
			})
		})
		stockOutStockCardRecords.forEach((record) => {
			if (!groups.has(record.stock_no)) {
				groups.set(record.stock_no, {
					stockNo: record.stock_no,
					itemDescription: record.item_description,
					category: '',
					unitOfMeasure: record.unit_of_measure,
					records: []
				})
			}
			const quantity = Number(record.stock_out_count)
			const hasUnitCost = record.price !== null && record.price !== undefined && record.price !== ''
			const unitCost = Number(record.price)
			const branchName = String(record.branch ?? '').trim()
			groups.get(record.stock_no).records.push({
				id: `stock-out-${record.barcode}-${record.date}`,
				date: record.date,
				branch: branchName,
				reference: record.reference || (branchName ? `HO ITF - ${branchName}` : ''),
				description: record.description,
				source: 'stock-out',
				stockCardRecordIds: [],
				stockInRecordKeys: [],
				stockOutRecordKeys: [{ barcode: record.barcode, date: record.date }],
				out_qty: record.stock_out_count,
				out_unit_cost: record.price,
				out_total: hasUnitCost && Number.isFinite(quantity * unitCost)
					? quantity * unitCost
					: null
			})
		})
		groups.forEach((stockCard) => {
			stockCard.records = calculateStockCardBalances(groupStockCardRecords(stockCard.records)
				.sort((first, second) => (
				String(first.date ?? '').localeCompare(String(second.date ?? ''))
				)))
		})
		return [...groups.values()].sort((first, second) => first.stockNo.localeCompare(second.stockNo))
	}, [stockCardRecords, stockInStockCardRecords, stockOutStockCardRecords, tritonInventoryItems])
	const selectedStockCard = stockCardGroups.find((stockCard) => (
		stockCard.stockNo === selectedStockNo
	)) ?? stockCardGroups[0] ?? null
	const displayedStockCardRecords = selectedStockCard?.records.filter((record) => (
		String(record.date ?? '').slice(0, 7) === stockCardMonth
	)) ?? []
	const lastDisplayedStockCardRecord = displayedStockCardRecords[displayedStockCardRecords.length - 1]
	const stockCardTotals = {
		inQty: sumStockCardField(displayedStockCardRecords, 'in_qty') ?? 0,
		inTotal: sumStockCardField(displayedStockCardRecords, 'in_total') ?? 0,
		outQty: sumStockCardField(displayedStockCardRecords, 'out_qty') ?? 0,
		outTotal: sumStockCardField(displayedStockCardRecords, 'out_total') ?? 0,
		balanceQty: lastDisplayedStockCardRecord?.balance_qty ?? null,
		runningBalance: lastDisplayedStockCardRecord?.running_balance ?? null
	}
	const startStockCardMetadataEdit = (record) => {
		setEditingStockCardRecordId(record.id)
		setStockCardMetadataDraft({
			reference: record.reference ?? '',
			description: record.description ?? ''
		})
		setStockCardMetadataError('')
	}
	const saveStockCardMetadata = async (record) => {
		setIsSavingStockCardMetadata(true)
		setStockCardMetadataError('')
		const { error } = await updateAccountantInventoryStockCardMetadata(
			sessionToken,
			record.stockCardRecordIds,
			record.stockInRecordKeys,
			record.stockOutRecordKeys,
			stockCardMetadataDraft.reference,
			stockCardMetadataDraft.description
		)
		setIsSavingStockCardMetadata(false)
		if (error) {
			setStockCardMetadataError(error.message)
			return
		}

		setEditingStockCardRecordId('')
		setStockCardReloadVersion((version) => version + 1)
	}

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

	useEffect(() => {
		if (activeTab !== 'stock-card') return undefined

		let isCurrent = true
		const loadStockCardRecords = async () => {
			if (!sessionToken) {
				setIsStockCardLoading(false)
				setStockCardError('Accountant session is unavailable. Please sign in again.')
				setStockInStockCardError('Accountant session is unavailable. Please sign in again.')
				setStockOutStockCardError('Accountant session is unavailable. Please sign in again.')
				setTritonInventoryError('Accountant session is unavailable. Please sign in again.')
				return
			}

			setIsStockCardLoading(true)
			setStockCardError('')
			setStockInStockCardError('')
			setStockOutStockCardError('')
			setTritonInventoryError('')
			const [stockCardResult, inventoryResult, stockInResult, stockOutResult] = await Promise.all([
				listAccountantInventoryStockCardRecords(sessionToken),
				listAccountantInventoryInformation(sessionToken),
				listAccountantTafiStockInRecords(sessionToken, null, null),
				listAccountantTafiStockOutRecords(sessionToken, null, null)
			])
			if (!isCurrent) return
			setIsStockCardLoading(false)

			if (stockCardResult.error) {
				setStockCardError(stockCardResult.error.message)
				setStockCardRecords([])
			} else {
				setStockCardRecords(stockCardResult.data ?? [])
			}
			if (stockInResult.error) {
				setStockInStockCardError(stockInResult.error.message)
				setStockInStockCardRecords([])
			} else {
				setStockInStockCardRecords(stockInResult.data ?? [])
			}
			if (stockOutResult.error) {
				setStockOutStockCardError(stockOutResult.error.message)
				setStockOutStockCardRecords([])
			} else {
				setStockOutStockCardRecords(stockOutResult.data ?? [])
			}
			if (inventoryResult.error) {
				setTritonInventoryError(inventoryResult.error.message)
				setTritonInventoryItems([])
			} else {
				setTritonInventoryItems(inventoryResult.data ?? [])
			}
		}

		loadStockCardRecords()
		return () => {
			isCurrent = false
		}
	}, [activeTab, sessionToken, stockCardReloadVersion])

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
					Barcoded Stocks
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
				<button
					type="button"
					id="accountant-tafi-inventory-stock-card-tab"
					className={`accountant-inventory-tab${activeTab === 'stock-card' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'stock-card'}
					aria-controls="accountant-tafi-inventory-stock-card-panel"
					onClick={() => setActiveTab('stock-card')}
				>
					Inventory Stock Card
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
								{`${stockOutRecords.length} record${stockOutRecords.length === 1 ? '' : 's'} in ${formatRecordMonth(stockOutMonth)}`}
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
					</div>
					{stockOutError && <p className="accountant-inventory-error" role="alert">{stockOutError}</p>}
					{isStockOutLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading stock-out records...</p>
					) : stockOutError ? null : stockOutRecords.length ? (
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
									setSelectedCogsStockNo('')
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
										<th scope="colgroup" colSpan="2" className="tafi-summary-stock-beginning tafi-summary-stock-start tafi-summary-stock-end">Beginning Inventory</th>
										<th scope="colgroup" colSpan="2" className="tafi-summary-stock-in tafi-summary-stock-start tafi-summary-stock-end">Stock in</th>
										<th scope="colgroup" colSpan="2" className="tafi-summary-stock-out tafi-summary-stock-start tafi-summary-stock-end">Stock out</th>
										<th scope="colgroup" colSpan="2" className="tafi-summary-stock-ending tafi-summary-stock-start tafi-summary-stock-end">Ending Inventory</th>
									</tr>
									<tr>
										<th scope="col" className="tafi-summary-stock-beginning tafi-summary-stock-start">Quantity</th>
										<th scope="col" className="tafi-summary-stock-beginning tafi-summary-stock-end">Total</th>
										<th scope="col" className="tafi-summary-stock-in tafi-summary-stock-start">Quantity</th>
										<th scope="col" className="tafi-summary-stock-in tafi-summary-stock-end">Total</th>
										<th scope="col" className="tafi-summary-stock-out tafi-summary-stock-start">Quantity</th>
										<th scope="col" className="tafi-summary-stock-out tafi-summary-stock-end">Total</th>
										<th scope="col" className="tafi-summary-stock-ending tafi-summary-stock-start">Quantity</th>
										<th scope="col" className="tafi-summary-stock-ending tafi-summary-stock-end">Total</th>
									</tr>
								</thead>
								<tbody>
									{summaryStockRecords.map((record) => (
										<tr
											key={record.stock_no}
											className={`tafi-summary-stock-row${selectedCogsStockNo === record.stock_no ? ' selected' : ''}`}
											tabIndex={0}
											aria-selected={selectedCogsStockNo === record.stock_no}
											onClick={() => setSelectedCogsStockNo((current) => (
												current === record.stock_no ? '' : record.stock_no
											))}
											onKeyDown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
													event.preventDefault()
													setSelectedCogsStockNo((current) => (
														current === record.stock_no ? '' : record.stock_no
													))
												}
											}}
										>
											<td>{record.stock_no}</td>
											<td>{record.item_description}</td>
											<td>{record.unit_of_measure}</td>
											<td className="tafi-summary-stock-beginning tafi-summary-stock-start">{Number(record.beginning_inventory_quantity).toLocaleString()}</td>
											<td className="tafi-summary-stock-beginning tafi-summary-stock-end">{formatPrice(record.beginning_inventory_total)}</td>
											<td className="tafi-summary-stock-in tafi-summary-stock-start">{Number(record.stock_in_quantity).toLocaleString()}</td>
											<td className="tafi-summary-stock-in tafi-summary-stock-end">{formatPrice(record.stock_in_total)}</td>
											<td className="tafi-summary-stock-out tafi-summary-stock-start">{Number(record.stock_out_quantity).toLocaleString()}</td>
											<td className="tafi-summary-stock-out tafi-summary-stock-end">{formatPrice(record.stock_out_total)}</td>
											<td className="tafi-summary-stock-ending tafi-summary-stock-start">{Number(record.ending_inventory_quantity).toLocaleString()}</td>
											<td className="tafi-summary-stock-ending tafi-summary-stock-end">{formatPrice(record.ending_inventory_total)}</td>
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

			<div
				id="accountant-tafi-inventory-stock-card-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="accountant-tafi-inventory-stock-card-tab"
				hidden={activeTab !== 'stock-card'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Inventory Stock Card</h2>
						<p>
							{displayedStockCardRecords.length} record
							{displayedStockCardRecords.length === 1 ? '' : 's'}
							{' for '}{formatRecordMonth(stockCardMonth)}
							{' · '}{stockCardGroups.length} stock card{stockCardGroups.length === 1 ? '' : 's'}
						</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={() => setStockCardReloadVersion((version) => version + 1)}
						disabled={isStockCardLoading}
					>
						{isStockCardLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				{!isStockCardLoading && stockCardGroups.length > 0 && (
					<div className="tafi-stock-inventory-filters">
						<label>
							<span>Stock No.</span>
							<select
								value={selectedStockCard?.stockNo ?? ''}
								onChange={(event) => {
									setSelectedStockNo(event.target.value)
									setEditingStockCardRecordId('')
									setStockCardMetadataError('')
								}}
								aria-label="Select a stock card by stock number"
							>
								{stockCardGroups.map((stockCard) => (
									<option key={stockCard.stockNo} value={stockCard.stockNo}>
										{stockCard.stockNo}
									</option>
								))}
							</select>
						</label>
						<label htmlFor="accountant-tafi-stock-card-month">
							<span>Filter by month</span>
							<input
									id="accountant-tafi-stock-card-month"
									type="month"
									value={stockCardMonth}
									required
									onChange={(event) => {
										if (event.target.value) setStockCardMonth(event.target.value)
									}}
							/>
						</label>
					</div>
				)}
				{tritonInventoryError && (
					<p className="accountant-inventory-error" role="alert">
						TRITON Inventory Info could not be loaded: {tritonInventoryError}
					</p>
				)}
				{stockCardError && (
					<p className="accountant-inventory-error" role="alert">
						Stock card records could not be loaded: {stockCardError}
					</p>
				)}
				{stockInStockCardError && (
					<p className="accountant-inventory-error" role="alert">
						Stock In records could not be loaded: {stockInStockCardError}
					</p>
				)}
				{stockOutStockCardError && (
					<p className="accountant-inventory-error" role="alert">
						Stock Out records could not be loaded: {stockOutStockCardError}
					</p>
				)}
				{stockCardMetadataError && (
					<p className="accountant-inventory-error" role="alert">
						Stock card details could not be saved: {stockCardMetadataError}
					</p>
				)}
				{isStockCardLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading inventory stock cards...</p>
				) : (
					<div className="accountant-stock-card-list">
						{(selectedStockCard ? [selectedStockCard] : [{
							stockNo: '',
							itemDescription: '',
							category: '',
							unitOfMeasure: '',
							records: []
						}]).map((stockCard, index) => (
							<section
								className="accountant-stock-card"
								key={stockCard.stockNo || `empty-stock-card-${index}`}
							>
								<dl className="accountant-stock-card-details">
									<div>
										<dt>Stock No:</dt>
										<dd>{stockCard.stockNo || '—'}</dd>
									</div>
									<div>
										<dt>Item Description:</dt>
										<dd>{stockCard.itemDescription || '—'}</dd>
									</div>
									<div>
										<dt>Category:</dt>
										<dd>{stockCard.category || '—'}</dd>
									</div>
									<div>
										<dt>Unit of measure:</dt>
										<dd>{stockCard.unitOfMeasure || '—'}</dd>
									</div>
								</dl>
								<div
									className="accountant-inventory-table-wrap accountant-stock-card-table-wrap"
									role="region"
									aria-label={`Inventory stock card table for ${stockCard.stockNo || 'new record'}`}
									tabIndex={0}
								>
									<table className="accountant-inventory-table accountant-stock-card-table">
										<thead>
											<tr>
												<th scope="col" rowSpan="2">Date</th>
												<th scope="col" rowSpan="2">Reference</th>
												<th scope="col" rowSpan="2">Description</th>
												<th scope="colgroup" colSpan="3" className="accountant-stock-card-in accountant-stock-card-group-start accountant-stock-card-group-end">IN (Purchase)</th>
												<th scope="colgroup" colSpan="3" className="accountant-stock-card-out accountant-stock-card-group-start accountant-stock-card-group-end">OUT (Interbranch Transfer)</th>
												<th scope="col" rowSpan="2" className="accountant-stock-card-balance accountant-stock-card-group-start">Balance Qty</th>
												<th scope="col" rowSpan="2" className="accountant-stock-card-balance">Balance Unit Cost</th>
												<th scope="col" rowSpan="2" className="accountant-stock-card-balance accountant-stock-card-group-end">Running Balance</th>
												<th scope="col" rowSpan="2">Actions</th>
											</tr>
											<tr>
												<th scope="col" className="accountant-stock-card-in accountant-stock-card-group-start">QTY</th>
												<th scope="col" className="accountant-stock-card-in">Unit Cost</th>
												<th scope="col" className="accountant-stock-card-in accountant-stock-card-group-end">Total</th>
												<th scope="col" className="accountant-stock-card-out accountant-stock-card-group-start">QTY</th>
												<th scope="col" className="accountant-stock-card-out">Unit Cost</th>
												<th scope="col" className="accountant-stock-card-out accountant-stock-card-group-end">Total</th>
											</tr>
										</thead>
										<tbody>
											{displayedStockCardRecords.length ? displayedStockCardRecords.map((record) => (
												<tr key={record.id}>
													<td>{formatRecordDate(record.date)}</td>
													<td>
														{editingStockCardRecordId === record.id ? (
															<input
																className="accountant-stock-card-edit-field"
																value={stockCardMetadataDraft.reference}
																onChange={(event) => setStockCardMetadataDraft((draft) => ({
																	...draft,
																	reference: event.target.value
																}))}
																aria-label={`Reference for ${stockCard.stockNo} on ${formatRecordDate(record.date)}`}
															/>
														) : record.reference || ''}
													</td>
													<td>
														{editingStockCardRecordId === record.id ? (
															<textarea
																className="accountant-stock-card-edit-field"
																rows="2"
																value={stockCardMetadataDraft.description}
																onChange={(event) => setStockCardMetadataDraft((draft) => ({
																	...draft,
																	description: event.target.value
																}))}
																aria-label={`Description for ${stockCard.stockNo} on ${formatRecordDate(record.date)}`}
															/>
														) : record.description || ''}
													</td>
													<td className="accountant-stock-card-in accountant-stock-card-group-start">{formatStockCardQuantity(record.in_qty)}</td>
													<td className="accountant-stock-card-in">{formatStockCardPrice(record.in_unit_cost)}</td>
													<td className="accountant-stock-card-in accountant-stock-card-group-end">{formatStockCardPrice(record.in_total)}</td>
													<td className="accountant-stock-card-out accountant-stock-card-group-start">{hasStockCardOutQuantity(record) ? formatStockCardQuantity(record.out_qty) : ''}</td>
													<td className="accountant-stock-card-out">{hasStockCardOutQuantity(record) ? formatStockCardPrice(record.out_unit_cost) : ''}</td>
													<td className="accountant-stock-card-out accountant-stock-card-group-end">{hasStockCardOutQuantity(record) ? formatStockCardPrice(record.out_total) : ''}</td>
													<td className="accountant-stock-card-balance accountant-stock-card-group-start">{formatStockCardQuantity(record.balance_qty)}</td>
													<td className="accountant-stock-card-balance">{formatStockCardPrice(record.balance_unit_cost)}</td>
													<td className="accountant-stock-card-balance accountant-stock-card-group-end">{formatStockCardPrice(record.running_balance)}</td>
													<td className="accountant-stock-card-row-actions">
														{editingStockCardRecordId === record.id ? (
															<>
																<button
																	type="button"
																	className="accountant-stock-card-action accountant-stock-card-action-primary"
																	onClick={() => saveStockCardMetadata(record)}
																	disabled={isSavingStockCardMetadata}
																>
																	{isSavingStockCardMetadata ? 'Saving...' : 'Save'}
																</button>
																<button
																	type="button"
																	className="accountant-stock-card-action"
																	onClick={() => {
																		setEditingStockCardRecordId('')
																		setStockCardMetadataError('')
																	}}
																	disabled={isSavingStockCardMetadata}
																>
																	Cancel
																</button>
															</>
														) : (
															<button
																type="button"
																className="accountant-stock-card-action"
																onClick={() => startStockCardMetadataEdit(record)}
															>
																Edit
															</button>
														)}
													</td>
												</tr>
											)) : (
												<tr>
													<td colSpan="13" className="accountant-inventory-empty">
														{stockCardError || stockInStockCardError
															? 'Some stock card records are unavailable.'
															: `No stock records found for ${formatRecordMonth(stockCardMonth)}.`}
													</td>
												</tr>
											)}
										</tbody>
										{displayedStockCardRecords.length > 0 && (
											<tfoot>
												<tr>
													<th scope="row" colSpan="3">TOTAL</th>
													<td className="accountant-stock-card-in accountant-stock-card-group-start">{formatStockCardQuantity(stockCardTotals.inQty)}</td>
													<td className="accountant-stock-card-in"></td>
													<td className="accountant-stock-card-in accountant-stock-card-group-end">{formatStockCardPrice(stockCardTotals.inTotal)}</td>
													<td className="accountant-stock-card-out accountant-stock-card-group-start">{formatStockCardQuantity(stockCardTotals.outQty)}</td>
													<td className="accountant-stock-card-out"></td>
													<td className="accountant-stock-card-out accountant-stock-card-group-end">{formatStockCardPrice(stockCardTotals.outTotal)}</td>
													<td className="accountant-stock-card-balance accountant-stock-card-group-start">{formatStockCardQuantity(stockCardTotals.balanceQty)}</td>
													<td className="accountant-stock-card-balance"></td>
													<td className="accountant-stock-card-balance accountant-stock-card-group-end">{formatStockCardPrice(stockCardTotals.runningBalance)}</td>
													<td></td>
												</tr>
											</tfoot>
										)}
									</table>
								</div>
							</section>
						))}
					</div>
				)}
			</div>
		</div>
	)
}