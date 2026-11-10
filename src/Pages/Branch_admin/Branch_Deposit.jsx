import { useEffect, useMemo, useState } from 'react'
import {
  createBranchDeposit,
  listBranchCashReceiptsJournalEntries,
  listBranchDeposits,
  updateBranchDeposit
} from '../../lib/supabase'

const branchDepositApi = {
  createBranchDeposit,
  listBranchCashReceiptsJournalEntries,
  listBranchDeposits,
  updateBranchDeposit
}

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

const formatDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const toCents = (amount) => Math.round(Number(amount) * 100)

const createEmptyDeposit = () => ({
  dateDeposit: getManilaDateKey(),
  depositAm: '0.00',
  depositPm: '0.00'
})

const loadDepositData = async (sessionToken, api) => {
  const [depositResult, receiptResult] = await Promise.all([
    api.listBranchDeposits(sessionToken),
    api.listBranchCashReceiptsJournalEntries(sessionToken)
  ])
  return {
    deposits: depositResult.data ?? [],
    receiptEntries: receiptResult.data ?? [],
    error: depositResult.error ?? receiptResult.error
  }
}

export default function BranchDeposit({
  branchName = 'Branch',
  branchAdmin,
  api = branchDepositApi
}) {
  const sessionToken = branchAdmin?.session_token
  const [deposits, setDeposits] = useState([])
  const [receiptEntries, setReceiptEntries] = useState([])
  const [form, setForm] = useState(createEmptyDeposit)
  const [editingDepositId, setEditingDepositId] = useState('')
  const [activeSection, setActiveSection] = useState('entry')
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const matchingReceipt = receiptEntries.find((entry) => entry.date === form.dateDeposit)
  const totalDepositCents = toCents(form.depositAm) + toCents(form.depositPm)
  const depositVsCashSalesCents = matchingReceipt
    ? Math.max(toCents(matchingReceipt.net_cash_available), toCents(matchingReceipt.cash_count))
      - totalDepositCents
    : null
  const visibleDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.date_deposit?.slice(0, 7) === selectedMonth),
    [deposits, selectedMonth]
  )

  useEffect(() => {
    let isCurrent = true

    const load = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const result = await loadDepositData(sessionToken, api)
      if (!isCurrent) return
      if (result.error) {
        setError(result.error.message)
        setStatus('error')
        return
      }

      setDeposits(result.deposits)
      setReceiptEntries(result.receiptEntries)
      setError('')
      setStatus('ready')
    }

    load()
    return () => {
      isCurrent = false
    }
  }, [api, sessionToken])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!form.dateDeposit) {
      setError('Select a deposit date.')
      return
    }
    const amounts = {
      depositAm: Number(form.depositAm),
      depositPm: Number(form.depositPm)
    }
    if (Object.values(amounts).some((amount) => !Number.isFinite(amount) || amount < 0)) {
      setError('Enter valid deposit amounts of zero or greater.')
      return
    }
    if (Object.values(amounts).some((amount) =>
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    )) {
      setError('Deposit amounts can have up to two decimal places.')
      return
    }
    if (!matchingReceipt) {
      setError('Add a Cash Receipts Journal entry for this branch and date before recording the deposit.')
      return
    }
    if (deposits.some((deposit) =>
      deposit.date_deposit === form.dateDeposit && deposit.id !== editingDepositId
    )) {
      setError('A deposit is already recorded for this date.')
      return
    }

    setIsSaving(true)
    const depositInput = { ...amounts, dateDeposit: form.dateDeposit }
    const saveResult = editingDepositId
      ? await api.updateBranchDeposit(sessionToken, editingDepositId, depositInput)
      : await api.createBranchDeposit(sessionToken, depositInput)
    if (saveResult.error) {
      setError(saveResult.error.message)
      setIsSaving(false)
      return
    }

    const result = await loadDepositData(sessionToken, api)
    setIsSaving(false)
    if (result.error) {
      setError(`Deposit ${editingDepositId ? 'updated' : 'saved'}, but the list could not refresh: ${result.error.message}`)
      setStatus('error')
      return
    }

    setDeposits(result.deposits)
    setReceiptEntries(result.receiptEntries)
    setStatus('ready')
    setEditingDepositId('')
    setForm(createEmptyDeposit())
    setMessage(`Deposit for ${formatDate(form.dateDeposit)} ${editingDepositId ? 'updated' : 'saved'}.`)
  }

  const handleEdit = (deposit) => {
    setEditingDepositId(deposit.id)
    setForm({
      dateDeposit: deposit.date_deposit,
      depositAm: Number(deposit.deposit_am).toFixed(2),
      depositPm: Number(deposit.deposit_pm).toFixed(2)
    })
    setSelectedMonth(deposit.date_deposit.slice(0, 7))
    setActiveSection('entry')
    setError('')
    setMessage(`Editing deposit for ${formatDate(deposit.date_deposit)}.`)
  }

  const cancelEdit = () => {
    setEditingDepositId('')
    setForm(createEmptyDeposit())
    setError('')
    setMessage('')
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Deposit</h3>
          <p className="employee-info-description">
            Record AM and PM deposits and compare them with the day&apos;s cash receipts.
          </p>
        </div>
      </header>

      <div className="accountant-inventory-tabs crj-page-tabs" role="tablist" aria-label="Deposit sections">
        <button
          type="button"
          id="deposit-entry-tab"
          className={`accountant-inventory-tab${activeSection === 'entry' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeSection === 'entry'}
          aria-controls="deposit-entry-panel"
          onClick={() => setActiveSection('entry')}
        >
          Deposit Entry
        </button>
        <button
          type="button"
          id="deposit-records-tab"
          className={`accountant-inventory-tab${activeSection === 'records' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeSection === 'records'}
          aria-controls="deposit-records-panel"
          onClick={() => setActiveSection('records')}
        >
          Deposit Records
        </button>
      </div>

      {status === 'loading' && (
        <p className="accountant-inventory-empty" role="status">Loading deposits…</p>
      )}
      {error && <p className="accountant-inventory-error" role="alert">{error}</p>}
      {message && <p className="accountant-inventory-notice" role="status">{message}</p>}

      <div
        id="deposit-entry-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="deposit-entry-tab"
        hidden={activeSection !== 'entry'}
      >
        <form className="deposit-entry-form" onSubmit={handleSubmit}>
          <label>
            <span>Deposit date</span>
            <input
              type="date"
              value={form.dateDeposit}
              onChange={(event) => setForm((current) => ({
                ...current,
                dateDeposit: event.target.value
              }))}
              required
            />
          </label>
          <label>
            <span>AM deposit</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.depositAm}
              onChange={(event) => setForm((current) => ({
                ...current,
                depositAm: event.target.value
              }))}
              required
            />
          </label>
          <label>
            <span>PM deposit</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.depositPm}
              onChange={(event) => setForm((current) => ({
                ...current,
                depositPm: event.target.value
              }))}
              required
            />
          </label>
          <div className="deposit-calculated-field">
            <span>Total deposit</span>
            <strong>{formatCurrency(totalDepositCents / 100)}</strong>
          </div>
          <div className="deposit-calculated-field">
            <span>Deposit vs cash sales</span>
            <strong>
              {depositVsCashSalesCents === null
                ? 'No matching cash journal'
                : formatCurrency(depositVsCashSalesCents / 100)}
            </strong>
          </div>
          <p className="deposit-form-note">
            Difference = greater of Net cash available and Cash count, minus total deposit.
          </p>
          {!matchingReceipt && (
            <p className="accountant-inventory-error deposit-form-note" role="alert">
              No Cash Receipts Journal entry exists for this date.
            </p>
          )}
          <div className="deposit-form-actions">
            <button type="submit" disabled={isSaving || status !== 'ready' || !matchingReceipt}>
              {isSaving ? 'Saving…' : editingDepositId ? 'Save Changes' : 'Save Deposit'}
            </button>
            {editingDepositId && (
              <button type="button" className="deposit-cancel-button" onClick={cancelEdit} disabled={isSaving}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div
        id="deposit-records-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="deposit-records-tab"
        hidden={activeSection !== 'records'}
      >
        <div className="cash-advance-history-heading">
          <div>
            <h4>Deposit records</h4>
            <p>{visibleDeposits.length} {visibleDeposits.length === 1 ? 'record' : 'records'} shown</p>
          </div>
          <label className="cash-advance-month-control">
            <span>Deposit month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>
        </div>
        <div className="cash-advance-table-wrap" role="region" aria-label="Deposit records" tabIndex="0">
          <table className="cash-advance-table branch-deposit-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">AM deposit</th>
                <th scope="col">PM deposit</th>
                <th scope="col">Total deposit</th>
                <th scope="col">Deposit vs cash sales</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleDeposits.map((deposit) => (
                <tr key={deposit.id}>
                  <td>{formatDate(deposit.date_deposit)}</td>
                  <td>{formatCurrency(deposit.deposit_am)}</td>
                  <td>{formatCurrency(deposit.deposit_pm)}</td>
                  <td><strong>{formatCurrency(deposit.total_deposit)}</strong></td>
                  <td>
                    {deposit.deposit_vs_cash_sales === null
                      ? 'No matching cash journal'
                      : formatCurrency(deposit.deposit_vs_cash_sales)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="crj-edit-button"
                      onClick={() => handleEdit(deposit)}
                      disabled={isSaving}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {status === 'ready' && visibleDeposits.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan="6">
                    No deposits for the selected month.
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