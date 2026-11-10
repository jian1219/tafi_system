import { useEffect, useState } from 'react'
import {
  listBranchDailySummaryCDJ,
  updateBranchDailySummaryCDJReferences
} from '../../lib/supabase'

const accountTitleColumns = [
  'Accounts Receivable',
  'Advances to Employees',
  'Accounts Payable',
  'Accrued Expenses',
  'Lease Liability',
  'Franchise Payable',
  'VAT/WHHT PAYABLE',
  'Inventory - Tuna',
  'Inventory - Produce',
  'Inventory - Dry Goods',
  'Inventory - Dairy and Chilled Items',
  'Inventory - Packaging Materials',
  'Inventory - Beverages',
  'Inventory - Kitchen Supplies',
  'Inventory - Dining Supplies',
  'Admin Supplies',
  'Counter Supplies',
  'Cleaning Supplies',
  'Kitchen Equipment',
  'Dining Equipment',
  'Office Equipment',
  'Kitchen Furnitures & Fixtures',
  'Office Furnitures & Fixtures',
  'Wages - Service Crews',
  'Franchise Royalty Fees',
  'Advertising Expense',
  'Salaries Expense',
  'Employee Benefit Expense',
  'Travel and Accommodation Expense',
  'Performance Bonus Expense',
  'Human Resource Expense',
  'Professional Fees',
  'SSS Expense',
  'PhilHealth Expense',
  'Pag-Ibig Expense',
  'Rent Expense',
  'Insurance Expense',
  'Utilities Expense',
  'Communication Expenses',
  'Parking Attendant Fee',
  'Garbage Fee',
  'Transportation Expense',
  'Repairs and Maintenance',
  'Bank Charges',
  'Miscellaneous Expenses',
  'Taxes and Licenses',
  'Interest Expense',
  'Income Tax Expense'
]

const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const formatDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

const getManilaMonthKey = () => {
  const dateParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date())
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  return `${dateValues.year}-${dateValues.month}`
}

