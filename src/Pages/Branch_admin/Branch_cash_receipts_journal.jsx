import { useEffect, useMemo, useState } from 'react'
import {
  createBranchCashReceiptsJournalEntry,
  listBranchCashReceiptsJournalEntries,
  listBranchSalesTargets,
  updateBranchCashReceiptsJournalEntry
} from '../../lib/supabase'

const branchCashReceiptsJournalApi = {
  createBranchCashReceiptsJournalEntry,
  listBranchSalesTargets,
  listBranchCashReceiptsJournalEntries,
  updateBranchCashReceiptsJournalEntry
}

const editableAmountFields = [
  { key: 'totalSales', label: 'Total sales' },
  { key: 'consigmentSales', label: 'Consignment sales' },
  { key: 'discount', label: 'Discount' },
  { key: 'returns', label: 'Returns' },
  { key: 'foodPanda', label: 'Foodpanda' },
  { key: 'gcash', label: 'GCash' },
  { key: 'creditableWithholdingTax', label: 'Creditable withholding tax' },
  { key: 'cashFloat', label: 'Cash float' },
  { key: 'expense', label: 'Expense' },
  { key: 'cashCount', label: 'Cash count' }
]

const entryFormSections = [
  {
    id: 'sales',
    title: 'Sales',
    fields: [
      { key: 'totalSales', label: 'Total sales', type: 'editable' },
      { key: 'consigmentSales', label: 'Consignment sales', type: 'editable' },
      { key: 'grossSales', label: 'Gross sales', type: 'calculated' },
      { key: 'discount', label: 'Discounts', type: 'editable' },
      { key: 'returns', label: 'Returns', type: 'editable' },
      { key: 'netSales', label: 'Net sales', type: 'calculated' }
    ]
  },
  {
    id: 'non-cash',
    title: 'Non Cash',
    fields: [
      { key: 'foodPanda', label: 'Foodpanda', type: 'editable' },
      { key: 'gcash', label: 'GCash', type: 'editable' },
      { key: 'totalNoncashSales', label: 'Total noncash sales', type: 'calculated' }
    ]
  },
  {
    id: '2307',
    title: '2307',
    fields: [
      { key: 'creditableWithholdingTax', label: 'Creditable withholding tax', type: 'editable' }
    ]
  },
  {
    id: 'cash-float',
    title: 'Cash Float',
    fields: [
      { key: 'cashFloat', label: 'Cash Float', type: 'editable' }
    ]
  },
  {
    id: 'expense',
    title: 'Expense',
    fields: [
      { key: 'expense', label: 'Expense', type: 'editable' }
    ]
  },
  {
    id: 'pos-vs-actual-cash',
    title: 'POS vs Actual Cash',
    fields: [
      { key: 'cashCount', label: 'Cash count', type: 'editable' },
      { key: 'difference', label: 'Difference', type: 'calculated' }
    ]
  }
]

const journalColumns = [
  { key: 'si_no', label: 'SI No.', isText: true },
  { key: 'date', label: 'Date', isText: true },
  { key: 'day', label: 'Day', isText: true },
  { key: 'total_sales', label: 'Total sales' },
  { key: 'consigment_sales', label: 'Consignment sales' },
  { key: 'gross_sales', label: 'Gross sales' },
  { key: 'discount', label: 'Discount' },
  { key: 'returns', label: 'Returns' },
  { key: 'net_sales', label: 'Net sales' },
  { key: 'food_panda', label: 'Foodpanda' },
  { key: 'gcash', label: 'GCash' },
  { key: 'total_noncash_sales', label: 'Total noncash sales' },
  { key: 'creditable_withholding_tax', label: 'Creditable withholding tax' },
  { key: 'net_cash_sales', label: 'Net cash sales' },
  { key: 'cash_float', label: 'Cash float' },
  { key: 'cash_available', label: 'Cash available' },
  { key: 'expense', label: 'Expense' },
  { key: 'net_cash_available', label: 'Net cash available' },
  { key: 'cash_count', label: 'Cash count' },
  { key: 'difference', label: 'Difference' }
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

const getWeekday = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
  weekday: 'long'
})

const formatDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

