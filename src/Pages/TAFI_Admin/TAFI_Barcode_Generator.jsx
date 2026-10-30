import { useEffect, useRef, useState } from 'react'
import { Printer, Trash2 } from 'lucide-react'
import JsBarcode from 'jsbarcode'

const MAX_AUTOMATIC_LABELS = 50

function BarcodeGraphic({ value }) {
	const svgRef = useRef(null)

	useEffect(() => {
		if (!svgRef.current) return
		JsBarcode(svgRef.current, value, {
			format: 'CODE128',
			displayValue: true,
			height: 52,
			width: 2,
			fontSize: 13,
			margin: 8,
			textMargin: 4
		})
	}, [value])

	return <svg ref={svgRef} className="barcode-generator-svg" role="img" aria-label={`Barcode ${value}`} />
}

export default function TafiBarcodeGenerator({ stockItems, barcodeScans }) {
	const [barcodeMode, setBarcodeMode] = useState('manual')
	const [manualBarcodeValue, setManualBarcodeValue] = useState('')
	const [automaticQuantity, setAutomaticQuantity] = useState('1')
	const [stockInventoryId, setStockInventoryId] = useState('')
	const [generatedLabels, setGeneratedLabels] = useState([])
	const [errorMessage, setErrorMessage] = useState('')

	const selectedStockItem = stockItems.find(
		(item) => item.stock_inventory_id === stockInventoryId
	)

	const handleGenerate = (event) => {
		event.preventDefault()
		setErrorMessage('')

		let values
		if (barcodeMode === 'manual') {
			const value = manualBarcodeValue.trim()
			if (!value) {
				setErrorMessage('Enter a barcode value to generate a label.')
				return
			}
			try {
				const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
				JsBarcode(svg, value, { format: 'CODE128', displayValue: false })
			} catch (error) {
				setErrorMessage(
					error instanceof Error ? `This value cannot be encoded as Code 128: ${error.message}` : 'This value cannot be encoded as Code 128.'
				)
				return
			}
			values = [value]
		} else {
			const quantity = Number(automaticQuantity)
			if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_AUTOMATIC_LABELS) {
				setErrorMessage(`Enter a quantity from 1 to ${MAX_AUTOMATIC_LABELS}.`)
				return
			}
			const existingValues = new Set([
				...barcodeScans.map((item) => item.barcode),
				...generatedLabels.map((label) => label.value)
			])
			values = []
			while (values.length < quantity) {
				const value = `TAFI-${crypto.randomUUID().toUpperCase()}`
				if (existingValues.has(value)) continue
				existingValues.add(value)
				values.push(value)
			}
		}

		const itemDetails = selectedStockItem
			? {
				stockNo: selectedStockItem.stock_no,
				description: selectedStockItem.item_description,
				unit: selectedStockItem.unit_of_measure
			}
			: {}
		setGeneratedLabels((labels) => [
			...labels,
			...values.map((value) => ({
				id: crypto.randomUUID(),
				value,
				...itemDetails
			}))
		])
		if (barcodeMode === 'manual') setManualBarcodeValue('')
	}

	return (
		<div className="barcode-generator">
			<div className="accountant-inventory-heading">
				<div>
					<h2>Barcode Generator</h2>
					<p>Generate Code 128 barcode labels to print. This does not register barcodes or change stock.</p>
				</div>
			</div>

			<form className="accountant-inventory-form barcode-generator-form" onSubmit={handleGenerate}>
				<label>
					<span>Barcode value source</span>
					<select value={barcodeMode} onChange={(event) => setBarcodeMode(event.target.value)}>
						<option value="manual">Enter barcode value</option>
						<option value="automatic">Generate values automatically</option>
					</select>
				</label>
				{barcodeMode === 'manual' ? (
					<label>
						<span>Barcode value</span>
						<input
							value={manualBarcodeValue}
							onChange={(event) => setManualBarcodeValue(event.target.value)}
							placeholder="Enter letters or numbers"
							required
						/>
					</label>
				) : (
					<label>
						<span>Number of labels (maximum {MAX_AUTOMATIC_LABELS})</span>
						<input
							type="number"
							min="1"
							max={MAX_AUTOMATIC_LABELS}
							step="1"
							value={automaticQuantity}
							onChange={(event) => setAutomaticQuantity(event.target.value)}
							required
						/>
					</label>
				)}
				<label className="barcode-generator-stock-select">
					<span>Inventory item (optional)</span>
					<select value={stockInventoryId} onChange={(event) => setStockInventoryId(event.target.value)}>
						<option value="">No item details on label</option>
						{stockItems.map((item) => (
							<option key={item.stock_inventory_id} value={item.stock_inventory_id}>
								{item.stock_no} — {item.item_description}
							</option>
						))}
					</select>
				</label>
				<button type="submit" className="accountant-inventory-submit">
					Generate {barcodeMode === 'automatic' ? 'barcodes' : 'barcode'}
				</button>
			</form>

			{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}

			<div className="barcode-generator-results-heading">
				<div>
					<h3>Generated labels</h3>
					<p>{generatedLabels.length} label{generatedLabels.length === 1 ? '' : 's'} ready to print</p>
				</div>
				<div className="tafi-stock-inventory-actions barcode-generator-controls">
					<button
						type="button"
						className="accountant-inventory-add-toggle"
						onClick={() => window.print()}
						disabled={!generatedLabels.length}
					>
						<Printer size={16} aria-hidden="true" />
						Print labels
					</button>
					<button
						type="button"
						className="accountant-inventory-add-toggle open"
						onClick={() => setGeneratedLabels([])}
						disabled={!generatedLabels.length}
					>
						<Trash2 size={16} aria-hidden="true" />
						Clear labels
					</button>
				</div>
			</div>

			{generatedLabels.length ? (
				<div className="barcode-generator-print-area">
					{generatedLabels.map((label) => (
						<article className="barcode-generator-label" key={label.id}>
							{label.stockNo && <p className="barcode-generator-stock-no">Stock no. {label.stockNo}</p>}
							{label.description && <p className="barcode-generator-description">{label.description}</p>}
							<BarcodeGraphic value={label.value} />
						</article>
					))}
				</div>
			) : (
				<p className="accountant-inventory-empty">Enter a barcode or generate values automatically to create printable labels.</p>
			)}
		</div>
	)
}
