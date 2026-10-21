import bancasiTemplateUrl from './xlsl_format_Branch/Branch_Inventory_Requisition-Bancasi.xlsx?url'
import gingoogTemplateUrl from './xlsl_format_Branch/Branch_Inventory_Requisition-Gingoog.xlsx?url'

const requisitionTemplates = {
	bancasi: {
		approvedByName: 'CHERELYN A. OMAQUE',
		branchTitle: 'Tuna Republic - Bancasi Branch',
		fileName: 'Branch_Inventory_Requisition-Bancasi.xlsx',
		url: bancasiTemplateUrl
	},
	gingoog: {
		approvedByName: 'JISELLE P. PALARCA',
		branchTitle: 'Tuna Republic - Gingoog Branch',
		fileName: 'Branch_Inventory_Requisition-Gingoog.xlsx',
		url: gingoogTemplateUrl
	}
}

const escapeXmlText = (value) => String(value)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')

export const getBranchStockRequestDate = (date = new Date()) => new Intl.DateTimeFormat('en-PH', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'Asia/Manila'
}).format(date)

const downloadFile = (fileName, blob) => {
	const downloadUrl = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = downloadUrl
	link.download = fileName
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(downloadUrl)
}

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
		throw new Error('The stock requisition workbook is missing required drawing files.')
	}

	const relationshipsXml = strFromU8(worksheetRelationships)
	const drawingRelationship = relationshipsXml.match(/<Relationship\b[^>]*\/drawing"[^>]*\/>/)
	const relationshipId = drawingRelationship?.[0].match(/\bId="([^"]+)"/)?.[1]
	if (!relationshipId) {
		throw new Error('The stock requisition workbook drawing relationship is missing.')
	}

	let drawingXml = strFromU8(drawing)
	let hasBranchField = false
	let hasDateField = false
	drawingXml = drawingXml
		.replace('<a:t>BRANCH:</a:t>', () => {
			hasBranchField = true
			return `<a:t>BRANCH: ${escapeXmlText(branchName.trim())}</a:t>`
		})
		.replace('<a:t>DATE:</a:t>', () => {
			hasDateField = true
			return `<a:t>DATE: ${escapeXmlText(requestDate)}</a:t>`
		})
	if (!hasBranchField || !hasDateField) {
		throw new Error('The stock requisition template is missing its branch or date field.')
	}

	if (extraRows > 0) {
		drawingXml = drawingXml.replace(
			/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g,
			(anchor) => anchor.replace(
				/(<xdr:row>)(\d+)(<\/xdr:row>)/g,
				(match, openingTag, rowNumber, closingTag) => (
					Number(rowNumber) >= 16
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

const downloadBlob = (fileName, data) => downloadFile(fileName, new Blob([data], {
	type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}))

export async function downloadBranchStockRequestWorkbook(
	branchName,
	requestedItems,
	requestDate = getBranchStockRequestDate()
) {
	const template = getRequisitionTemplate(branchName)
	const response = await fetch(template.url)
	if (!response.ok) {
		throw new Error(`Could not load the stock requisition template (HTTP ${response.status}).`)
	}

	const { default: ExcelJS } = await import('exceljs')
	const workbook = new ExcelJS.Workbook()
	const templateBuffer = await response.arrayBuffer()
	await workbook.xlsx.load(templateBuffer)
	const worksheet = workbook.worksheets[0]
	if (!worksheet) {
		throw new Error('The stock requisition template does not contain a worksheet.')
	}

	const firstDataRow = 6
	const initialDataRowCount = 11
	const extraRows = Math.max(0, requestedItems.length - initialDataRowCount)
	if (extraRows > 0) {
		worksheet.unMergeCells('A17:G18')
		worksheet.insertRows(
			17,
			Array.from({ length: extraRows }, () => Array(7).fill(null)),
			'i+'
		)
		worksheet.mergeCells(`A${17 + extraRows}:G${18 + extraRows}`)
	}

	requestedItems.forEach((item, index) => {
		const row = firstDataRow + index
		worksheet.getCell(row, 1).value = index + 1
		worksheet.getCell(row, 2).value = item.stockNo
		worksheet.getCell(row, 3).value = item.description
		worksheet.getCell(row, 4).value = item.unit
		worksheet.getCell(row, 5).value = item.quantityRequested
		worksheet.getCell(row, 6).value = item.currentStock
	})

	const workbookBuffer = await workbook.xlsx.writeBuffer()
	const completeWorkbook = await restoreTemplateDrawing(
		templateBuffer,
		workbookBuffer,
		extraRows,
		branchName,
		requestDate
	)
	downloadBlob(template.fileName, completeWorkbook)
	return template.fileName
}

export async function downloadBranchStockRequestPdf(
	branchName,
	requestedItems,
	requestDate = getBranchStockRequestDate()
) {
	const template = getRequisitionTemplate(branchName)
	const { jsPDF } = await import('jspdf')
	const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
	const pageWidth = document.internal.pageSize.getWidth()
	const pageHeight = document.internal.pageSize.getHeight()
	const leftMargin = 19.05
	const topMargin = 25.4
	const bottomMargin = 25.4
	const tableColumns = [
		{ title: 'No.', width: 11.1 },
		{ title: 'Item Code', width: 20.9 },
		{ title: 'Description', width: 48.4 },
		{ title: 'Unit', width: 14.3 },
		{ title: 'Quantity Requested', width: 32.8 },
		{ title: 'Current Stock', width: 23.3 },
		{ title: 'Remarks', width: 23.3 }
	]
	const pdfFileName = template.fileName.replace(/\.xlsx$/i, '.pdf')
	const headerHeight = 24.75 * 25.4 / 72
	const rowHeight = 13.2 * 25.4 / 72
	let tableY = 0

	document.setProperties({
		title: `Branch Inventory Requisition - ${branchName}`,
		subject: 'TAFI stock request'
	})
	const drawTableHeader = () => {
		let x = leftMargin
		document.setFont('helvetica', 'bold')
		document.setFontSize(10)
		document.setDrawColor(0, 0, 0)
		document.setLineWidth(0.12)
		tableColumns.forEach(({ title, width }) => {
			document.rect(x, tableY, width, headerHeight)
			document.text(
				document.splitTextToSize(title, width - 2),
				x + width / 2,
				tableY + headerHeight / 2,
				{ align: 'center', baseline: 'middle' }
			)
			x += width
		})
		tableY += headerHeight
	}

	const drawPageHeader = () => {
		document.setFont('helvetica', 'bold')
		document.setFontSize(12)
		document.text('TRITON ACCE FOOD INC', pageWidth / 2, topMargin + 3.3, { align: 'center' })
		document.setFont('helvetica', 'normal')
		document.setFontSize(11)
		document.text('P-7 Brgy. Bancasi, Butuan City, Philippines', pageWidth / 2, topMargin + 9, { align: 'center' })
		document.setFont('helvetica', 'bold')
		document.setFontSize(10)
		document.text(template.branchTitle, pageWidth / 2, topMargin + 15.5, { align: 'center' })
		document.setFontSize(14)
		document.text('BRANCH INVENTORY REQUISITION', pageWidth / 2, topMargin + 27.5, { align: 'center' })
		document.setFontSize(10)
		document.text(`BRANCH: ${branchName.trim()}`, leftMargin, topMargin + 42.1)
		document.text('DELIVERY DATE:', leftMargin, topMargin + 47.9)
		document.text('NO.:', leftMargin + 131.2, topMargin + 42.9)
		document.text(`DATE: ${requestDate}`, leftMargin + 131.2, topMargin + 47.2)
		tableY = 86.2
		drawTableHeader()
	}

	const drawFooter = () => {
		const signatureY = tableY + 2.5
		document.setFont('helvetica', 'bold')
		document.setFontSize(9)
		document.text('Requested by:', leftMargin, signatureY)
		document.text('Approved by:', leftMargin + 120.2, signatureY - 1)
		document.setFontSize(10)
		document.text(template.approvedByName, leftMargin + 4.2, signatureY + 7)
		document.text('Relyn C. Bihag', leftMargin + 119.9, signatureY + 7)
		document.setFont('helvetica', 'normal')
		document.setFontSize(9)
		document.text('Branch Admin', leftMargin + 5, signatureY + 13)
		document.text('Administrative Officer II', leftMargin + 120.2, signatureY + 13)
	}

	drawPageHeader()
	requestedItems.forEach((item, index) => {
		const values = [
			index + 1,
			item.stockNo,
			item.description,
			item.unit,
			item.quantityRequested,
			item.currentStock,
			''
		]
		if (tableY + rowHeight + 18 > pageHeight - bottomMargin) {
			document.addPage()
			drawPageHeader()
		}

		let x = leftMargin
		document.setFont('helvetica', 'normal')
		document.setFontSize(10)
		document.setDrawColor(0, 0, 0)
		tableColumns.forEach(({ width }, columnIndex) => {
			document.rect(x, tableY, width, rowHeight)
			const cellText = document.splitTextToSize(
				String(values[columnIndex] ?? ''),
				width - 2
			)[0] ?? ''
			document.text(cellText, x + 1, tableY + rowHeight / 2, { baseline: 'middle' })
			x += width
		})
		tableY += rowHeight
	})

	if (tableY + 16 > pageHeight - bottomMargin) {
		document.addPage()
		drawPageHeader()
	}
	drawFooter()

	downloadFile(pdfFileName, document.output('blob'))
	return pdfFileName
}
