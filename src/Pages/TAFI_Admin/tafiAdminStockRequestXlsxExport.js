import bancasiTemplateUrl from './xlsl_format/Branch_Inventory_Requisition-Bancasi.xlsx?url'
import gingoogTemplateUrl from './xlsl_format/Branch_Inventory_Requisition-Gingoog.xlsx?url'

const firstDataRow = 6
const templateDataRowCount = 35
const footerStartRow = firstDataRow + templateDataRowCount
const footerEndRow = footerStartRow + 1
const expectedHeaders = [
	'No.',
	'Item Code',
	'Description',
	'Unit',
	'Quantity Requested',
	'Buffer',
	'Total',
	'Current Stock',
	'Remarks'
]
const dateFormatter = new Intl.DateTimeFormat('en-PH', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'Asia/Manila'
})

const requisitionTemplates = {
	bancasi: {
		fileName: 'Branch_Inventory_Requisition-Bancasi.xlsx',
		url: bancasiTemplateUrl
	},
	gingoog: {
		fileName: 'Branch_Inventory_Requisition-Gingoog.xlsx',
		url: gingoogTemplateUrl
	}
}

const escapeXmlText = (value) => String(value)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')

const getRequisitionTemplate = (branchName) => {
	const normalizedBranchName = branchName.trim().toLocaleLowerCase()
	if (normalizedBranchName.includes('gingoog')) return requisitionTemplates.gingoog
	if (normalizedBranchName.includes('bancasi') || normalizedBranchName.includes('bansasi')) {
		return requisitionTemplates.bancasi
	}
	throw new Error(`No stock requisition workbook template is configured for "${branchName}".`)
}

const restoreTemplateDrawing = async (
	templateBuffer,
	workbookBuffer,
	extraRows,
	branchName,
	requestDate
) => {
	const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate')
	const templateFiles = unzipSync(new Uint8Array(templateBuffer))
	const workbookFiles = unzipSync(new Uint8Array(workbookBuffer))
	const drawingPath = 'xl/drawings/drawing1.xml'
	const worksheetPath = 'xl/worksheets/sheet1.xml'
	const worksheetRelationshipsPath = 'xl/worksheets/_rels/sheet1.xml.rels'
	const drawing = templateFiles[drawingPath]
	const worksheetRelationships = templateFiles[worksheetRelationshipsPath]
	const worksheet = workbookFiles[worksheetPath]
	const contentTypes = workbookFiles['[Content_Types].xml']

	if (!drawing || !worksheetRelationships || !worksheet || !contentTypes) {
		throw new Error('The requisition workbook is missing required drawing files.')
	}

	const relationshipsXml = strFromU8(worksheetRelationships)
	const drawingRelationship = relationshipsXml.match(/<Relationship\b[^>]*\/drawing"[^>]*\/>/)
	const relationshipId = drawingRelationship?.[0].match(/\bId="([^"]+)"/)?.[1]
	if (!relationshipId) {
		throw new Error('The requisition workbook drawing relationship is missing.')
	}

	let drawingXml = strFromU8(drawing)
	let hasBranchField = false
	let hasDateField = false
	drawingXml = drawingXml
		.replace('<a:t>BRANCH:</a:t>', () => {
			hasBranchField = true
			return `<a:t>BRANCH: ${escapeXmlText(branchName)}</a:t>`
		})
		.replace('<a:t>DATE:</a:t>', () => {
			hasDateField = true
			return `<a:t>DATE: ${escapeXmlText(requestDate)}</a:t>`
		})
	if (!hasBranchField || !hasDateField) {
		throw new Error('The requisition workbook is missing its branch or date field.')
	}

	if (extraRows > 0) {
		drawingXml = drawingXml.replace(
			/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g,
			(anchor) => anchor.replace(
				/(<xdr:row>)(\d+)(<\/xdr:row>)/g,
				(match, openingTag, rowNumber, closingTag) => (
					Number(rowNumber) >= footerStartRow - 1
						? `${openingTag}${Number(rowNumber) + extraRows}${closingTag}`
						: match
				)
			)
		)
	}

	let worksheetXml = strFromU8(worksheet)
	if (!/<drawing\b/.test(worksheetXml)) {
		worksheetXml = worksheetXml.replace(
			'</worksheet>',
			`<drawing r:id="${relationshipId}"/></worksheet>`
		)
	}

	let contentTypesXml = strFromU8(contentTypes)
	if (!/PartName="\/xl\/drawings\/drawing1\.xml"/.test(contentTypesXml)) {
		contentTypesXml = contentTypesXml.replace(
			'</Types>',
			'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'
		)
	}

	workbookFiles[drawingPath] = strToU8(drawingXml)
	workbookFiles[worksheetPath] = strToU8(worksheetXml)
	workbookFiles[worksheetRelationshipsPath] = worksheetRelationships
	workbookFiles['[Content_Types].xml'] = strToU8(contentTypesXml)
	return zipSync(workbookFiles)
}