const createEmptyEntry = () => ({
  date: getManilaDateKey(),
  totalSales: '0.00',
  consigmentSales: '0.00',
  discount: '0.00',
  returns: '0.00',
  foodPanda: '0.00',
  gcash: '0.00',
  creditableWithholdingTax: '0.00',
  cashFloat: '0.00',
  expense: '0.00',
  cashCount: '0.00'
})

const createFormFromEntry = (entry) => ({
  date: entry.date,
  totalSales: Number(entry.total_sales).toFixed(2),
  consigmentSales: Number(entry.consigment_sales).toFixed(2),
  discount: Number(entry.discount).toFixed(2),
  returns: Number(entry.returns).toFixed(2),
  foodPanda: Number(entry.food_panda).toFixed(2),
  gcash: Number(entry.gcash).toFixed(2),
  creditableWithholdingTax: Number(entry.creditable_withholding_tax).toFixed(2),
  cashFloat: Number(entry.cash_float).toFixed(2),
  expense: Number(entry.expense).toFixed(2),
  cashCount: Number(entry.cash_count).toFixed(2)
})

const toCents = (value) => Math.round(Number(value) * 100)
const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})
const formatPercent = (ratio) => new Intl.NumberFormat('en-PH', {
  style: 'percent',
  maximumFractionDigits: 0
}).format(Number(ratio))

const calculateAmounts = (form) => {
  const totalSales = toCents(form.totalSales)
  const consigmentSales = toCents(form.consigmentSales)
  const grossSales = totalSales - consigmentSales
  const discount = toCents(form.discount)
  const returns = toCents(form.returns)
  const netSales = grossSales - discount - returns
  const foodPanda = toCents(form.foodPanda)
  const gcash = toCents(form.gcash)
  const totalNoncashSales = foodPanda + gcash
  const creditableWithholdingTax = toCents(form.creditableWithholdingTax)
  const netCashSales = netSales - totalNoncashSales - creditableWithholdingTax
  const cashFloat = toCents(form.cashFloat)
  const cashAvailable = netCashSales + cashFloat
  const expense = toCents(form.expense)
  const netCashAvailable = cashAvailable - expense
  const cashCount = toCents(form.cashCount)

  return {
    grossSales,
    netSales,
    totalNoncashSales,
    netCashSales,
    cashAvailable,
    netCashAvailable,
    difference: cashCount - netCashAvailable
  }
}