export default function BranchAdminExpenseDailySummary({ branchName = 'Branch', branchAdmin }) {
  const sessionToken = branchAdmin?.session_token
  const [summaries, setSummaries] = useState([])
  const [referenceDrafts, setReferenceDrafts] = useState({})
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingDate, setSavingDate] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(getManilaMonthKey)
  const [selectedSummaryDate, setSelectedSummaryDate] = useState('')
  const filteredSummaries = summaries.filter((summary) => summary.date.startsWith(selectedMonth))

  const setLoadedSummaries = (rows) => {
    setSummaries(rows)
    setReferenceDrafts(Object.fromEntries(rows.map((row) => [
      row.date,
      {
        checkRefNo: row.check_ref_no ?? '',
        disbursementVoucherNo: row.disbursement_voucher_no ?? ''
      }
    ])))
  }

  useEffect(() => {
    let isCurrent = true

    const loadSummaries = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const { data, error: loadError } = await listBranchDailySummaryCDJ(sessionToken)
      if (!isCurrent) return
      if (loadError) {
        setError(loadError.message)
        setStatus('error')
        return
      }

      setLoadedSummaries(data ?? [])
      setError('')
      setStatus('ready')
    }

    loadSummaries()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const handleReferenceChange = (summaryDate, field, value) => {
    setReferenceDrafts((current) => ({
      ...current,
      [summaryDate]: {
        ...current[summaryDate],
        [field]: value
      }
    }))
  }

  const handleSaveReferences = async (summary) => {
    const references = referenceDrafts[summary.date] ?? {
      checkRefNo: summary.check_ref_no ?? '',
      disbursementVoucherNo: summary.disbursement_voucher_no ?? ''
    }
    setSavingDate(summary.date)
    setError('')
    setMessage('')

    const { error: saveError } = await updateBranchDailySummaryCDJReferences(
      sessionToken,
      summary.date,
      references
    )
    if (saveError) {
      setError(saveError.message)
      setSavingDate('')
      return
    }

    const { data, error: loadError } = await listBranchDailySummaryCDJ(sessionToken)
    setSavingDate('')
    if (loadError) {
      setError(`References saved, but the daily summary could not refresh: ${loadError.message}`)
      setStatus('error')
      return
    }

    setLoadedSummaries(data ?? [])
    setStatus('ready')
    setMessage(`References saved for ${formatDate(summary.date)}.`)
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Daily Cash Disbursement Summary</h3>
          <p className="employee-info-description">
            Daily payment and account totals are summarized from the Cash Disbursement Journal.
            Only the reference and voucher numbers can be edited here.
          </p>
        </div>
      </header>

      {status === 'loading' && (
        <p className="cash-advance-message" role="status">Loading daily summary…</p>
      )}
      {error && <p className="cash-advance-message error" role="alert">{error}</p>}
      {message && <p className="cash-advance-message" role="status">{message}</p>}

      <div className="branch-cdj-journal-filters branch-daily-summary-filters">
        <label className="cash-advance-month-control">
          <span>Summary month</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
        </label>
      </div>

      <div
        className="cash-advance-table-wrap"
        role="region"
        aria-label="Daily Cash Disbursement Summary"
        tabIndex="0"
      >
        <table className="cash-advance-table branch-cdj-table branch-daily-summary-cdj-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Check / Ref No.</th>
              <th>Disbursement Voucher No.</th>
              <th>Cash</th>
              <th>Bank Transfer</th>
              <th>GCash</th>
              <th>CWT</th>
              <th>Total</th>
              {accountTitleColumns.map((title) => <th key={title}>{title}</th>)}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredSummaries.map((summary) => {
              const references = referenceDrafts[summary.date] ?? {
                checkRefNo: summary.check_ref_no ?? '',
                disbursementVoucherNo: summary.disbursement_voucher_no ?? ''
              }
              const hasReferenceChanges = references.checkRefNo !== (summary.check_ref_no ?? '')
                || references.disbursementVoucherNo !== (summary.disbursement_voucher_no ?? '')

              return (
                <tr
                  key={summary.date}
                  className={`branch-daily-summary-row${selectedSummaryDate === summary.date ? ' branch-daily-summary-row-selected' : ''}`}
                  aria-selected={selectedSummaryDate === summary.date}
                  tabIndex={0}
                  onClick={() => setSelectedSummaryDate((current) => (
                    current === summary.date ? '' : summary.date
                  ))}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget
                      && (event.key === 'Enter' || event.key === ' ')
                    ) {
                      event.preventDefault()
                      setSelectedSummaryDate((current) => (
                        current === summary.date ? '' : summary.date
                      ))
                    }
                  }}
                >
                  <td>{formatDate(summary.date)}</td>
                  <td>
                    <input
                      className="branch-daily-summary-ref-input"
                      type="text"
                      aria-label={`Check / Ref No. for ${formatDate(summary.date)}`}
                      value={references.checkRefNo}
                      onChange={(event) => handleReferenceChange(summary.date, 'checkRefNo', event.target.value)}
                      disabled={Boolean(savingDate)}
                    />
                  </td>
                  <td>
                    <input
                      className="branch-daily-summary-ref-input"
                      type="text"
                      aria-label={`Disbursement Voucher No. for ${formatDate(summary.date)}`}
                      value={references.disbursementVoucherNo}
                      onChange={(event) => handleReferenceChange(
                        summary.date,
                        'disbursementVoucherNo',
                        event.target.value
                      )}
                      disabled={Boolean(savingDate)}
                    />
                  </td>
                  <td>{formatCurrency(summary.cash)}</td>
                  <td>{formatCurrency(summary.bank_transfer)}</td>
                  <td>{formatCurrency(summary.gcash)}</td>
                  <td>{formatCurrency(summary.cwt)}</td>
                  <td><strong>{formatCurrency(summary.total)}</strong></td>
                  {accountTitleColumns.map((title) => (
                    <td key={title}>{formatCurrency(summary[title])}</td>
                  ))}
                  <td>
                    <button
                      className="branch-daily-summary-save-button"
                      type="button"
                      onClick={() => handleSaveReferences(summary)}
                      disabled={!hasReferenceChanges || Boolean(savingDate)}
                    >
                      {savingDate === summary.date ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {status === 'ready' && filteredSummaries.length === 0 && (
              <tr>
                <td className="employee-empty-state" colSpan={accountTitleColumns.length + 9}>
                  No daily summaries yet. Save a Cash Disbursement Journal entry to create a daily summary.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
