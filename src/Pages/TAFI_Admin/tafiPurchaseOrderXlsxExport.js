import poTemplateUrl from './xlsl_format/PO.xlsx?url'

const firstItemRow = 6
const templateItemCount = 10
const footerStartRow = firstItemRow + templateItemCount
const expectedHeaders = [
  'ITEM DESCRIPTION',
  'QTY',
  'UNIT',
  'UNIT PRICE',
  'TOTAL COST'
]

const escapeXmlText = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const replaceShapeText = (drawingXml, shapeId, textIndex, value) => {
  let shapeFound = false
  const updatedDrawingXml = drawingXml.replace(/<xdr:sp\b[\s\S]*?<\/xdr:sp>/g, (shapeXml) => {
    const id = shapeXml.match(/<xdr:cNvPr\b[^>]*\bid="([^"]+)"/)?.[1]
    if (id !== String(shapeId)) return shapeXml
    shapeFound = true

    let currentIndex = 0
    let textFound = false
    const updatedShapeXml = shapeXml.replace(
      /(<a:t(?:\s[^>]*)?>)[\s\S]*?(<\/a:t>)/g,
      (match, openingTag, closingTag) => {
        const index = currentIndex
        currentIndex += 1
        if (index !== textIndex) return match
        textFound = true
        return `${openingTag}${escapeXmlText(value)}${closingTag}`
      }
    )
    if (!textFound) {
      throw new Error(`The PO template is missing a text field in shape ${shapeId}.`)
    }
    return updatedShapeXml
  })

  if (!shapeFound) {
    throw new Error(`The PO template is missing shape ${shapeId}.`)
  }
  return updatedDrawingXml
}

const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const formatDate = (dateKey) => {
  const date = new Date(`${dateKey}T12:00:00`)
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Enter a valid purchase order date and promise date.')
  }
  return date.toLocaleDateString('en-PH')
}

const updatePurchaseOrderDrawing = (drawingXml, order, extraRows) => {
  const updates = [
    [5, 1, ` ${order.supplier}`],
    [10, 0, `PURCHASE ORDER NO. ${order.poNumber}`],
    [11, 1, formatDate(order.poDate)],
    [12, 1, order.paymentTerms],
    [13, 1, formatDate(order.promiseDate)],
    [16, 0, order.remarks || ' '],
    [21, 2, formatCurrency(order.subtotal)],
    [22, 2, formatCurrency(order.discount)],
    [23, 2, formatCurrency(order.vat)],
    [24, 1, formatCurrency(order.tax)],
    [25, 0, `Total Cost: ${formatCurrency(order.totalCost)}`]
  ]

  let updatedDrawingXml = updates.reduce(
    (currentXml, [shapeId, textIndex, value]) => replaceShapeText(
      currentXml,
      shapeId,
      textIndex,
      value
    ),
    drawingXml
  )

  if (extraRows > 0) {
    updatedDrawingXml = updatedDrawingXml.replace(
      /<xdr:row>(\d+)<\/xdr:row>/g,
      (match, rowNumber) => (
        Number(rowNumber) >= footerStartRow - 1
          ? `<xdr:row>${Number(rowNumber) + extraRows}</xdr:row>`
          : match
      )
    )
  }
  return updatedDrawingXml
}

