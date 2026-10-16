import payrollWorkbookTemplateUrl from './xlsl_format/Branch_per_week_payroll.xlsx?url'

const branchPayrollDetails = {
  gingoog: {
    match: 'gingoog',
    driveFolderUrl: 'https://drive.google.com/drive/folders/1oDqxSpSnLqizMM_DFyDtfDjQFFizSImj?usp=sharing',
    email: 'trgingoog@gmail.com',
    branchLabel: 'Gingoog Branch',
    administrativeOfficer: 'JISELLE P. PALARCA',
    branchManager: 'LAICHA D. JABAGAT'
  },
  bancasi: {
    match: 'bancasi',
    driveFolderUrl: 'https://drive.google.com/drive/folders/1MXU6WfuNLIo8CbvBPOeTf9dkdCE5KfsE?usp=sharing',
    email: 'trbancasi@gmail.com',
    branchLabel: 'Bancasi Branch',
    administrativeOfficer: 'CHERELYN A. OMAQUE',
    branchManager: 'JAMES DARREL B. POLISON'
  }
}

const getBranchPayrollDetails = (branchName = '') => {
  const normalizedName = branchName.toLowerCase()
  return Object.values(branchPayrollDetails)
    .find((details) => normalizedName.includes(details.match))
}

const roundPeso = (amount) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return amount
  return Math.sign(amount) * Math.floor(Math.abs(amount) + 0.5)
}

const roundPayrollRow = (employee) => {
  const monetaryFields = [
    'monthlyRate',
    'dailyRate',
    'basicSalary',
    'holiday_regular_pay',
    'overtime_pay',
    'special_nonworking_holiday',
    'sss',
    'philhealth',
    'pagibig',
    'hdmfLoanDeduction',
    'cashAdvanceDeduction',
    'lateDeduction',
    'undertimeDeduction',
    'otherDeduction'
  ]
  const rounded = { ...employee }
  monetaryFields.forEach((field) => {
    rounded[field] = roundPeso(employee[field])
  })

  rounded.salaryCredit = employee.salaryCredit === null
    ? null
    : rounded.basicSalary + rounded.holiday_regular_pay
      + rounded.overtime_pay + rounded.special_nonworking_holiday
  rounded.totalDeductions = monetaryFields.slice(6).reduce(
    (total, field) => total + (rounded[field] ?? 0),
    0
  )
  rounded.weeklyNet = employee.weeklyNet === null
    ? null
    : rounded.salaryCredit - rounded.totalDeductions

  return rounded
}

export const getBranchDriveFolder = (branchName = '') => (
  getBranchPayrollDetails(branchName)?.driveFolderUrl ?? ''
)

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

const insertPayrollPositionColumn = (worksheet) => {
  const insertionColumn = 5
  const originalColumnCount = 25
  const rowCount = worksheet.rowCount
  const mergeRanges = [...worksheet.model.merges]
  const columnWidths = Array.from(
    { length: originalColumnCount },
    (_, index) => worksheet.getColumn(index + 1).width
  )
  const positionStyles = Array.from(
    { length: rowCount },
    (_, index) => ({ ...worksheet.getCell(index + 1, insertionColumn - 1).style })
  )

  mergeRanges.forEach((range) => worksheet.unMergeCells(range))
  for (let row = 1; row <= rowCount; row += 1) {
    for (let column = originalColumnCount; column >= insertionColumn; column -= 1) {
      const source = worksheet.getCell(row, column)
      const destination = worksheet.getCell(row, column + 1)
      destination.value = source.value
      destination.style = { ...source.style }
      source.value = null
      source.style = {}
    }
    worksheet.getCell(row, insertionColumn).style = positionStyles[row - 1]
  }

  for (let column = originalColumnCount; column >= insertionColumn; column -= 1) {
    worksheet.getColumn(column + 1).width = columnWidths[column - 1]
  }
  worksheet.getColumn(insertionColumn).width = 18

  const shiftColumn = (columnName) => {
    let columnNumber = 0
    for (const character of columnName) {
      columnNumber = columnNumber * 26 + character.charCodeAt(0) - 64
    }
    if (columnNumber >= insertionColumn) columnNumber += 1
    let shiftedName = ''
    while (columnNumber > 0) {
      const remainder = (columnNumber - 1) % 26
      shiftedName = String.fromCharCode(65 + remainder) + shiftedName
      columnNumber = Math.floor((columnNumber - 1) / 26)
    }
    return shiftedName
  }

  const shiftCell = (cellReference) => cellReference.replace(
    /^(\$?)([A-Z]+)(\$?)(\d+)$/,
    (match, absoluteColumn, columnName, absoluteRow, rowNumber) => (
      `${absoluteColumn}${shiftColumn(columnName)}${absoluteRow}${rowNumber}`
    )
  )
  mergeRanges.forEach((range) => {
    worksheet.mergeCells(range.split(':').map(shiftCell).join(':'))
  })
  worksheet.mergeCells('E15:E16')
  worksheet.getCell('E15').value = 'POSITION'
}

