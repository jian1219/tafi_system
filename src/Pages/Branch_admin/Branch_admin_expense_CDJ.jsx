import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createBranchCDJEntry, listBranchCDJEntries } from '../../lib/supabase'
import BranchAdminExpenseDailySummary from './Branch_admin_expense_daily_summary'

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

const amountFields = [
  { name: 'cash', label: 'Cash' },
  { name: 'bankTransfer', label: 'Bank Transfer' },
  { name: 'gcash', label: 'GCash' },
  { name: 'cwt', label: 'CWT' }
]

const createEmptyEntry = () => ({
  date: getManilaDateKey(),
  refNo: '',
  disbursementVoucherNo: '',
  description: '',
  accountTitle: '',
  payeeSupplier: '',
  tin: '',
  cash: '0.00',
  bankTransfer: '0.00',
  gcash: '0.00',
  cwt: '0.00'
})

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

export default function BranchAdminExpenseCDJ({ branchName = 'Branch', branchAdmin }) {
  const sessionToken = branchAdmin?.session_token
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(createEmptyEntry)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const [selectedAccountTitle, setSelectedAccountTitle] = useState('')
  const [activeSection, setActiveSection] = useState('journal')
  const total = amountFields.reduce((sum, { name }) => sum + (Number(form[name]) || 0), 0)
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
      .map(([date, dateEntries]) => ({
        date,
        entries: dateEntries,
        totals: dateEntries.reduce((totals, entry) => ({
          cash: totals.cash + getAmountInCents(entry.cash),
          bankTransfer: totals.bankTransfer + getAmountInCents(entry.bank_transfer),
          gcash: totals.gcash + getAmountInCents(entry.gcash),
          cwt: totals.cwt + getAmountInCents(entry.cwt)
        }), {
          cash: 0,
          bankTransfer: 0,
          gcash: 0,
          cwt: 0
        })
      }))
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

  useEffect(() => {
    let isCurrent = true

    const loadEntries = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const { data, error: loadError } = await listBranchCDJEntries(sessionToken)
      if (!isCurrent) return
      if (loadError) {
        setError(loadError.message)
        setStatus('error')
        return
      }

      setEntries(data ?? [])
      setError('')
      setStatus('ready')
    }

    loadEntries()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const amounts = Object.fromEntries(
      amountFields.map(({ name }) => [name, Number(form[name])])
    )
    if (!form.date) {
      setError('Select a date for the Cash Disbursement Journal entry.')
      return
    }
    if (Object.values(amounts).some((amount) => !Number.isFinite(amount) || amount < 0)) {
      setError('Enter valid amounts of zero or greater for each payment method.')
      return
    }
    if (Object.values(amounts).some((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)) {
      setError('Amounts can have up to two decimal places.')
      return
    }
    if (Object.values(amounts).every((amount) => amount === 0)) {
      setError('Enter an amount greater than zero.')
      return
    }

    setIsSaving(true)
    const { error: saveError } = await createBranchCDJEntry(sessionToken, {
      ...form,
      ...amounts
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    setSelectedMonth(form.date.slice(0, 7))
    setForm(createEmptyEntry())
    setIsFormOpen(false)
    const { data, error: loadError } = await listBranchCDJEntries(sessionToken)
    setIsSaving(false)
    if (loadError) {
      setError(`Entry saved, but the journal could not refresh: ${loadError.message}`)
      setStatus('error')
      return
    }

    setEntries(data ?? [])
    setStatus('ready')
    setMessage('Cash disbursement entry saved.')
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Cash Disbursement Journal</h3>
          <p className="employee-info-description">
            Record branch disbursements and review saved entries.
          </p>
        </div>
        <button
          type="button"
          className="branch-cdj-add-entry"
          disabled={isSaving}
          aria-expanded={isFormOpen}
          aria-controls="branch-cdj-entry-form"
          onClick={() => {
            setIsFormOpen((isOpen) => !isOpen)
            setError('')
            setMessage('')
            if (isFormOpen) setForm(createEmptyEntry())
          }}
        >
          {isFormOpen
            ? <X size={17} aria-hidden="true" />
            : <Plus size={17} aria-hidden="true" />}
          {isFormOpen ? 'Close form' : 'Add CDJ Entry'}
        </button>
      </header>

      <form
        id="branch-cdj-entry-form"
        className="branch-cdj-form"
        hidden={!isFormOpen}
        onSubmit={handleSubmit}
      >
        <label className="branch-cdj-field">
          <span>Date</span>
          <input
            type="date"
            value={form.date}
            onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>Check / Ref No.</span>
          <input
            type="text"
            value={form.refNo}
            onChange={(event) => setForm((current) => ({ ...current, refNo: event.target.value }))}
          />
        </label>
        <label className="branch-cdj-field">
          <span>Disbursement Voucher No.</span>
          <input
            type="text"
            value={form.disbursementVoucherNo}
            onChange={(event) => setForm((current) => ({
              ...current,
              disbursementVoucherNo: event.target.value
            }))}
          />
        </label>
        <label className="branch-cdj-field">
          <span>Description</span>
          <input
            type="text"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>Account Title</span>
          <select
            value={form.accountTitle}
            onChange={(event) => setForm((current) => ({ ...current, accountTitle: event.target.value }))}
            required
          >
            <option value="">Select an account title</option>
            {accountTitles.map((accountTitle) => (
              <option key={accountTitle} value={accountTitle}>{accountTitle}</option>
            ))}
          </select>
        </label>
        <label className="branch-cdj-field">
          <span>Payee / Supplier</span>
          <input
            type="text"
            value={form.payeeSupplier}
            onChange={(event) => setForm((current) => ({ ...current, payeeSupplier: event.target.value }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>TIN</span>
          <input
            type="text"
            value={form.tin}
            onChange={(event) => setForm((current) => ({ ...current, tin: event.target.value }))}
          />
        </label>
        {amountFields.map(({ name, label }) => (
          <label className="branch-cdj-field" key={name}>
            <span>{label}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form[name]}
              onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
            />
          </label>
        ))}
        <div className="branch-cdj-total" aria-live="polite">
          <span>Total</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
        <button type="submit" disabled={isSaving || status !== 'ready'}>
          {isSaving ? 'Saving…' : 'Save Entry'}
        </button>
      </form>

      {status === 'loading' && (
        <p className="cash-advance-message" role="status">Loading Cash Disbursement Journal…</p>
      )}
      {error && <p className="cash-advance-message error" role="alert">{error}</p>}
      {message && <p className="cash-advance-message" role="status">{message}</p>}

      <div className="branch-cdj-section-tabs" role="tablist" aria-label="Cash Disbursement Journal sections">
        <button
          id="branch-cdj-journal-tab"
          className={`branch-cdj-section-tab${activeSection === 'journal' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeSection === 'journal'}
          aria-controls="branch-cdj-journal-panel"
          onClick={() => setActiveSection('journal')}
        >
          Journal entries
        </button>
        <button
          id="branch-cdj-summary-tab"
          className={`branch-cdj-section-tab${activeSection === 'summary' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeSection === 'summary'}
          aria-controls="branch-cdj-summary-panel"
          onClick={() => setActiveSection('summary')}
        >
          Daily Summary
        </button>
      </div>

      <section
        id="branch-cdj-journal-panel"
        role="tabpanel"
        aria-labelledby="branch-cdj-journal-tab"
        hidden={activeSection !== 'journal'}
      >
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
        <div className="cash-advance-table-wrap" role="region" aria-label="Cash Disbursement Journal entries" tabIndex="0">
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
              {groupedEntries.map((group) => (
                <Fragment key={group.date}>
                  {group.entries.map((entry, index) => (
                    <tr key={entry.id}>
                      {index === 0 && (
                        <td className="branch-cdj-date-cell" rowSpan={group.entries.length + 1}>
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
                  ))}
                  <tr className="branch-cdj-date-total" key={`${group.date}-total`}>
                    <td colSpan={6}>{formatDate(group.date)} total</td>
                    <td>{formatCurrency(group.totals.cash / 100)}</td>
                    <td>{formatCurrency(group.totals.bankTransfer / 100)}</td>
                    <td>{formatCurrency(group.totals.gcash / 100)}</td>
                    <td>{formatCurrency(group.totals.cwt / 100)}</td>
                    <td>
                      <strong>
                        {formatCurrency(
                          (group.totals.cash + group.totals.bankTransfer
                            + group.totals.gcash + group.totals.cwt) / 100
                        )}
                      </strong>
                    </td>
                  </tr>
                </Fragment>
              ))}
              {status === 'ready' && filteredEntries.length === 0 && (
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
      <section
        id="branch-cdj-summary-panel"
        role="tabpanel"
        aria-labelledby="branch-cdj-summary-tab"
        hidden={activeSection !== 'summary'}
      >
        {activeSection === 'summary' && (
          <BranchAdminExpenseDailySummary branchName={branchName} branchAdmin={branchAdmin} />
        )}
      </section>
    </section>
  )
}