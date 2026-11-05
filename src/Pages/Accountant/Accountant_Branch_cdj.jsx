import { useEffect, useMemo, useState } from 'react'
import {
  listAccountantBranchDailySummaryCDJ,
  listAccountantBranchCDJEntries,
  listAccountantInventoryBranches
} from '../../lib/supabase'

const accountTitles = [
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

const getManilaDateKey = () => {
  const dateParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  return `${dateValues.year}-${dateValues.month}-${dateValues.day}`
}

const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const getAmountInCents = (amount) => Math.round(Number(amount) * 100)

const formatDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

export default function AccountantBranchCDJ({
  sessionToken,
  listBranches = listAccountantInventoryBranches,
  listEntries = listAccountantBranchCDJEntries,
  listDailySummaries = listAccountantBranchDailySummaryCDJ,
  sessionRoleLabel = 'Accountant'
}) {
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [entries, setEntries] = useState([])
  const [dailySummaries, setDailySummaries] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const [selectedAccountTitle, setSelectedAccountTitle] = useState('')
  const [selectedSummaryDate, setSelectedSummaryDate] = useState('')
  const [activeSection, setActiveSection] = useState('journal')
  const [isLoadingBranches, setIsLoadingBranches] = useState(true)
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [isLoadingDailySummaries, setIsLoadingDailySummaries] = useState(false)
  const [branchError, setBranchError] = useState('')
  const [entriesError, setEntriesError] = useState('')
  const [dailySummaryError, setDailySummaryError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadBranches = async () => {
      if (!sessionToken) {
        setBranchError(`${sessionRoleLabel} session is unavailable. Please sign in again.`)
        setIsLoadingBranches(false)
        return
      }

      const { data, error } = await listBranches(sessionToken)
      if (!isCurrent) return
      setIsLoadingBranches(false)
      if (error) {
        setBranchError(error.message)
        return
      }

      const branchList = data ?? []
      setBranches(branchList)
      setSelectedBranchId((current) => (
        branchList.some((branch) => branch.branch_id === current)
          ? current
          : branchList[0]?.branch_id ?? ''
      ))
      setBranchError('')
    }

    loadBranches()
    return () => {
      isCurrent = false
    }
  }, [listBranches, sessionRoleLabel, sessionToken])

  useEffect(() => {
    if (!sessionToken || !selectedBranchId) return undefined

    let isCurrent = true
    const loadEntries = async () => {
      setIsLoadingEntries(true)
      setIsLoadingDailySummaries(true)
      setEntriesError('')
      setDailySummaryError('')
      const [entriesResult, summaryResult] = await Promise.all([
        listEntries(sessionToken, selectedBranchId),
        listDailySummaries(sessionToken, selectedBranchId)
      ])
      if (!isCurrent) return
      setIsLoadingEntries(false)
      setIsLoadingDailySummaries(false)
      if (entriesResult.error) {
        setEntries([])
        setEntriesError(entriesResult.error.message)
      } else {
        setEntries(entriesResult.data ?? [])
      }
      if (summaryResult.error) {
        setDailySummaries([])
        setDailySummaryError(summaryResult.error.message)
      } else {
        setDailySummaries(summaryResult.data ?? [])
      }
    }

    loadEntries()
    return () => {
      isCurrent = false
    }
  }, [listDailySummaries, listEntries, selectedBranchId, sessionToken])

  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(selectedMonth)),
    [entries, selectedMonth]
  )
  const filteredEntries = useMemo(
    () => selectedAccountTitle
      ? monthEntries.filter((entry) => entry.account_titles === selectedAccountTitle)
      : monthEntries,
    [monthEntries, selectedAccountTitle]
  )
  const groupedEntries = useMemo(() => {
    const groups = new Map()
    filteredEntries.forEach((entry) => {
      if (!groups.has(entry.date)) groups.set(entry.date, [])
      groups.get(entry.date).push(entry)
    })
    return [...groups.entries()]
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, dateEntries]) => ({ date, entries: dateEntries }))
  }, [filteredEntries])
  const grandTotals = useMemo(() => filteredEntries.reduce((totals, entry) => ({
    cash: totals.cash + getAmountInCents(entry.cash),
    bankTransfer: totals.bankTransfer + getAmountInCents(entry.bank_transfer),
    gcash: totals.gcash + getAmountInCents(entry.gcash),
    cwt: totals.cwt + getAmountInCents(entry.cwt)
  }), {
    cash: 0,
    bankTransfer: 0,
    gcash: 0,
    cwt: 0
  }), [filteredEntries])

  const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)

  const handleBranchChange = (event) => {
    setEntries([])
    setDailySummaries([])
    setEntriesError('')
    setDailySummaryError('')
    setSelectedSummaryDate('')
    setSelectedBranchId(event.target.value)
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{selectedBranch?.branch_name || sessionRoleLabel}</p>
          <h3>Cash Disbursement Journal</h3>
          <p className="employee-info-description">
            Review the selected branch’s disbursement entries.
          </p>
        </div>
        <label className="cash-advance-month-control tafi-cash-advance-branch-select">
          <span>Branch</span>
          <select
            value={selectedBranchId}
            onChange={handleBranchChange}
            disabled={isLoadingBranches || branches.length === 0}
          >
            {isLoadingBranches && <option value="">Loading branches…</option>}
            {!isLoadingBranches && branches.length === 0 && <option value="">No branches available</option>}
            {branches.map((branch) => (
              <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
            ))}
          </select>
        </label>
      </header>

      {branchError && <p className="cash-advance-message error" role="alert">{branchError}</p>}
      {isLoadingBranches && <p className="cash-advance-message" role="status">Loading branches…</p>}
      {activeSection === 'journal' && entriesError && <p className="cash-advance-message error" role="alert">{entriesError}</p>}
      {activeSection === 'journal' && isLoadingEntries && <p className="cash-advance-message" role="status">Loading journal entries…</p>}
      {activeSection === 'daily-summary' && dailySummaryError && <p className="cash-advance-message error" role="alert">{dailySummaryError}</p>}
      {activeSection === 'daily-summary' && isLoadingDailySummaries && <p className="cash-advance-message" role="status">Loading daily summary…</p>}

      {selectedBranch && !branchError && (
        <>
          <div className="accountant-inventory-tabs" role="tablist" aria-label="Cash Disbursement sections">
            <button
              type="button"
              id="accountant-cdj-journal-tab"
              className={`accountant-inventory-tab${activeSection === 'journal' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeSection === 'journal'}
              aria-controls="accountant-cdj-journal-panel"
              onClick={() => setActiveSection('journal')}
            >
              Journal Entries
            </button>
            <button
              type="button"
              id="accountant-cdj-summary-tab"
              className={`accountant-inventory-tab${activeSection === 'daily-summary' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeSection === 'daily-summary'}
              aria-controls="accountant-cdj-summary-panel"
              onClick={() => setActiveSection('daily-summary')}
            >
              Daily Summary
            </button>
            <button
              type="button"
              id="accountant-cdj-monthly-summary-tab"
              className={`accountant-inventory-tab${activeSection === 'monthly-summary' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeSection === 'monthly-summary'}
              aria-controls="accountant-cdj-monthly-summary-panel"
              onClick={() => setActiveSection('monthly-summary')}
            >
              Monthly Summary
            </button>
          </div>

          {activeSection === 'journal' && (
            <section id="accountant-cdj-journal-panel" role="tabpanel" aria-labelledby="accountant-cdj-journal-tab">
          <div className="cash-advance-history-heading">
            <div>
              <h4>Journal entries</h4>
              <p>{filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} shown</p>
            </div>
            <div className="branch-cdj-journal-filters">
              <label className="cash-advance-month-control">
                <span>Account title</span>
                <select
                  value={selectedAccountTitle}
                  onChange={(event) => setSelectedAccountTitle(event.target.value)}
                >
                  <option value="">All account titles</option>
                  {accountTitles.map((accountTitle) => (
                    <option key={accountTitle} value={accountTitle}>{accountTitle}</option>
                  ))}
                </select>
              </label>
              <label className="cash-advance-month-control">
                <span>Journal month</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div
            className="cash-advance-table-wrap"
            role="region"
            aria-label={`${selectedBranch.branch_name} Cash Disbursement Journal entries`}
            tabIndex="0"
          >
            <table className="cash-advance-table branch-cdj-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check / Ref No.</th>
                  <th>Disbursement Voucher No.</th>
                  <th>Description</th>
                  <th>Account Title</th>
                  <th>Payee / Supplier</th>
                  <th>TIN</th>
                  <th>Cash</th>
                  <th>Bank Transfer</th>
                  <th>GCash</th>
                  <th>CWT</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {groupedEntries.map((group) => group.entries.map((entry, index) => (
                  <tr key={entry.id}>
                    {index === 0 && (
                      <td className="branch-cdj-date-cell" rowSpan={group.entries.length}>
                        {formatDate(group.date)}
                      </td>
                    )}
                    <td>{entry.ref_no || '—'}</td>
                    <td>{entry.disbursement_voucher_no || '—'}</td>
                    <td>{entry.description}</td>
                    <td>{entry.account_titles}</td>
                    <td>{entry.payee_supplier}</td>
                    <td>{entry.tin || '—'}</td>
                    <td>{formatCurrency(entry.cash)}</td>
                    <td>{formatCurrency(entry.bank_transfer)}</td>
                    <td>{formatCurrency(entry.gcash)}</td>
                    <td>{formatCurrency(entry.cwt)}</td>
                    <td><strong>{formatCurrency(entry.total)}</strong></td>
                  </tr>
                )))}
                {!isLoadingEntries && !entriesError && filteredEntries.length === 0 && (
                  <tr>
                    <td className="employee-empty-state" colSpan={12}>
                      {selectedAccountTitle
                        ? `No ${selectedAccountTitle} entries for the selected month.`
                        : 'No cash disbursement entries for the selected month.'}
                    </td>
                  </tr>
                )}
                {filteredEntries.length > 0 && (
                  <tr className="branch-cdj-grand-total">
                    <td colSpan={7}>Total</td>
                    <td>{formatCurrency(grandTotals.cash / 100)}</td>
                    <td>{formatCurrency(grandTotals.bankTransfer / 100)}</td>
                    <td>{formatCurrency(grandTotals.gcash / 100)}</td>
                    <td>{formatCurrency(grandTotals.cwt / 100)}</td>
                    <td>
                      <strong>
                        {formatCurrency(
                          (grandTotals.cash + grandTotals.bankTransfer + grandTotals.gcash + grandTotals.cwt) / 100
                        )}
                      </strong>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            </section>
          )}

          {activeSection === 'daily-summary' && (
            <section id="accountant-cdj-summary-panel" role="tabpanel" aria-labelledby="accountant-cdj-summary-tab">
          <div className="cash-advance-history-heading">
            <div>
              <h4>Daily Summary</h4>
              <p>{dailySummaries.length} {dailySummaries.length === 1 ? 'day' : 'days'} summarized</p>
            </div>
          </div>
          <div
            className="cash-advance-table-wrap"
            role="region"
            aria-label={`${selectedBranch.branch_name} Daily Cash Disbursement Summary`}
            tabIndex="0"
          >
            <table className="cash-advance-table branch-cdj-table branch-daily-summary-cdj-table accountant-daily-summary-cdj-table">
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
                  {accountTitles.map((title) => <th key={title}>{title}</th>)}
                </tr>
              </thead>
              <tbody>
                {dailySummaries.map((summary) => (
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
                    <td className="branch-cdj-date-cell">{formatDate(summary.date)}</td>
                    <td>{summary.check_ref_no || '—'}</td>
                    <td>{summary.disbursement_voucher_no || '—'}</td>
                    <td>{formatCurrency(summary.cash)}</td>
                    <td>{formatCurrency(summary.bank_transfer)}</td>
                    <td>{formatCurrency(summary.gcash)}</td>
                    <td>{formatCurrency(summary.cwt)}</td>
                    <td><strong>{formatCurrency(summary.total)}</strong></td>
                    {accountTitles.map((title) => (
                      <td key={title}>{formatCurrency(summary[title])}</td>
                    ))}
                  </tr>
                ))}
                {!isLoadingDailySummaries && !dailySummaryError && dailySummaries.length === 0 && (
                  <tr>
                    <td className="employee-empty-state" colSpan={accountTitles.length + 8}>
                      No daily summaries are available for this branch.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            </section>
          )}

          {activeSection === 'monthly-summary' && (
            <section
              id="accountant-cdj-monthly-summary-panel"
              role="tabpanel"
              aria-labelledby="accountant-cdj-monthly-summary-tab"
            />
          )}
        </>
      )}
    </section>
  )
}