const restoreTemplateDrawings = async (
  templateBuffer,
  workbookBuffer,
  extraRows,
  extraColumns,
  coveredPeriod,
  branchDetails
) => {
  const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate')
  const templateFiles = unzipSync(new Uint8Array(templateBuffer))
  const workbookFiles = unzipSync(new Uint8Array(workbookBuffer))
  const drawingPath = 'xl/drawings/drawing1.xml'
  const drawingRelationshipsPath = 'xl/drawings/_rels/drawing1.xml.rels'
  const drawing = templateFiles[drawingPath]
  const drawingRelationships = templateFiles[drawingRelationshipsPath]

  if (!drawing || !drawingRelationships || !workbookFiles[drawingPath]) {
    throw new Error('The workbook template drawing files are missing.')
  }

  let drawingXml = strFromU8(drawing)
  let drawingRelationshipsXml = strFromU8(drawingRelationships)
  if (branchDetails) {
    drawingXml = drawingXml
      .replace(
        /(<xdr:oneCellAnchor>[\s\S]*?<a:t>trbancasi@gmail\.com<\/a:t>[\s\S]*?<a:p>[\s\S]*?<a:t>)(<\/a:t>[\s\S]*?<a:t>WEEKLY PAYROLL<\/a:t>[\s\S]*?<\/xdr:oneCellAnchor>)/,
        (match, beforeBranchName, afterBranchName) => (
          `${beforeBranchName}${branchDetails.branchLabel}${afterBranchName}`
        )
      )
      .replace(
        '<a:t>trbancasi@gmail.com</a:t>',
        `<a:t>${branchDetails.email}</a:t>`
      )
      .replace(
        '<a:t>CHERELYN A. OMAQUE</a:t>',
        `<a:t>${branchDetails.administrativeOfficer}</a:t>`
      )
      .replace(
        '<a:t>JAMES DARREL B. POLISON</a:t>',
        `<a:t>${branchDetails.branchManager}</a:t>`
      )
    drawingRelationshipsXml = drawingRelationshipsXml.replace(
      'mailto:trbancasi@gmail.com',
      `mailto:${branchDetails.email}`
    )
  }

  if (extraRows > 0) {
    drawingXml = drawingXml.replace(
      /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g,
      (anchor) => anchor
        .replace(/(<xdr:row>)(\d+)(<\/xdr:row>)/g, (match, open, row, close) => (
          Number(row) >= 39 ? `${open}${Number(row) + extraRows}${close}` : match
        ))
        .replace(/(<xdr:col>)(\d+)(<\/xdr:col>)/g, (match, open, column, close) => (
          Number(column) >= 4 ? `${open}${Number(column) + extraColumns}${close}` : match
        ))
    )
  } else {
    drawingXml = drawingXml.replace(
      /(<xdr:col>)(\d+)(<\/xdr:col>)/g,
      (match, open, column, close) => (
        Number(column) >= 4 ? `${open}${Number(column) + extraColumns}${close}` : match
      )
    )
  }

  let hasCoveredPeriod = false
  drawingXml = drawingXml.replace(/<a:t>Covered from [^<]*<\/a:t>/, () => {
    hasCoveredPeriod = true
    return `<a:t>${coveredPeriod}</a:t>`
  })
  if (!hasCoveredPeriod) {
    throw new Error('The workbook template does not contain its covered-period label.')
  }

  workbookFiles[drawingPath] = strToU8(drawingXml)
  workbookFiles[drawingRelationshipsPath] = strToU8(drawingRelationshipsXml)
  return zipSync(workbookFiles)
}