const downloadWorkbook = (fileName, data) => {
	const downloadUrl = URL.createObjectURL(new Blob([data], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	}))
	const link = document.createElement('a')
	link.href = downloadUrl
	link.download = fileName
	document.body.appendChild(link)
	link.click()
	link.remove()
	window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
}

export async function downloadTafiAdminStockRequestXlsx(
	requestItems,
	branchName,
	createdAt
) {
	const normalizedBranchName = branchName?.trim()
	if (!normalizedBranchName) {
		throw new Error('The requesting branch name is unavailable for the requisition workbook.')
	}
	if (!requestItems.length) {
		throw new Error('There are no stock request items to export.')
	}

	const requestDateValue = new Date(createdAt)
	if (Number.isNaN(requestDateValue.getTime())) {
		throw new Error('The stock request date is invalid.')
	}
	const requestDate = dateFormatter.format(requestDateValue)
	const template = getRequisitionTemplate(normalizedBranchName)
	const response = await fetch(template.url)
	if (!response.ok) {
		throw new Error(`Could not load the requisition template (HTTP ${response.status}).`)
	}

	const { default: ExcelJS } = await import('exceljs')
	const workbook = new ExcelJS.Workbook()
	const templateBuffer = await response.arrayBuffer()
	await workbook.xlsx.load(templateBuffer)
	const worksheet = workbook.worksheets[0]
	if (!worksheet) {
		throw new Error('The requisition template does not contain a worksheet.')
	}
	if (expectedHeaders.some((header, index) => worksheet.getCell(5, index + 1).value !== header)) {
		throw new Error('The requisition template columns do not match the expected layout.')
	}

	const extraRows = Math.max(0, requestItems.length - templateDataRowCount)
	if (extraRows > 0) {
		worksheet.unMergeCells(`A${footerStartRow}:I${footerEndRow}`)
		worksheet.insertRows(
			footerStartRow,
			Array.from({ length: extraRows }, () => Array(9).fill(null)),
			'i+'
		)
		worksheet.mergeCells(
			`A${footerStartRow + extraRows}:I${footerEndRow + extraRows}`
		)
	}

	const lastDataRow = firstDataRow + Math.max(templateDataRowCount, requestItems.length) - 1
	for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
		for (let columnNumber = 1; columnNumber <= 9; columnNumber += 1) {
			worksheet.getCell(rowNumber, columnNumber).value = null
		}
	}

	requestItems.forEach((item, index) => {
		const quantityRequested = Number(item.quantityRequested)
		const quantityBuffer = Number(item.quantityBuffer ?? 0)
		const quantityTotal = Number(item.quantityTotal ?? quantityRequested + quantityBuffer)
		const currentStock = item.currentStock === null || item.currentStock === undefined
			? null
			: Number(item.currentStock)

		if (!Number.isInteger(quantityRequested) || quantityRequested <= 0) {
			throw new Error(`Requested quantity for ${item.stockNo} is invalid.`)
		}
		if (!Number.isInteger(quantityBuffer) || quantityBuffer < 0) {
			throw new Error(`Buffer quantity for ${item.stockNo} is invalid.`)
		}
		if (quantityTotal !== quantityRequested + quantityBuffer) {
			throw new Error(`Total quantity for ${item.stockNo} does not match requested plus buffer.`)
		}
		if (currentStock !== null && !Number.isFinite(currentStock)) {
			throw new Error(`Branch current stock for ${item.stockNo} is invalid.`)
		}

		const rowNumber = firstDataRow + index
		worksheet.getCell(rowNumber, 1).value = index + 1
		worksheet.getCell(rowNumber, 2).value = item.stockNo ?? ''
		worksheet.getCell(rowNumber, 3).value = item.description ?? ''
		worksheet.getCell(rowNumber, 4).value = item.unit ?? ''
		worksheet.getCell(rowNumber, 5).value = quantityRequested
		worksheet.getCell(rowNumber, 6).value = quantityBuffer
		worksheet.getCell(rowNumber, 7).value = quantityTotal
		worksheet.getCell(rowNumber, 8).value = currentStock
		worksheet.getCell(rowNumber, 9).value = item.remarks ?? ''
	})

	const workbookBuffer = await workbook.xlsx.writeBuffer()
	const completeWorkbook = await restoreTemplateDrawing(
		templateBuffer,
		workbookBuffer,
		extraRows,
		normalizedBranchName,
		requestDate
	)
	downloadWorkbook(template.fileName, completeWorkbook)
	return template.fileName
}