export async function downloadTafiPurchaseOrder(order) {
  if (!order.supplier?.trim() || !order.poNumber?.trim() || !order.items?.length) {
    throw new Error('Complete the supplier, purchase order number, and item details before downloading.')
  }

  const response = await fetch(poTemplateUrl)
  if (!response.ok) {
    throw new Error(`Could not load the PO template (HTTP ${response.status}).`)
  }

  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const templateBuffer = await response.arrayBuffer()
  await workbook.xlsx.load(templateBuffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('The PO template does not contain a worksheet.')
  }
  if (expectedHeaders.some((header, index) => worksheet.getCell(5, index + 2).value !== header)) {
    throw new Error('The PO template columns do not match the expected layout.')
  }

  const extraRows = Math.max(0, order.items.length - templateItemCount)
  if (extraRows > 0) {
    worksheet.unMergeCells('A5:A15')
    worksheet.unMergeCells('G5:H15')
    worksheet.unMergeCells('A16:H19')
    worksheet.insertRows(
      footerStartRow,
      Array.from({ length: extraRows }, () => Array(8).fill(null)),
      'i+'
    )
    worksheet.mergeCells(`A5:A${15 + extraRows}`)
    worksheet.mergeCells(`G5:H${15 + extraRows}`)
    worksheet.mergeCells(`A${16 + extraRows}:H${19 + extraRows}`)
  }

  order.items.forEach((item, index) => {
    const rowNumber = firstItemRow + index
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`Purchase order item ${index + 1} has an invalid quantity or unit price.`)
    }

    worksheet.getCell(rowNumber, 2).value = item.description
    worksheet.getCell(rowNumber, 3).value = quantity
    worksheet.getCell(rowNumber, 4).value = item.unit
    worksheet.getCell(rowNumber, 5).value = unitPrice
    worksheet.getCell(rowNumber, 5).numFmt = '#,##0.00'
    worksheet.getCell(rowNumber, 6).value = {
      formula: `C${rowNumber}*E${rowNumber}`,
      result: Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100
    }
    worksheet.getCell(rowNumber, 6).numFmt = '#,##0.00'
  })

  const workbookBuffer = await workbook.xlsx.writeBuffer()
  const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate')
  const templateFiles = unzipSync(new Uint8Array(templateBuffer))
  const workbookFiles = unzipSync(new Uint8Array(workbookBuffer))
  const drawingPath = 'xl/drawings/drawing1.xml'
  const drawingRelationshipsPath = 'xl/drawings/_rels/drawing1.xml.rels'
  const worksheetRelationshipsPath = 'xl/worksheets/_rels/sheet1.xml.rels'
  const drawing = templateFiles[drawingPath]
  const drawingRelationships = templateFiles[drawingRelationshipsPath]
  const worksheetRelationships = templateFiles[worksheetRelationshipsPath]
  const worksheetXml = workbookFiles['xl/worksheets/sheet1.xml']
  const contentTypes = workbookFiles['[Content_Types].xml']

  if (!drawing || !drawingRelationships || !worksheetRelationships || !worksheetXml || !contentTypes) {
    throw new Error('The PO template is missing a required worksheet drawing or relationship.')
  }

  const relationshipsXml = strFromU8(worksheetRelationships)
  const drawingRelationship = relationshipsXml.match(/<Relationship\b[^>]*\/drawing"[^>]*\/>/)
  const relationshipId = drawingRelationship?.[0].match(/\bId="([^"]+)"/)?.[1]
  if (!relationshipId) {
    throw new Error('The PO template drawing relationship is missing.')
  }

  const updatedDrawingXml = updatePurchaseOrderDrawing(
    strFromU8(drawing),
    order,
    extraRows
  )
  let updatedWorksheetXml = strFromU8(worksheetXml)
  if (!/<drawing\b/.test(updatedWorksheetXml)) {
    updatedWorksheetXml = updatedWorksheetXml.replace(
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

  workbookFiles[drawingPath] = strToU8(updatedDrawingXml)
  workbookFiles[drawingRelationshipsPath] = drawingRelationships
  workbookFiles[worksheetRelationshipsPath] = worksheetRelationships
  workbookFiles['xl/worksheets/sheet1.xml'] = strToU8(updatedWorksheetXml)
  workbookFiles['[Content_Types].xml'] = strToU8(contentTypesXml)

  const completeWorkbook = zipSync(workbookFiles)
  const downloadUrl = URL.createObjectURL(new Blob([completeWorkbook], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }))
  const link = document.createElement('a')
  link.href = downloadUrl
  const safeOrderNumber = order.poNumber.replace(/[<>:"/\\|?*]/g, '-')
  link.download = `PO-${safeOrderNumber}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
  return link.download
}
