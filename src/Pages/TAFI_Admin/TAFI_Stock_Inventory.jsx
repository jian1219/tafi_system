import { useEffect, useMemo, useState } from 'react'
import { Check, Download, History, Pencil, X } from 'lucide-react'
import {
	addTafiAdminManualStockInventory,
	listTafiAdminManualStockInventoryHistory,
	listTafiAdminStockInventory,
	listTafiAdminStockInScans,
	listTafiAdminStockInRecords,
	listTafiAdminStockOutRecords,
	listTafiAdminSummaryStockRecords,
	updateTafiAdminStockBarcodeTotalPrice,
	updateTafiAdminStockInScanCount,
	updateTafiAdminStockReorderLevel
} from '../../lib/supabase'
import TafiBarcodeGenerator from './TAFI_Barcode_Generator'

function getLocalMonthInputValue() {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	return `${year}-${month}`
}

function getLocalDateInputValue() {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
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

function formatBarcodePrice(value) {
	if (value === null || value === undefined || value === '') return 'Not set'

	return new Intl.NumberFormat('en-PH', {
		style: 'currency',
		currency: 'PHP'
	}).format(Number(value))
}

function parsePriceCents(value) {
	const [whole, fraction = ''] = value.split('.')
	return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

function formatPriceCents(value) {
	return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}

const maximumBarcodeTotalPriceCents = BigInt('9'.repeat(31))

export default function TafiStockInventory({ sessionToken }) {
	const [stockItems, setStockItems] = useState([])
	const [manualStockHistory, setManualStockHistory] = useState([])
	const [barcodeScans, setBarcodeScans] = useState([])
	const [stockInRecords, setStockInRecords] = useState([])
	const [stockOutRecords, setStockOutRecords] = useState([])
	const [summaryStockRecords, setSummaryStockRecords] = useState([])
	const [activeTab, setActiveTab] = useState('stock')
	const [activeRecordTab, setActiveRecordTab] = useState('stockIn')
	const [stockInMonth, setStockInMonth] = useState(getLocalMonthInputValue)
	const [stockInDay, setStockInDay] = useState('')
	const [stockOutMonth, setStockOutMonth] = useState(getLocalMonthInputValue)
	const [stockOutBranch, setStockOutBranch] = useState('')
	const [summaryMonth, setSummaryMonth] = useState(getLocalMonthInputValue)
	const [isManualStockFormOpen, setIsManualStockFormOpen] = useState(false)
	const [isManualStockHistoryOpen, setIsManualStockHistoryOpen] = useState(false)
	const [isExportingStock, setIsExportingStock] = useState(false)
	const [stockExportError, setStockExportError] = useState('')
	const [manualStockInventoryId, setManualStockInventoryId] = useState('')
	const [manualStockQuantity, setManualStockQuantity] = useState('')
	const [isSavingManualStock, setIsSavingManualStock] = useState(false)
	const [manualStockError, setManualStockError] = useState('')
	const [manualStockNotice, setManualStockNotice] = useState('')
	const [barcodeSearch, setBarcodeSearch] = useState('')
	const [editingBarcodePrice, setEditingBarcodePrice] = useState('')
	const [editingBarcodePriceMode, setEditingBarcodePriceMode] = useState('total')
	const [barcodePriceDraft, setBarcodePriceDraft] = useState('')
	const [isSavingBarcodePrice, setIsSavingBarcodePrice] = useState(false)
	const [barcodePriceError, setBarcodePriceError] = useState('')
	const [barcodePriceNotice, setBarcodePriceNotice] = useState('')
	const [editingBarcodeCount, setEditingBarcodeCount] = useState('')
	const [barcodeCountDraft, setBarcodeCountDraft] = useState('')
	const [isSavingBarcodeCount, setIsSavingBarcodeCount] = useState(false)
	const [barcodeCountError, setBarcodeCountError] = useState('')
	const [barcodeCountNotice, setBarcodeCountNotice] = useState('')
	const [stockSearch, setStockSearch] = useState('')
	const [stockCategory, setStockCategory] = useState('')
	const [editingReorderLevel, setEditingReorderLevel] = useState('')
	const [reorderLevelDraft, setReorderLevelDraft] = useState('')
	const [isSavingReorderLevel, setIsSavingReorderLevel] = useState(false)
	const [reorderLevelError, setReorderLevelError] = useState('')
	const [reorderLevelNotice, setReorderLevelNotice] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [isManualStockHistoryLoading, setIsManualStockHistoryLoading] = useState(true)
	const [isBarcodeLoading, setIsBarcodeLoading] = useState(true)
	const [isStockInLoading, setIsStockInLoading] = useState(true)
	const [isStockOutLoading, setIsStockOutLoading] = useState(true)
	const [isSummaryLoading, setIsSummaryLoading] = useState(true)
	const [loadError, setLoadError] = useState('')
	const [manualStockHistoryError, setManualStockHistoryError] = useState('')
	const [barcodeLoadError, setBarcodeLoadError] = useState('')
	const [stockInLoadError, setStockInLoadError] = useState('')
	const [stockOutLoadError, setStockOutLoadError] = useState('')
	const [summaryLoadError, setSummaryLoadError] = useState('')
	useEffect(() => {
		let isCurrent = true

		const load = async () => {
			const [stockResult, barcodeResult, manualHistoryResult] = await Promise.all([
				listTafiAdminStockInventory(sessionToken),
				listTafiAdminStockInScans(sessionToken),
				listTafiAdminManualStockInventoryHistory(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)
			setIsManualStockHistoryLoading(false)
			setIsBarcodeLoading(false)
			if (stockResult.error) {
				setLoadError(stockResult.error.message)
			} else {
				setLoadError('')
				setStockItems(stockResult.data ?? [])
			}
			if (barcodeResult.error) {
				setBarcodeLoadError(barcodeResult.error.message)
			} else {
				setBarcodeLoadError('')
				setBarcodeScans(barcodeResult.data ?? [])
			}
			if (manualHistoryResult.error) {
				setManualStockHistoryError(manualHistoryResult.error.message)
			} else {
				setManualStockHistoryError('')
				setManualStockHistory(manualHistoryResult.data ?? [])
			}
		}

		load()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		let isCurrent = true

		const loadStockInRecords = async () => {
			setIsStockInLoading(true)
			setStockInLoadError('')
			const { data, error } = await listTafiAdminStockInRecords(
				sessionToken,
				stockInMonth || null,
				stockInDay || null
			)
			if (!isCurrent) return
			setIsStockInLoading(false)
			if (error) {
				setStockInLoadError(error.message)
				return
			}
			setStockInRecords(data ?? [])
		}

		loadStockInRecords()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, stockInMonth, stockInDay])

	useEffect(() => {
		let isCurrent = true

		const loadStockOutRecords = async () => {
			setIsStockOutLoading(true)
			setStockOutLoadError('')
			const { data, error } = await listTafiAdminStockOutRecords(
				sessionToken,
				stockOutMonth || null
			)
			if (!isCurrent) return
			setIsStockOutLoading(false)
			if (error) {
				setStockOutLoadError(error.message)
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
			setIsSummaryLoading(true)
			setSummaryLoadError('')
			const { data, error } = await listTafiAdminSummaryStockRecords(
				sessionToken,
				summaryMonth || null
			)
			if (!isCurrent) return
			setIsSummaryLoading(false)
			if (error) {
				setSummaryLoadError(error.message)
				return
			}

			setSummaryStockRecords(data ?? [])
		}

		loadSummaryRecords()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, summaryMonth])

	const stockCategories = useMemo(
		() => [...new Set(stockItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
		[stockItems]
	)

	const filteredStockItems = useMemo(() => {
		const query = stockSearch.trim().toLocaleLowerCase()
		return stockItems.filter((item) => {
			if (stockCategory && item.category !== stockCategory) return false
			if (!query) return true
			return [item.stock_no, item.item_description, item.unit_of_measure, item.category]
				.some((value) => value?.toLocaleLowerCase().includes(query))
		})
	}, [stockCategory, stockItems, stockSearch])

	const filteredBarcodeScans = useMemo(() => {
		const query = barcodeSearch.trim().toLocaleLowerCase()
		const matchingItems = query
			? barcodeScans.filter((item) => [
				item.barcode,
				item.stock_no,
				item.item_description,
				item.unit_of_measure,
				item.scan_count,
				item.price,
				item.total_price
			].some((value) => String(value ?? '').toLocaleLowerCase().includes(query)))
			: barcodeScans

		return [...matchingItems].sort((left, right) => {
			const leftIsZero = Number(left.scan_count) === 0
			const rightIsZero = Number(right.scan_count) === 0
			return Number(leftIsZero) - Number(rightIsZero)
		})
	}, [barcodeScans, barcodeSearch])

	const stockOutBranches = useMemo(
		() => [...new Set(stockOutRecords.map((record) => record.branch).filter(Boolean))]
			.sort((left, right) => left.localeCompare(right)),
		[stockOutRecords]
	)

	const filteredStockOutRecords = useMemo(
		() => stockOutBranch
			? stockOutRecords.filter((record) => record.branch === stockOutBranch)
			: stockOutRecords,
		[stockOutBranch, stockOutRecords]
	)

	const selectedManualStockItem = stockItems.find(
		(item) => item.stock_inventory_id === manualStockInventoryId
	)

	const refreshBarcodeScans = async () => {
		setIsBarcodeLoading(true)
		setBarcodeLoadError('')
		const { data, error } = await listTafiAdminStockInScans(sessionToken)
		setIsBarcodeLoading(false)
		if (error) {
			setBarcodeLoadError(error.message)
			return
		}
		setBarcodeScans(data ?? [])
	}

	useEffect(() => {
		if (activeTab !== 'barcodes') return

		let isCurrent = true
		const refreshOnFocus = async () => {
			setIsBarcodeLoading(true)
			setBarcodeLoadError('')
			const { data, error } = await listTafiAdminStockInScans(sessionToken)
			if (!isCurrent) return
			setIsBarcodeLoading(false)
			if (error) {
				setBarcodeLoadError(error.message)
				return
			}
			setBarcodeScans(data ?? [])
		}

		void refreshOnFocus()
		window.addEventListener('focus', refreshOnFocus)
		return () => {
			isCurrent = false
			window.removeEventListener('focus', refreshOnFocus)
		}
	}, [activeTab, sessionToken])

	const editBarcodePrice = (item, mode) => {
		setEditingBarcodePrice(item.barcode)
		setEditingBarcodePriceMode(mode)
		const price = mode === 'per-item' ? item.price : item.total_price
		setBarcodePriceDraft(price === null || price === undefined ? '' : String(price))
		setBarcodePriceError('')
		setBarcodePriceNotice('')
	}

	const editBarcodeCount = (item) => {
		setEditingBarcodeCount(item.barcode)
		setBarcodeCountDraft(String(item.scan_count ?? 0))
		setBarcodeCountError('')
		setBarcodeCountNotice('')
	}

	const saveBarcodeCount = async (event, item) => {
		event.preventDefault()
		setBarcodeCountError('')
		setBarcodeCountNotice('')

		const countText = barcodeCountDraft.trim()
		const count = Number(countText)
		if (!/^\d+$/.test(countText) || !Number.isSafeInteger(count) || count > 99999999999) {
			setBarcodeCountError('Enter an item count from 0 to 99,999,999,999 as a whole number.')
			return
		}

		setIsSavingBarcodeCount(true)
		const { data, error } = await updateTafiAdminStockInScanCount(
			sessionToken,
			item.barcode,
			count
		)
		setIsSavingBarcodeCount(false)
		if (error) {
			setBarcodeCountError(error.message)
			return
		}

		const updatedCount = Number(data)
		if (data === null || data === undefined || !Number.isSafeInteger(updatedCount)
			|| updatedCount < 0 || updatedCount > 99999999999) {
			setBarcodeCountError('The item count was not returned after saving. Refresh Barcode Inventory to verify it.')
			return
		}

		const previousCount = Number(item.scan_count)
		const totalPrice = item.price === null || item.price === undefined
			? item.total_price
			: formatPriceCents(parsePriceCents(String(item.price)) * BigInt(updatedCount))
		setBarcodeScans((items) => items.map((scan) => (
			scan.barcode === item.barcode
				? { ...scan, scan_count: updatedCount, total_price: totalPrice }
				: scan
		)))
		setStockItems((items) => items.map((stockItem) => (
			stockItem.stock_no === item.stock_no
				? { ...stockItem, available: Number(stockItem.available ?? 0) + updatedCount - previousCount }
				: stockItem
		)))
		setEditingBarcodeCount('')
		setBarcodeCountNotice(`Item count updated for barcode ${item.barcode}.`)
	}

	const editReorderLevel = (item) => {
		setEditingReorderLevel(item.stock_inventory_id)
		setReorderLevelDraft(String(item.re_order_level ?? 0))
		setReorderLevelError('')
		setReorderLevelNotice('')
	}

	const saveReorderLevel = async (event, item) => {
		event.preventDefault()
		setReorderLevelError('')
		setReorderLevelNotice('')

		const valueText = reorderLevelDraft.trim()
		const value = Number(valueText)
		const decimalPart = valueText.split('.')[1]
		if (!valueText || !Number.isFinite(value) || value < 0 || value > 99999999999.999
			|| (decimalPart && decimalPart.length > 3)) {
			setReorderLevelError('Enter a re-order level from 0 to 99,999,999,999.999 with no more than three decimal places.')
			return
		}

		setIsSavingReorderLevel(true)
		const { data, error } = await updateTafiAdminStockReorderLevel(
			sessionToken,
			item.stock_inventory_id,
			value
		)
		setIsSavingReorderLevel(false)
		if (error) {
			setReorderLevelError(error.message)
			return
		}

		const updatedReorderLevel = Number(data)
		if (data === null || data === undefined || !Number.isFinite(updatedReorderLevel)) {
			setReorderLevelError('The re-order level was not returned after saving. Refresh the page to verify it.')
			return
		}

		setStockItems((items) => items.map((stockItem) => (
			stockItem.stock_inventory_id === item.stock_inventory_id
				? { ...stockItem, re_order_level: updatedReorderLevel }
				: stockItem
		)))
		setEditingReorderLevel('')
		setReorderLevelNotice(`Re-order level saved for ${item.stock_no}.`)
	}

	const saveBarcodePrice = async (event, item) => {
		event.preventDefault()
		setBarcodePriceError('')
		setBarcodePriceNotice('')

		const priceText = barcodePriceDraft.trim()
		const priceLabel = editingBarcodePriceMode === 'per-item' ? 'per item price' : 'total price'
		if (priceText && !/^\d{1,29}(?:\.\d{1,2})?$/.test(priceText)) {
			setBarcodePriceError(`Enter a ${priceLabel} with up to 29 digits before the decimal and two decimal places.`)
			return
		}

		let totalPrice = priceText || null
		if (priceText && editingBarcodePriceMode === 'per-item') {
			const itemCountText = String(item.scan_count)
			if (!/^\d+$/.test(itemCountText) || BigInt(itemCountText) <= 0n) {
				setBarcodePriceError('Stock in at least one item before setting its per item price.')
				return
			}

			const calculatedTotalPriceCents = parsePriceCents(priceText) * BigInt(itemCountText)
			if (calculatedTotalPriceCents > maximumBarcodeTotalPriceCents) {
				setBarcodePriceError('The calculated total price exceeds the supported limit.')
				return
			}
			totalPrice = formatPriceCents(calculatedTotalPriceCents)
		}

		setIsSavingBarcodePrice(true)
		const { data, error } = await updateTafiAdminStockBarcodeTotalPrice(
			sessionToken,
			item.barcode,
			totalPrice
		)
		setIsSavingBarcodePrice(false)
		if (error) {
			setBarcodePriceError(error.message)
			return
		}

		const updatedTotalPrice = Array.isArray(data) ? data[0] : null
		if (!updatedTotalPrice) {
			setBarcodePriceError('The updated price was not returned after saving. Refresh Barcode Inventory to verify it.')
			return
		}

		setBarcodeScans((items) => items.map((scan) => (
			scan.barcode === item.barcode
				? {
					...scan,
					price: updatedTotalPrice.price,
					total_price: updatedTotalPrice.total_price
				}
				: scan
		)))
		setEditingBarcodePrice('')
		setBarcodePriceNotice(`${editingBarcodePriceMode === 'per-item' ? 'Per item price' : 'Total price'} saved for barcode ${item.barcode}.`)
	}

	const refreshManualStockHistory = async () => {
		setIsManualStockHistoryLoading(true)
		setManualStockHistoryError('')
		const { data, error } = await listTafiAdminManualStockInventoryHistory(sessionToken)
		setIsManualStockHistoryLoading(false)
		if (error) {
			setManualStockHistoryError(error.message)
			return
		}
		setManualStockHistory(data ?? [])
	}

	const toggleManualStockForm = () => {
		setIsManualStockFormOpen((isOpen) => !isOpen)
		setManualStockInventoryId('')
		setManualStockQuantity('')
		setManualStockError('')
		setManualStockNotice('')
	}

	const handleManualStockSubmit = async (event) => {
		event.preventDefault()
		setManualStockError('')
		setManualStockNotice('')

		const quantity = Number(manualStockQuantity)
		if (!selectedManualStockItem || !Number.isSafeInteger(quantity) || quantity <= 0) {
			setManualStockError('Choose a stock number and enter a whole quantity greater than zero.')
			return
		}

		setIsSavingManualStock(true)
		const { data, error } = await addTafiAdminManualStockInventory(
			sessionToken,
			manualStockInventoryId,
			quantity,
			getLocalDateInputValue()
		)
		setIsSavingManualStock(false)
		if (error) {
			setManualStockError(error.message)
			return
		}

		const nextAvailable = Number(data)
		if (data === null || data === undefined || !Number.isFinite(nextAvailable)) {
			setManualStockError('Stock was added, but the updated balance was not returned. Refresh the page to reload it.')
			return
		}

		setStockItems((items) => items.map((item) => (
			item.stock_inventory_id === manualStockInventoryId
				? { ...item, available: nextAvailable }
				: item
		)))
		await refreshManualStockHistory()
		setManualStockNotice(
			`Added ${quantity} to ${selectedManualStockItem.stock_no}. Available is now ${nextAvailable}.`
		)
		setIsManualStockFormOpen(false)
		setManualStockInventoryId('')
		setManualStockQuantity('')
	}

	const refreshStockInRecords = async () => {
		setIsStockInLoading(true)
		setStockInLoadError('')
		const { data, error } = await listTafiAdminStockInRecords(
			sessionToken,
			stockInMonth || null,
			stockInDay || null
		)
		setIsStockInLoading(false)
		if (error) {
			setStockInLoadError(error.message)
			return
		}
		setStockInRecords(data ?? [])
	}

	const refreshStockOutRecords = async () => {
		setIsStockOutLoading(true)
		setStockOutLoadError('')
		const { data, error } = await listTafiAdminStockOutRecords(
			sessionToken,
			stockOutMonth || null
		)
		setIsStockOutLoading(false)
		if (error) {
			setStockOutLoadError(error.message)
			return
		}
		setStockOutRecords(data ?? [])
	}

	const exportStockOnHand = async () => {
		setIsExportingStock(true)
		setStockExportError('')
		try {
			const { default: ExcelJS } = await import('exceljs')
			const workbook = new ExcelJS.Workbook()
			const worksheet = workbook.addWorksheet('Stock on Hand')
			worksheet.columns = [
				{ header: 'Stock no.', key: 'stockNo', width: 18 },
				{ header: 'Item description', key: 'description', width: 48 },
				{ header: 'Unit of measure', key: 'unit', width: 22 },
				{ header: 'Available', key: 'available', width: 16 },
				{ header: 'Re-order level', key: 'reorderLevel', width: 18 }
			]
			worksheet.addRows(stockItems.map((item) => ({
				stockNo: item.stock_no ?? '',
				description: item.item_description ?? '',
				unit: item.unit_of_measure ?? '',
				available: item.available ?? null,
				reorderLevel: item.re_order_level ?? 0
			})))
			worksheet.getRow(1).font = { bold: true }
			worksheet.autoFilter = 'A1:E1'
			worksheet.views = [{ state: 'frozen', ySplit: 1 }]

			const workbookBuffer = await workbook.xlsx.writeBuffer()
			const fileDate = new Date().toISOString().slice(0, 10)
			const fileName = `tafi-stock-on-hand-${fileDate}.xlsx`
			const downloadUrl = URL.createObjectURL(new Blob([workbookBuffer], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}))
			const link = document.createElement('a')
			link.href = downloadUrl
			link.download = fileName
			document.body.appendChild(link)
			link.click()
			link.remove()
			URL.revokeObjectURL(downloadUrl)
		} catch (error) {
			setStockExportError(
				error instanceof Error ? `Could not export stock on hand: ${error.message}` : 'Could not export stock on hand.'
			)
		} finally {
			setIsExportingStock(false)
		}
	}

	const renderBarcodePriceCell = (item, mode) => {
		const isPerItemPrice = mode === 'per-item'
		const priceLabel = isPerItemPrice ? 'Per item price' : 'Total price'
		const price = isPerItemPrice ? item.price : item.total_price

		return (
			<td className="tafi-barcode-price-cell">
				{editingBarcodePrice === item.barcode && editingBarcodePriceMode === mode ? (
					<form
						className="tafi-barcode-price-editor"
						onSubmit={(event) => saveBarcodePrice(event, item)}
					>
						<input
							type="text"
							inputMode="decimal"
							maxLength={32}
							value={barcodePriceDraft}
							onChange={(event) => setBarcodePriceDraft(event.target.value)}
							aria-label={`${priceLabel} for barcode ${item.barcode}`}
							placeholder="Not set"
							disabled={isSavingBarcodePrice}
							autoFocus
						/>
						<button
							type="submit"
							className="tafi-barcode-price-action"
							aria-label={`Save ${priceLabel.toLocaleLowerCase()} for barcode ${item.barcode}`}
							title={`Save ${priceLabel.toLocaleLowerCase()}`}
							disabled={isSavingBarcodePrice}
						>
							<Check size={16} aria-hidden="true" />
						</button>
						<button
							type="button"
							className="tafi-barcode-price-action"
							aria-label={`Cancel ${priceLabel.toLocaleLowerCase()} edit for barcode ${item.barcode}`}
							title="Cancel"
							onClick={() => setEditingBarcodePrice('')}
							disabled={isSavingBarcodePrice}
						>
							<X size={16} aria-hidden="true" />
						</button>
					</form>
				) : (
					<div className="tafi-barcode-price-display">
						<span>{formatBarcodePrice(price)}</span>
						<button
							type="button"
							className="tafi-barcode-price-action"
							aria-label={`Edit ${priceLabel.toLocaleLowerCase()} for barcode ${item.barcode}`}
							title={`Edit ${priceLabel.toLocaleLowerCase()}`}
							onClick={() => editBarcodePrice(item, mode)}
						>
							<Pencil size={15} aria-hidden="true" />
						</button>
					</div>
				)}
			</td>
		)
	}

	const renderBarcodeCountCell = (item) => (
		<td className="tafi-barcode-price-cell">
			{editingBarcodeCount === item.barcode ? (
				<form
					className="tafi-barcode-price-editor"
					onSubmit={(event) => saveBarcodeCount(event, item)}
				>
					<input
						type="number"
						min="0"
						max="99999999999"
						step="1"
						value={barcodeCountDraft}
						onChange={(event) => setBarcodeCountDraft(event.target.value)}
						aria-label={`Item count for barcode ${item.barcode}`}
						disabled={isSavingBarcodeCount}
						autoFocus
					/>
					<button
						type="submit"
						className="tafi-barcode-price-action"
						aria-label={`Save item count for barcode ${item.barcode}`}
						title="Save item count"
						disabled={isSavingBarcodeCount}
					>
						<Check size={16} aria-hidden="true" />
					</button>
					<button
						type="button"
						className="tafi-barcode-price-action"
						aria-label={`Cancel item count edit for barcode ${item.barcode}`}
						title="Cancel"
						onClick={() => setEditingBarcodeCount('')}
						disabled={isSavingBarcodeCount}
					>
						<X size={16} aria-hidden="true" />
					</button>
				</form>
			) : (
				<div className="tafi-barcode-price-display">
					<span>{item.scan_count}</span>
					<button
						type="button"
						className="tafi-barcode-price-action"
						aria-label={`Edit item count for barcode ${item.barcode}`}
						title="Edit item count"
						onClick={() => editBarcodeCount(item)}
						disabled={isSavingBarcodeCount}
					>
						<Pencil size={15} aria-hidden="true" />
					</button>
				</div>
			)}
		</td>
	)

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
					id="tafi-barcode-inventory-tab"
					className={`accountant-inventory-tab${activeTab === 'barcodes' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'barcodes'}
					aria-controls="tafi-barcode-inventory-panel"
					onClick={() => setActiveTab('barcodes')}
				>
					Barcode Inventory
				</button>
				<button
					type="button"
					id="tafi-stock-records-tab"
					className={`accountant-inventory-tab${activeTab === 'records' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'records'}
					aria-controls="tafi-stock-records-panel"
					onClick={() => setActiveTab('records')}
				>
					Stock Records
				</button>
				<button
					type="button"
					id="tafi-barcode-generator-tab"
					className={`accountant-inventory-tab${activeTab === 'barcodeGenerator' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'barcodeGenerator'}
					aria-controls="tafi-barcode-generator-panel"
					onClick={() => setActiveTab('barcodeGenerator')}
				>
					Barcode Generator
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
					<div className="tafi-stock-inventory-actions">
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={exportStockOnHand}
						disabled={isExportingStock || isLoading || Boolean(loadError) || !stockItems.length}
					>
						<Download size={16} aria-hidden="true" />
						{isExportingStock ? 'Preparing Excel...' : 'Download Excel (.xlsx)'}
					</button>
					<button
						type="button"
						className={`accountant-inventory-add-toggle${isManualStockFormOpen ? ' open' : ''}`}
						aria-expanded={isManualStockFormOpen}
						onClick={toggleManualStockForm}
						disabled={isSavingManualStock || isLoading || Boolean(loadError) || !stockItems.length}
					>
						{isManualStockFormOpen ? 'Cancel' : 'Add manually'}
					</button>
					<button
						type="button"
						className={`accountant-inventory-add-toggle tafi-manual-stock-history-toggle${isManualStockHistoryOpen ? ' open' : ''}`}
						onClick={() => setIsManualStockHistoryOpen((isOpen) => !isOpen)}
						aria-label={isManualStockHistoryOpen ? 'Hide manual stock addition history' : 'Show manual stock addition history'}
						aria-expanded={isManualStockHistoryOpen}
						aria-controls="tafi-manual-stock-history"
						title={isManualStockHistoryOpen ? 'Hide manual stock addition history' : 'Show manual stock addition history'}
						disabled={isManualStockHistoryLoading}
					>
						<History size={18} aria-hidden="true" />
					</button>
					</div>
				</div>
				{stockExportError && <p className="accountant-inventory-error" role="alert">{stockExportError}</p>}

				{isManualStockFormOpen && (
					<>
						<div className="accountant-inventory-heading">
							<div>
								<h2>Add stock manually</h2>
								<p>Choose a stock item and enter the quantity to add. Barcode inventory is not required.</p>
							</div>
						</div>
						<form className="accountant-inventory-form" onSubmit={handleManualStockSubmit}>
							<label>
								<span>Stock no.</span>
								<select
									value={manualStockInventoryId}
									onChange={(event) => setManualStockInventoryId(event.target.value)}
									required
								>
									<option value="">Select a stock number</option>
									{stockItems.map((item) => (
										<option key={item.stock_inventory_id} value={item.stock_inventory_id}>
											{item.stock_no}
										</option>
									))}
								</select>
							</label>
							<label className="accountant-inventory-description">
								<span>Item description</span>
								<input
									value={selectedManualStockItem?.item_description ?? ''}
									placeholder="Select a stock number first"
									readOnly
								/>
							</label>
							<label>
								<span>Unit of measure</span>
								<input
									value={selectedManualStockItem?.unit_of_measure ?? ''}
									placeholder="Select a stock number first"
									readOnly
								/>
							</label>
							<label>
								<span>Quantity to add</span>
								<input
									type="number"
									min="1"
									max="99999999999"
									step="1"
									value={manualStockQuantity}
									onChange={(event) => setManualStockQuantity(event.target.value)}
									required
								/>
							</label>
							<button
								type="submit"
								className="accountant-inventory-submit"
								disabled={isSavingManualStock || !selectedManualStockItem}
							>
								{isSavingManualStock ? 'Saving...' : 'Add stock'}
							</button>
						</form>
					</>
				)}
				{manualStockError && <p className="accountant-inventory-error" role="alert">{manualStockError}</p>}
				{manualStockNotice && <p className="accountant-inventory-notice" role="status">{manualStockNotice}</p>}

				{loadError && <p className="accountant-inventory-error" role="alert">{loadError}</p>}
				{reorderLevelError && <p className="accountant-inventory-error" role="alert">{reorderLevelError}</p>}
				{reorderLevelNotice && <p className="accountant-inventory-notice" role="status">{reorderLevelNotice}</p>}

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
											<th scope="col">Available</th>
											<th scope="col">Re-order level</th>
										</tr>
									</thead>
									<tbody>
										{filteredStockItems.map((item) => (
											<tr
												key={item.stock_inventory_id}
												className={Number(item.available) === 0 ? 'accountant-inventory-row-zero-stock' : undefined}
											>
												<td>{item.stock_no}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{item.available}</td>
												<td className="tafi-stock-reorder-level-cell">
													{editingReorderLevel === item.stock_inventory_id ? (
														<form
															className="tafi-stock-reorder-level-editor"
															onSubmit={(event) => saveReorderLevel(event, item)}
														>
															<input
																type="number"
																min="0"
																max="99999999999.999"
																step="0.001"
																value={reorderLevelDraft}
																onChange={(event) => setReorderLevelDraft(event.target.value)}
																aria-label={`Re-order level for ${item.stock_no}`}
																disabled={isSavingReorderLevel}
																autoFocus
															/>
															<button
																type="submit"
																className="tafi-barcode-price-action"
																aria-label={`Save re-order level for ${item.stock_no}`}
																title="Save re-order level"
																disabled={isSavingReorderLevel}
															>
																<Check size={16} aria-hidden="true" />
															</button>
															<button
																type="button"
																className="tafi-barcode-price-action"
																aria-label={`Cancel re-order level edit for ${item.stock_no}`}
																title="Cancel"
																onClick={() => setEditingReorderLevel('')}
																disabled={isSavingReorderLevel}
															>
																<X size={16} aria-hidden="true" />
															</button>
														</form>
													) : (
														<div className="tafi-stock-reorder-level-display">
															<span>{item.re_order_level ?? 0}</span>
															<button
																type="button"
																className="tafi-barcode-price-action"
																aria-label={`Edit re-order level for ${item.stock_no}`}
																title="Edit re-order level"
																onClick={() => editReorderLevel(item)}
																disabled={isSavingReorderLevel}
															>
																<Pencil size={15} aria-hidden="true" />
															</button>
														</div>
													)}
												</td>
												<td>{formatBarcodePrice(item.total_price)}</td>
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

				{isManualStockHistoryOpen && (
					<div
						className="tafi-manual-history-backdrop"
						role="presentation"
						onMouseDown={(event) => {
							if (event.target === event.currentTarget) setIsManualStockHistoryOpen(false)
						}}
					>
						<section
							id="tafi-manual-stock-history"
							className="tafi-manual-history-dialog"
							role="dialog"
							aria-modal="true"
							aria-labelledby="tafi-manual-stock-history-title"
							onKeyDown={(event) => {
								if (event.key === 'Escape') setIsManualStockHistoryOpen(false)
							}}
						>
							<div className="tafi-manual-history-heading">
								<div>
									<h2 id="tafi-manual-stock-history-title">Manual stock addition history</h2>
									<p>
										{manualStockHistory.length} addition{manualStockHistory.length === 1 ? '' : 's'}
									</p>
								</div>
								<div className="tafi-manual-history-actions">
									<button
										type="button"
										className="accountant-inventory-add-toggle"
										onClick={refreshManualStockHistory}
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
													<td>{formatRecordDate(record.date)}</td>
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
			<div
				id="tafi-barcode-inventory-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-barcode-inventory-tab"
				hidden={activeTab !== 'barcodes'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Barcode inventory</h2>
						<p>
							{filteredBarcodeScans.length === barcodeScans.length
								? `${barcodeScans.length} barcode item${barcodeScans.length === 1 ? '' : 's'}`
								: `${filteredBarcodeScans.length} of ${barcodeScans.length} barcode items`}
						</p>
					</div>
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={refreshBarcodeScans}
						disabled={isBarcodeLoading}
					>
						{isBarcodeLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				{barcodeLoadError && (
					<p className="accountant-inventory-error" role="alert">{barcodeLoadError}</p>
				)}
				{isBarcodeLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading barcode inventory...</p>
				) : barcodeLoadError ? null : barcodeScans.length ? (
					<>
						<div className="tafi-stock-inventory-filters" role="search" aria-label="Filter barcode inventory">
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
						{barcodePriceError && (
							<p className="accountant-inventory-error" role="alert">{barcodePriceError}</p>
						)}
						{barcodePriceNotice && (
							<p className="accountant-inventory-notice" role="status">{barcodePriceNotice}</p>
						)}
						{barcodeCountError && (
							<p className="accountant-inventory-error" role="alert">{barcodeCountError}</p>
						)}
						{barcodeCountNotice && (
							<p className="accountant-inventory-notice" role="status">{barcodeCountNotice}</p>
						)}
						{filteredBarcodeScans.length ? (
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
										{filteredBarcodeScans.map((item) => (
											<tr
												key={item.barcode}
												className={Number(item.scan_count) === 0 ? 'accountant-inventory-row-zero-stock' : undefined}
											>
												<td>{item.barcode}</td>
												<td>{item.stock_no}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												{renderBarcodeCountCell(item)}
												{renderBarcodePriceCell(item, 'per-item')}
												{renderBarcodePriceCell(item, 'total')}
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
				id="tafi-stock-records-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-stock-records-tab"
				hidden={activeTab !== 'records'}
			>
				<div className="accountant-inventory-tabs tafi-stock-record-tabs" role="tablist" aria-label="Stock records">
					<button
						type="button"
						id="tafi-stock-in-records-tab"
						className={`accountant-inventory-tab${activeRecordTab === 'stockIn' ? ' active' : ''}`}
						role="tab"
						aria-selected={activeRecordTab === 'stockIn'}
						aria-controls="tafi-stock-in-records-panel"
						onClick={() => setActiveRecordTab('stockIn')}
					>
						Stock In Records
					</button>
					<button
						type="button"
						id="tafi-stock-out-records-tab"
						className={`accountant-inventory-tab${activeRecordTab === 'stockOut' ? ' active' : ''}`}
						role="tab"
						aria-selected={activeRecordTab === 'stockOut'}
						aria-controls="tafi-stock-out-records-panel"
						onClick={() => setActiveRecordTab('stockOut')}
					>
						Stock Out Records
					</button>
					<button
						type="button"
						id="tafi-stock-summary-records-tab"
						className={`accountant-inventory-tab${activeRecordTab === 'summary' ? ' active' : ''}`}
						role="tab"
						aria-selected={activeRecordTab === 'summary'}
						aria-controls="tafi-stock-summary-records-panel"
						onClick={() => setActiveRecordTab('summary')}
					>
						COGS
					</button>
				</div>
				<div
				id="tafi-stock-in-records-panel"
				className="tafi-stock-records-subpanel"
				role="tabpanel"
				aria-labelledby="tafi-stock-in-records-tab"
				hidden={activeRecordTab !== 'stockIn'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Stock in records</h2>
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
					<label htmlFor="tafi-stock-in-record-month">
						<span>Filter by month</span>
						<input
							id="tafi-stock-in-record-month"
							type="month"
							value={stockInMonth}
							required
							onChange={(event) => {
								if (event.target.value) setStockInMonth(event.target.value)
								setStockInDay('')
							}}
						/>
					</label>
					<label htmlFor="tafi-stock-in-record-day">
						<span>Filter by day (optional)</span>
						<input
							id="tafi-stock-in-record-day"
							type="date"
							value={stockInDay}
							onChange={(event) => {
								const selectedDay = event.target.value
								setStockInDay(selectedDay)
								if (selectedDay) setStockInMonth(selectedDay.slice(0, 7))
							}}
						/>
					</label>
				</div>
				{stockInLoadError && (
					<p className="accountant-inventory-error" role="alert">{stockInLoadError}</p>
				)}
				{isStockInLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading stock-in records...</p>
				) : stockInLoadError ? null : stockInRecords.length ? (
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
										<td>{formatBarcodePrice(record.price)}</td>
										<td>{formatBarcodePrice(record.total_price)}</td>
										<td>{formatRecordDate(record.date)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">
						No stock-in records found{stockInDay ? ' for this day.' : ' for this month.'}
					</p>
				)}
			</div>
			<div
				id="tafi-stock-out-records-panel"
				className="tafi-stock-records-subpanel"
				role="tabpanel"
				aria-labelledby="tafi-stock-out-records-tab"
				hidden={activeRecordTab !== 'stockOut'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Stock out records</h2>
						<p>
							{filteredStockOutRecords.length} record{filteredStockOutRecords.length === 1 ? '' : 's'}
							{stockOutBranch ? ` for ${stockOutBranch}` : ''}
							{` for ${formatRecordMonth(stockOutMonth)}`}
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
					<label htmlFor="tafi-stock-out-record-month">
						<span>Filter by month</span>
						<input
							id="tafi-stock-out-record-month"
							type="month"
							value={stockOutMonth}
							required
							onChange={(event) => {
								if (event.target.value) setStockOutMonth(event.target.value)
							}}
						/>
					</label>
					<label htmlFor="tafi-stock-out-record-branch">
						<span>Filter by branch</span>
						<select
							id="tafi-stock-out-record-branch"
							value={stockOutBranch}
							onChange={(event) => setStockOutBranch(event.target.value)}
						>
							<option value="">All branches</option>
							{stockOutBranches.map((branch) => (
								<option key={branch} value={branch}>{branch}</option>
							))}
						</select>
					</label>
				</div>
				{stockOutLoadError && (
					<p className="accountant-inventory-error" role="alert">{stockOutLoadError}</p>
				)}
				{isStockOutLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading stock-out records...</p>
				) : stockOutLoadError ? null : filteredStockOutRecords.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Branch</th>
									<th scope="col">Barcode</th>
									<th scope="col">Stock no.</th>
									<th scope="col">Item description</th>
									<th scope="col">Unit of measure</th>
									<th scope="col">Stock out count</th>
									<th scope="col">Per Item Price</th>
									<th scope="col">Total Price</th>
									<th scope="col">Date</th>
								</tr>
							</thead>
							<tbody>
								{filteredStockOutRecords.map((record) => (
									<tr key={`${record.barcode}-${record.date}-${record.branch ?? ''}`}>
										<td>{record.branch || '—'}</td>
										<td>{record.barcode}</td>
										<td>{record.stock_no}</td>
										<td>{record.item_description}</td>
										<td>{record.unit_of_measure}</td>
										<td>{record.stock_out_count}</td>
										<td>{formatBarcodePrice(record.price)}</td>
										<td>{formatBarcodePrice(record.total_price)}</td>
										<td>{formatRecordDate(record.date)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">
						No stock-out records found{stockOutBranch ? ` for ${stockOutBranch}` : ''} for this month.
					</p>
				)}
			</div>
			<div
				id="tafi-stock-summary-records-panel"
				className="tafi-stock-records-subpanel"
				role="tabpanel"
				aria-labelledby="tafi-stock-summary-records-tab"
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
				</div>
				<div className="tafi-stock-record-filters">
					<label htmlFor="tafi-stock-summary-record-month">
						<span>Filter by month</span>
						<input
							id="tafi-stock-summary-record-month"
							type="month"
							value={summaryMonth}
							required
							onChange={(event) => {
								if (event.target.value) setSummaryMonth(event.target.value)
							}}
						/>
					</label>
				</div>
				{summaryLoadError && (
					<p className="accountant-inventory-error" role="alert">{summaryLoadError}</p>
				)}
				{isSummaryLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading stock record summary...</p>
				) : summaryLoadError ? null : summaryStockRecords.length ? (
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
										<td>{formatBarcodePrice(record.beginning_inventory_total)}</td>
										<td>{Number(record.stock_in_quantity).toLocaleString()}</td>
										<td>{formatBarcodePrice(record.stock_in_total)}</td>
										<td>{Number(record.stock_out_quantity).toLocaleString()}</td>
										<td>{formatBarcodePrice(record.stock_out_total)}</td>
										<td>{Number(record.ending_inventory_quantity).toLocaleString()}</td>
										<td>{formatBarcodePrice(record.ending_inventory_total)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="accountant-inventory-empty">
						No stock records found for this month.
					</p>
				)}
			</div>
			</div>
			<div
				id="tafi-barcode-generator-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="tafi-barcode-generator-tab"
				hidden={activeTab !== 'barcodeGenerator'}
			>
				<TafiBarcodeGenerator stockItems={stockItems} barcodeScans={barcodeScans} />
			</div>
		</div>
	)
}