export async function downloadPayrollWorkbook({
  payrollRows,
  branchName,
  selectedMonth,
  selectedWeek,
  payrollMonthLabel,
  selectedStartDate,
  selectedEndDate
}) {
  const response = await fetch(payrollWorkbookTemplateUrl)
  if (!response.ok) {
    throw new Error(`Could not load the workbook template (HTTP ${response.status}).`)
  }
  const templateBuffer = await response.arrayBuffer()

  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(templateBuffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('The workbook template does not contain a worksheet.')
  }

  insertPayrollPositionColumn(worksheet)
  const firstDataRow = 17
  const initialDataRowCount = 22
  const extraRows = Math.max(0, payrollRows.length - initialDataRowCount)
  if (extraRows > 0) {
    worksheet.unMergeCells('A40:Z43')
    worksheet.insertRows(
      39,
      Array.from({ length: extraRows }, () => Array(26).fill(null)),
      'i+'
    )
    worksheet.mergeCells(`A${40 + extraRows}:Z${43 + extraRows}`)
  }

  const roundedPayrollRows = payrollRows.map(roundPayrollRow)
  roundedPayrollRows.forEach((employee, index) => {
    const values = [
      index + 1,
      employee.id,
      employee.name,
      employee.employmentClassification,
      employee.position,
      employee.monthlyRate,
      employee.dailyRate,
      employee.hasAttendance ? employee.presentDays : null,
      employee.hasAttendance ? employee.leaveWithPayDays : null,
      employee.totalDays,
      employee.basicSalary,
      employee.holiday_regular_pay,
      employee.overtime_pay,
      employee.special_nonworking_holiday,
      employee.salaryCredit,
      employee.hasContributions ? employee.sss : null,
      employee.hasContributions ? employee.philhealth : null,
      employee.hasContributions ? employee.pagibig : null,
      employee.hdmfLoanDeduction,
      employee.cashAdvanceDeduction,
      employee.lateDeduction,
      employee.undertimeDeduction,
      employee.otherDeduction,
      employee.hasContributions ? employee.totalDeductions : null,
      employee.weeklyNet,
      null
    ]
    values.forEach((value, columnIndex) => {
      worksheet.getCell(firstDataRow + index, columnIndex + 1).value = value ?? null
    })
  })

  const totalRow = 39 + extraRows
  const total = (getValue) => roundedPayrollRows.reduce((sum, employee) => {
    const value = getValue(employee)
    return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  }, 0)
  worksheet.getCell(`K${totalRow}`).value = total((employee) => employee.basicSalary)
  worksheet.getCell(`O${totalRow}`).value = total((employee) => employee.salaryCredit)
  worksheet.getCell(`X${totalRow}`).value = total((employee) =>
    employee.hasContributions ? employee.totalDeductions : null
  )
  worksheet.getCell(`Y${totalRow}`).value = total((employee) => employee.weeklyNet)

  const pesoNumberFormat = '"₱"#,##0;-"₱"#,##0;"₱" -'
  const monetaryColumns = [6, 7, ...Array.from({ length: 15 }, (_, index) => index + 11)]
  for (let row = firstDataRow; row <= totalRow; row += 1) {
    monetaryColumns.forEach((column) => {
      worksheet.getCell(row, column).numFmt = pesoNumberFormat
    })
  }

  const weekLabel = `${selectedWeek.label} (${selectedWeek.startDay}-${selectedWeek.endDay})`
  const normalizedBranchName = branchName || 'Branch'
  const branchDetails = getBranchPayrollDetails(normalizedBranchName)
  const branchSlug = normalizedBranchName.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'branch'
  const periodFileName = selectedWeek.type === 'week'
    ? `week-${selectedWeek.weekNumber}`
    : `covered-${selectedWeek.startDay}-${selectedWeek.endDay}`
  const fileName = `payroll-${branchSlug}-${selectedMonth}-${periodFileName}.xlsx`
  workbook.creator = 'TAFI Admin'
  workbook.title = `${normalizedBranchName} payroll - ${payrollMonthLabel} ${weekLabel}`
  workbook.subject = `Weekly payroll for ${normalizedBranchName}, ${payrollMonthLabel}, ${weekLabel}`

  const formatDate = (dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }
  const coveredPeriod = `${selectedWeek.label} - Covered from ${formatDate(selectedStartDate)} - ${formatDate(selectedEndDate)}`
  const workbookBuffer = await workbook.xlsx.writeBuffer()
  const completeWorkbook = await restoreTemplateDrawings(
    templateBuffer,
    workbookBuffer,
    extraRows,
    1,
    coveredPeriod,
    branchDetails
  )
  downloadFile(fileName, new Blob([completeWorkbook], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }))
  return fileName
}
