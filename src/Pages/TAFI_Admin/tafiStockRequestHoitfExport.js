import hoitfTemplateUrl from './xlsl_format/HOITF.xlsx?url'

const firstDataRow = 5
const templateDataRowCount = 20
const footerStartRow = firstDataRow + templateDataRowCount
const expectedHeaders = [
	'No.',
	'Item Code',
	'Description',
	'Unit',
	'Qty Release',
	'Unit Cost',
	'Amount'
]

const escapeXmlText = (value) => String(value)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')

const restoreTemplateDrawing = async (templateBuffer, workbookBuffer, extraRows, branchName) => {
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
		throw new Error('The HOITF template is missing its header or footer drawing.')
	}

	const relationshipsXml = strFromU8(worksheetRelationships)
	const drawingRelationship = relationshipsXml.match(/<Relationship\b[^>]*\/drawing"[^>]*\/>/)
	const relationshipId = drawingRelationship?.[0].match(/\bId="([^"]+)"/)?.[1]
	if (!relationshipId) {
		throw new Error('The HOITF template drawing relationship is missing.')
	}

	let drawingXml = strFromU8(drawing)
	let hasBranchField = false
	drawingXml = drawingXml.replace('<a:t>BRANCH:</a:t>', () => {
		hasBranchField = true
		return `<a:t>BRANCH: ${escapeXmlText(branchName)}</a:t>`
	})
	if (!hasBranchField) {
		throw new Error('The HOITF template is missing its branch field.')
	}

	if (extraRows > 0) {
		drawingXml = drawingXml.replace(
			/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g,
			(anchor) => anchor.replace(
				/(<xdr:row>)(\d+)(<\/xdr:row>)/g,
				(match, openingTag, rowNumber, closingTag) => (
					Number(rowNumber) >= 24
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

export async function downloadTafiStockRequestHoitf(preparationItems, branchName) {
	const normalizedBranchName = branchName?.trim()
	if (!normalizedBranchName) {
		throw new Error('The requesting branch name is unavailable for the HOITF workbook.')
	}

	const response = await fetch(hoitfTemplateUrl)
	if (!response.ok) {
		throw new Error(`Could not load the HOITF template (HTTP ${response.status}).`)
	}

	const { default: ExcelJS } = await import('exceljs')
	const workbook = new ExcelJS.Workbook()
	const templateBuffer = await response.arrayBuffer()
	await workbook.xlsx.load(templateBuffer)
	const worksheet = workbook.worksheets[0]
	if (!worksheet) {
		throw new Error('The HOITF template does not contain a worksheet.')
	}

	if (expectedHeaders.some((header, index) => worksheet.getCell(4, index + 1).value !== header)) {
		throw new Error('The HOITF template columns do not match the expected layout.')
	}

	const extraRows = Math.max(0, preparationItems.length - templateDataRowCount)
	if (extraRows > 0) {
		worksheet.unMergeCells(`A${footerStartRow}:G${footerStartRow + 2}`)
		worksheet.insertRows(
			footerStartRow,
			Array.from({ length: extraRows }, () => Array(7).fill(null)),
			'i+'
		)
		worksheet.mergeCells(
			`A${footerStartRow + extraRows}:G${footerStartRow + extraRows + 2}`
		)
	}

	const lastDataRow = firstDataRow + Math.max(templateDataRowCount, preparationItems.length) - 1
	for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
		for (let columnNumber = 1; columnNumber <= 7; columnNumber += 1) {
			worksheet.getCell(rowNumber, columnNumber).value = null
		}
	}

	preparationItems.forEach((item, index) => {
		const rowNumber = firstDataRow + index
		const quantity = Number(item.quantity)
		const unitPrice = item.unit_price === null || item.unit_price === undefined
			? null
			: Number(item.unit_price)

		if (!Number.isFinite(quantity) || quantity <= 0) {
			throw new Error(`Prepared item ${item.stock_no} has an invalid quantity.`)
		}
		if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
			throw new Error(`Prepared item ${item.stock_no} has an invalid unit price.`)
		}

		worksheet.getCell(rowNumber, 1).value = index + 1
		worksheet.getCell(rowNumber, 2).value = item.stock_no ?? ''
		worksheet.getCell(rowNumber, 3).value = item.item_description ?? ''
		worksheet.getCell(rowNumber, 4).value = item.unit_of_measure ?? ''
		worksheet.getCell(rowNumber, 5).value = quantity
		worksheet.getCell(rowNumber, 6).value = unitPrice
		worksheet.getCell(rowNumber, 7).value = unitPrice === null
			? null
			: Math.round(unitPrice * quantity * 100) / 100
	})

	const buffer = await workbook.xlsx.writeBuffer()
	const completeWorkbook = await restoreTemplateDrawing(
		templateBuffer,
		buffer,
		extraRows,
		normalizedBranchName
	)
	const downloadUrl = URL.createObjectURL(new Blob([completeWorkbook], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	}))
	const link = document.createElement('a')
	link.href = downloadUrl
	link.download = 'HOITF.xlsx'
	document.body.appendChild(link)
	link.click()
	link.remove()
	window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
	return link.download
}