export default function BranchCashReceiptsJournal({
  branchName = 'Branch',
  branchAdmin,
  api = branchCashReceiptsJournalApi,
  canManageTargets = false,
  canManageEntries = true
}) {
  const sessionToken = branchAdmin?.session_token
  const [entries, setEntries] = useState([])
  const [targets, setTargets] = useState([])
  const [form, setForm] = useState(createEmptyEntry)
  const [dailyTarget, setDailyTarget] = useState(null)
  const [dailyTargetValue, setDailyTargetValue] = useState('')
  const [editingEntryId, setEditingEntryId] = useState('')
  const [activePageSection, setActivePageSection] = useState(
    canManageEntries ? 'entry' : 'journal'
  )
  const [activeSection, setActiveSection] = useState(entryFormSections[0].id)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const calculatedAmounts = useMemo(() => calculateAmounts(form), [form])
  const nextSiNo = useMemo(() => {
    const monthKey = form.date.slice(0, 7)
    const highestSiNo = entries.reduce((highest, entry) => {
      if (entry.date?.slice(0, 7) !== monthKey || !/^\d+$/.test(entry.si_no)) return highest
      const currentSiNo = BigInt(entry.si_no)
      return currentSiNo > highest ? currentSiNo : highest
    }, 0n)
    return String(highestSiNo + 1n)
  }, [entries, form.date])
  const editingEntry = entries.find((entry) => entry.id === editingEntryId)
  const selectedFormSection = entryFormSections.find((section) => section.id === activeSection)
    ?? entryFormSections[0]
  const visibleEntries = useMemo(() => entries.filter(
    (entry) => entry.date?.slice(0, 7) === selectedMonth
  ), [entries, selectedMonth])
  const visibleTargets = useMemo(() => targets.filter(
    (target) => target.date?.slice(0, 7) === selectedMonth
  ), [targets, selectedMonth])

  useEffect(() => {
    let isCurrent = true

    const loadEntries = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const [entriesResult, targetsResult, dailyTargetResult] = await Promise.all([
        api.listBranchCashReceiptsJournalEntries(sessionToken),
        api.listBranchSalesTargets(sessionToken),
        canManageTargets
          ? api.getBranchRecurringSalesTarget(sessionToken)
          : Promise.resolve({ data: null, error: null })
      ])
      if (!isCurrent) return
      if (entriesResult.error || targetsResult.error || dailyTargetResult.error) {
        setError(entriesResult.error?.message ?? targetsResult.error?.message ?? dailyTargetResult.error.message)
        setStatus('error')
        return
      }

      setEntries(entriesResult.data ?? [])
      setTargets(targetsResult.data ?? [])
      setDailyTarget(dailyTargetResult.data)
      setDailyTargetValue(
        dailyTargetResult.data ? Number(dailyTargetResult.data.target_sales).toFixed(2) : ''
      )
      setError('')
      setStatus('ready')
    }

    loadEntries()
    return () => {
      isCurrent = false
    }
  }, [api, canManageTargets, sessionToken])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const amounts = Object.fromEntries(
      editableAmountFields.map(({ key }) => [key, Number(form[key])])
    )
    if (Object.values(amounts).some((amount) => !Number.isFinite(amount) || amount < 0)) {
      setError('Enter valid amounts of zero or greater for each amount field.')
      return
    }
    if (Object.values(amounts).some((amount) =>
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    )) {
      setError('Amounts can have up to two decimal places.')
      return
    }

    setIsSaving(true)
    const saveResult = editingEntryId
      ? await api.updateBranchCashReceiptsJournalEntry(sessionToken, editingEntryId, amounts)
      : await api.createBranchCashReceiptsJournalEntry(sessionToken, amounts)
    const { data: savedSiNo, error: saveError } = saveResult
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    const [entriesResult, targetsResult] = await Promise.all([
      api.listBranchCashReceiptsJournalEntries(sessionToken),
      api.listBranchSalesTargets(sessionToken)
    ])
    setIsSaving(false)
    if (entriesResult.error || targetsResult.error) {
      const refreshError = entriesResult.error ?? targetsResult.error
      setError(`Entry ${editingEntryId ? 'updated' : 'saved'}, but the journal or targets could not refresh: ${refreshError.message}`)
      setStatus('error')
      return
    }

    setEntries(entriesResult.data ?? [])
    setTargets(targetsResult.data ?? [])
    setEditingEntryId('')
    setForm(createEmptyEntry())
    setStatus('ready')
    setMessage(`Cash receipts journal entry SI No. ${savedSiNo} ${editingEntryId ? 'updated' : 'saved'}.`)
  }

  const handleEdit = (entry) => {
    setEditingEntryId(entry.id)
    setActivePageSection('entry')
    setForm(createFormFromEntry(entry))
    setSelectedMonth(entry.date.slice(0, 7))
    setActiveSection('sales')
    setError('')
    setMessage(`Editing SI No. ${entry.si_no}.`)
  }

  const cancelEdit = () => {
    setEditingEntryId('')
    setForm(createEmptyEntry())
    setError('')
    setMessage('')
  }

  const handleDailyTargetSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const targetSales = Number(dailyTargetValue)
    if (!Number.isFinite(targetSales) || targetSales <= 0) {
      setError('Enter a daily target sales amount greater than zero.')
      return
    }
    if (Math.abs(targetSales * 100 - Math.round(targetSales * 100)) > 0.000001) {
      setError('Target sales can have up to two decimal places.')
      return
    }

    setIsSaving(true)
    const saveResult = await api.setBranchRecurringSalesTarget(sessionToken, targetSales)
    if (saveResult.error) {
      setError(saveResult.error.message)
      setIsSaving(false)
      return
    }

    const [targetsResult, dailyTargetResult] = await Promise.all([
      api.listBranchSalesTargets(sessionToken),
      api.getBranchRecurringSalesTarget(sessionToken)
    ])
    setIsSaving(false)
    if (targetsResult.error || dailyTargetResult.error) {
      const refreshError = targetsResult.error ?? dailyTargetResult.error
      setError(`Daily target saved, but target data could not refresh: ${refreshError.message}`)
      setStatus('error')
      return
    }

    setTargets(targetsResult.data ?? [])
    setDailyTarget(dailyTargetResult.data)
    setDailyTargetValue(
      dailyTargetResult.data ? Number(dailyTargetResult.data.target_sales).toFixed(2) : ''
    )
    setStatus('ready')
    setMessage(`Daily sales target ${dailyTarget ? 'updated' : 'saved'} for ${branchName}.`)
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Cash Receipts Journal</h3>
          <p className="employee-info-description">
            {canManageEntries
              ? 'Record daily sales, cash availability, and cash count for this branch.'
              : 'Review journal entries and sales targets for this branch.'}
          </p>
        </div>
      </header>

      <div
        className="accountant-inventory-tabs crj-page-tabs"
        role="tablist"
        aria-label="Cash Receipts Journal sections"
      >
        {canManageEntries && (
          <button
            type="button"
            id="cash-receipt-entry-tab"
            className={`accountant-inventory-tab${activePageSection === 'entry' ? ' active' : ''}`}
            role="tab"
            aria-selected={activePageSection === 'entry'}
            aria-controls="cash-receipt-entry-panel"
            onClick={() => setActivePageSection('entry')}
          >
            Cash Receipt entry
          </button>
        )}
        <button
          type="button"
          id="cash-receipts-journal-entries-tab"
          className={`accountant-inventory-tab${activePageSection === 'journal' ? ' active' : ''}`}
          role="tab"
          aria-selected={activePageSection === 'journal'}
          aria-controls="cash-receipts-journal-entries-panel"
          onClick={() => setActivePageSection('journal')}
        >
          Journal Entries
        </button>
        <button
          type="button"
          id="cash-receipts-targets-tab"
          className={`accountant-inventory-tab${activePageSection === 'targets' ? ' active' : ''}`}
          role="tab"
          aria-selected={activePageSection === 'targets'}
          aria-controls="cash-receipts-targets-panel"
          onClick={() => setActivePageSection('targets')}
        >
          Targets
        </button>
      </div>

      {status === 'loading' && (
        <p className="cash-advance-message" role="status">Loading Cash Receipts Journal…</p>
      )}
      {error && <p className="cash-advance-message error" role="alert">{error}</p>}
      {message && <p className="cash-advance-message" role="status">{message}</p>}

      {canManageEntries && (
        <div
          id="cash-receipt-entry-panel"
          className="accountant-inventory-panel"
          role="tabpanel"
          aria-labelledby="cash-receipt-entry-tab"
          hidden={activePageSection !== 'entry'}
        >
          <form className="branch-cdj-form crj-entry-form" onSubmit={handleSubmit}>
        <div className="crj-section-tabs" role="group" aria-label="Cash receipts entry sections">
          {entryFormSections.map((section) => (
            <button
              type="button"
              className="crj-section-tab"
              key={section.id}
              aria-pressed={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
            >
              {section.title}
            </button>
          ))}
        </div>
        <fieldset
          className="crj-form-section"
          key={selectedFormSection.id}
          aria-label={selectedFormSection.title}
        >
          <legend>{selectedFormSection.title}</legend>
          {selectedFormSection.id === 'sales' && (
            <div className="crj-sales-summary" aria-label="Receipt details">
              <div>
                <span>SI No.</span>
                <strong>{editingEntry?.si_no ?? nextSiNo}</strong>
              </div>
              <div>
                <span>Date</span>
                <strong>{formatDate(form.date)}</strong>
              </div>
              <div>
                <span>Day</span>
                <strong>{getWeekday(form.date)}</strong>
              </div>
            </div>
          )}
          <div className={`crj-form-section-grid${selectedFormSection.id === 'sales'
            ? ' crj-form-section-grid-sales'
            : ''}`}
          >
            {selectedFormSection.fields.map((field) => (
              field.type === 'calculated' ? (
                <div className="crj-calculated-field" key={field.key}>
                  <span>{field.label}</span>
                  <strong>{formatCurrency(calculatedAmounts[field.key] / 100)}</strong>
                </div>
              ) : (
                <label className="branch-cdj-field" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form[field.key]}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      [field.key]: event.target.value
                    }))}
                    required
                  />
                </label>
              )
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={isSaving || status !== 'ready'}>
          {isSaving ? 'Saving…' : editingEntryId ? 'Save Changes' : 'Save Entry'}
        </button>
        {editingEntryId && (
          <button
            type="button"
            className="crj-cancel-button"
            onClick={cancelEdit}
            disabled={isSaving}
          >
            Cancel
          </button>
        )}
          </form>
        </div>
      )}

      <div
        id="cash-receipts-journal-entries-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="cash-receipts-journal-entries-tab"
        hidden={activePageSection !== 'journal'}
      >
        <div className="cash-advance-history-heading">
          <div>
            <h4>Journal entries</h4>
            <p>{visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} shown</p>
          </div>
          <label className="cash-advance-month-control">
            <span>Journal month</span>
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
          aria-label="Cash Receipts Journal entries"
          tabIndex="0"
        >
          <table className="cash-advance-table branch-cdj-table branch-crj-table">
            <thead>
              <tr>
                {journalColumns.map(({ key, label }) => <th key={key}>{label}</th>)}
                {canManageEntries && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => (
                <tr key={entry.id}>
                  {journalColumns.map(({ key, isText }) => (
                    <td key={key}>
                      {isText ? entry[key] : formatCurrency(entry[key])}
                    </td>
                  ))}
                  {canManageEntries && (
                    <td>
                      <button
                        type="button"
                        className="crj-edit-button"
                        onClick={() => handleEdit(entry)}
                        disabled={isSaving}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {status === 'ready' && visibleEntries.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan={journalColumns.length + Number(canManageEntries)}>
                    No cash receipts entries for the selected month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        id="cash-receipts-targets-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="cash-receipts-targets-tab"
        hidden={activePageSection !== 'targets'}
      >
        {canManageTargets && (
          <form className="crj-target-form" onSubmit={handleDailyTargetSubmit}>
            <label className="branch-cdj-field">
              <span>Daily target sales</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={dailyTargetValue}
                onChange={(event) => setDailyTargetValue(event.target.value)}
                required
              />
            </label>
            <p className="crj-target-note">
              This target applies from today onward and is added to each day&apos;s targets when a Cash Receipts Journal entry is saved.
              {dailyTarget?.effective_from && ` Current target effective since ${formatDate(dailyTarget.effective_from)}.`}
            </p>
            <div className="crj-target-actions">
              <button type="submit" disabled={isSaving || status !== 'ready'}>
                {isSaving ? 'Saving…' : 'Save Daily Target'}
              </button>
            </div>
          </form>
        )}

        <div className="cash-advance-history-heading">
          <div>
            <h4>Sales targets</h4>
            <p>{visibleTargets.length} {visibleTargets.length === 1 ? 'target' : 'targets'} shown</p>
          </div>
          <label className="cash-advance-month-control">
            <span>Target month</span>
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
          aria-label="Sales targets"
          tabIndex="0"
        >
          <table className="cash-advance-table crj-target-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Target sales</th>
                <th scope="col">Total gross sales</th>
                <th scope="col">Target vs achieved</th>
                <th scope="col">Target vs achievement rate</th>
                <th scope="col">Sales variance percentage</th>
              </tr>
            </thead>
            <tbody>
              {visibleTargets.map((target) => (
                <tr key={target.id}>
                  <td>{formatDate(target.date)}</td>
                  <td>{formatCurrency(target.target_sales)}</td>
                  <td>
                    {target.total_gross_sales === null
                      ? 'Waiting for journal entry'
                      : formatCurrency(target.total_gross_sales)}
                  </td>
                  <td>
                    {target.target_vs_achieved === null
                      ? 'Waiting for journal entry'
                      : formatCurrency(target.target_vs_achieved)}
                  </td>
                  <td>
                    {target.target_vs_achievement_rate === null
                      ? 'Waiting for journal entry'
                      : formatPercent(target.target_vs_achievement_rate)}
                  </td>
                  <td>
                    {target.sales_variance_percentage === null
                      ? 'Waiting for journal entry'
                      : formatPercent(target.sales_variance_percentage)}
                  </td>
                </tr>
              ))}
              {status === 'ready' && visibleTargets.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan="6">
                    No sales targets for the selected month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
