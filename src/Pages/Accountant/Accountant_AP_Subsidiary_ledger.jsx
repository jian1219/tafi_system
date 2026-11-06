import { useEffect, useMemo, useState } from 'react'
import {
  listAccountantAPSubsidiaryLedger,
  saveAccountantAPSubsidiaryLedgerEntry
} from '../../lib/supabase'

const ledgerFields = [
  { name: 'delivery_date', label: 'Delivery Date', type: 'date' },
  { name: 'po_no', label: 'PO No.' },
  { name: 'dv_no', label: 'DV No.' },
  { name: 'coverage_period', label: 'Coverage Period' },
  { name: 'billing_invoice', label: 'Billing / Invoice' },
  { name: 'description', label: 'Description', multiline: true },
  { name: 'terms', label: 'Terms' },
  { name: 'amount', label: 'Amount', type: 'number' },
  { name: 'net_amount', label: 'Net Amount', type: 'number' },
  { name: 'payment_made', label: 'Payment Made', type: 'number' },
  { name: 'check_no', label: 'Check No.' },
  { name: 'check_date', label: 'Check Date' },
  { name: 'invoice_no_ref_no', label: 'Invoice No. / Ref No.' },
  { name: 'date_payment', label: 'Date of Payment', type: 'date' },
  { name: 'balance_due', label: 'Balance Due', type: 'number' },
  { name: 'remarks', label: 'Remarks', multiline: true }
]

const statuses = [
  { value: 'preparing_check', label: 'Preparing check' },
  { value: 'paid', label: 'paid' },
  { value: 'check_for_pick_up', label: 'check for pick up' }
]

const createEmptyEntry = () => ({
  delivery_date: '',
  po_no: '',
  dv_no: '',
  coverage_period: '',
  billing_invoice: '',
  description: '',
  payee_supplier_name: '',
  terms: '',
  amount: '',
  net_amount: '',
  payment_made: '',
  check_no: '',
  check_date: '',
  invoice_no_ref_no: '',
  date_payment: '',
  balance_due: '',
  status: statuses[0].value,
  remarks: ''
})

const getStatusLabel = (value) => statuses.find((status) => status.value === value)?.label ?? value
const formatAmount = (value) => value === null || value === ''
  ? '—'
  : Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AccountantAPSubsidiaryLedger({
  sessionToken,
  listEntries = listAccountantAPSubsidiaryLedger,
  saveEntry = saveAccountantAPSubsidiaryLedgerEntry,
  sessionRoleLabel = 'Accountant'
}) {
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(createEmptyEntry)
  const [editingId, setEditingId] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isAddingSupplier, setIsAddingSupplier] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const suppliers = useMemo(
    () => [...new Set(entries.map(({ payee_supplier_name: name }) => name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [entries]
  )

  useEffect(() => {
    let isCurrent = true

    const loadEntries = async () => {
      if (!sessionToken) {
        setError(`${sessionRoleLabel} session is missing. Sign out and sign in again to continue.`)
        setIsLoading(false)
        return
      }

      const { data, error: loadError } = await listEntries(sessionToken)
      if (!isCurrent) return
      if (loadError) {
        setError(loadError.message)
      } else {
        setEntries(data ?? [])
        setError('')
      }
      setIsLoading(false)
    }

    loadEntries()
    return () => {
      isCurrent = false
    }
  }, [listEntries, sessionRoleLabel, sessionToken])

  const resetForm = () => {
    setForm(createEmptyEntry())
    setEditingId('')
    setIsAddingSupplier(false)
    setIsFormOpen(false)
  }

  const handleEdit = (entry) => {
    setForm(Object.fromEntries(
      Object.entries(createEmptyEntry()).map(([key, defaultValue]) => [
        key,
        entry[key] == null ? defaultValue : String(entry[key])
      ])
    ))
    setEditingId(entry.ledger_id)
    setIsAddingSupplier(!suppliers.includes(entry.payee_supplier_name))
    setIsFormOpen(true)
    setError('')
    setMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    for (const { name, label, type } of ledgerFields) {
      if (type !== 'number' || !form[name]) continue
      const amount = Number(form[name])
      if (!Number.isFinite(amount) || amount < 0 || !/^\d+(\.\d{1,2})?$/.test(form[name])) {
        setError(`${label} must be a non-negative amount with up to two decimal places.`)
        return
      }
    }

    setIsSaving(true)
    const { error: saveError } = await saveEntry(sessionToken, {
      ...form,
      ledger_id: editingId
    })
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    const { data, error: loadError } = await listEntries(sessionToken)
    setIsSaving(false)
    if (loadError) {
      setError(`Entry saved, but the ledger could not refresh: ${loadError.message}`)
      return
    }

    setEntries(data ?? [])
    const wasEditing = Boolean(editingId)
    resetForm()
    setMessage(wasEditing ? 'AP Subsidiary Ledger entry updated.' : 'AP Subsidiary Ledger entry saved.')
  }

  return (
    <section className="ap-ledger-page">
      <header className="ap-ledger-heading">
        <div>
          <p className="employee-info-eyebrow">EXPENSE</p>
          <h2>AP Listing</h2>
          <p>Track supplier invoices, payments, checks, and balances due.</p>
        </div>
        <button
          type="button"
          className="ap-ledger-primary-button"
          onClick={() => {
            if (isFormOpen && !editingId) {
              resetForm()
            } else {
              setForm(createEmptyEntry())
              setEditingId('')
              setIsAddingSupplier(false)
              setIsFormOpen(true)
              setError('')
            }
          }}
        >
          {isFormOpen && !editingId ? 'Close form' : 'Add AP Entry'}
        </button>
      </header>

      {error && <p className="ap-ledger-alert" role="alert">{error}</p>}
      {message && <p className="ap-ledger-success" role="status">{message}</p>}

      {isFormOpen && (
        <form className="branch-cdj-form ap-ledger-form" onSubmit={handleSubmit}>
          <div className="ap-ledger-form-heading">
            <h3>{editingId ? 'Edit AP entry' : 'New AP entry'}</h3>
            <span>Amounts accept up to two decimal places.</span>
          </div>
          <div className="ap-ledger-form-grid">
            {ledgerFields.slice(0, 5).map(({ name, label, type = 'text' }) => (
              <label className="branch-cdj-field ap-ledger-field" key={name}>
                <span>{label}</span>
                <input
                  type={type}
                  value={form[name]}
                  onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                />
              </label>
            ))}
            <label className="branch-cdj-field ap-ledger-field">
              <span>Payee / Supplier Name</span>
              {isAddingSupplier ? (
                <span className="ap-ledger-new-supplier">
                  <input
                    autoFocus
                    type="text"
                    value={form.payee_supplier_name}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      payee_supplier_name: event.target.value
                    }))}
                    placeholder="Enter supplier name"
                  />
                  <button type="button" onClick={() => {
                    setForm((current) => ({ ...current, payee_supplier_name: '' }))
                    setIsAddingSupplier(false)
                  }}>
                    Choose existing
                  </button>
                </span>
              ) : (
                <select
                  value={form.payee_supplier_name}
                  onChange={(event) => {
                    if (event.target.value === '__add_supplier__') {
                      setIsAddingSupplier(true)
                      setForm((current) => ({ ...current, payee_supplier_name: '' }))
                    } else {
                      setForm((current) => ({ ...current, payee_supplier_name: event.target.value }))
                    }
                  }}
                >
                  <option value="">Select a supplier</option>
                  {suppliers.map((supplier) => (
                    <option value={supplier} key={supplier}>{supplier}</option>
                  ))}
                  <option value="__add_supplier__">+ Add a new supplier</option>
                </select>
              )}
            </label>
            {ledgerFields.slice(5).map(({ name, label, type = 'text', multiline }) => (
              <label
                className={`branch-cdj-field ap-ledger-field${multiline ? ' wide' : ''}`}
                key={name}
              >
                <span>{label}</span>
                {multiline ? (
                  <textarea
                    rows="2"
                    value={form[name]}
                    onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                  />
                ) : (
                  <input
                    type={type}
                    min={type === 'number' ? '0' : undefined}
                    step={type === 'number' ? '0.01' : undefined}
                    value={form[name]}
                    onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                  />
                )}
              </label>
            ))}
            <label className="branch-cdj-field ap-ledger-field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                {statuses.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="ap-ledger-form-actions">
            <button type="button" className="ap-ledger-secondary-button" onClick={resetForm}>
              Cancel
            </button>
            <button type="submit" className="ap-ledger-primary-button" disabled={isSaving}>
              {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </form>
      )}

      <section className="ap-ledger-list" aria-labelledby="ap-ledger-list-title">
        <div className="cash-advance-history-heading">
          <div>
            <h4 id="ap-ledger-list-title">AP Listing</h4>
            <p>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} shown</p>
          </div>
          <p>Scroll vertically and horizontally to view all ledger columns.</p>
        </div>
        <div
          className="cash-advance-table-wrap ap-ledger-table-scroll"
          role="region"
          aria-label="AP ledger entries"
          tabIndex="0"
        >
          <table className="cash-advance-table branch-cdj-table ap-ledger-table">
            <thead>
              <tr>
                <th scope="col">Delivery Date</th>
                <th scope="col">PO No.</th>
                <th scope="col">DV No.</th>
                <th scope="col">Coverage Period</th>
                <th scope="col">Billing / Invoice</th>
                <th scope="col">Description</th>
                <th scope="col">Payee / Supplier Name</th>
                <th scope="col">Terms</th>
                <th scope="col">Amount</th>
                <th scope="col">Net Amount</th>
                <th scope="col">Payment Made</th>
                <th scope="col">Check No.</th>
                <th scope="col">Check Date</th>
                <th scope="col">Invoice No. / Ref No.</th>
                <th scope="col">Date of Payment</th>
                <th scope="col">Balance Due</th>
                <th scope="col">Status</th>
                <th scope="col">Remarks</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="ap-ledger-table-message" colSpan="19">Loading AP entries…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td className="ap-ledger-table-message" colSpan="19">No AP entries yet. Add an entry to get started.</td></tr>
              ) : entries.map((entry) => (
                <tr key={entry.ledger_id}>
                  <td>{entry.delivery_date || '—'}</td>
                  <td>{entry.po_no || '—'}</td>
                  <td>{entry.dv_no || '—'}</td>
                  <td>{entry.coverage_period || '—'}</td>
                  <td>{entry.billing_invoice || '—'}</td>
                  <td>{entry.description || '—'}</td>
                  <td>{entry.payee_supplier_name || '—'}</td>
                  <td>{entry.terms || '—'}</td>
                  <td className="ap-ledger-amount">{formatAmount(entry.amount)}</td>
                  <td className="ap-ledger-amount">{formatAmount(entry.net_amount)}</td>
                  <td className="ap-ledger-amount">{formatAmount(entry.payment_made)}</td>
                  <td>{entry.check_no || '—'}</td>
                  <td>{entry.check_date || '—'}</td>
                  <td>{entry.invoice_no_ref_no || '—'}</td>
                  <td>{entry.date_payment || '—'}</td>
                  <td className="ap-ledger-amount">{formatAmount(entry.balance_due)}</td>
                  <td><span className={`ap-ledger-status ${entry.status}`}>{getStatusLabel(entry.status)}</span></td>
                  <td>{entry.remarks || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="ap-ledger-edit-button"
                      onClick={() => handleEdit(entry)}
                      aria-label={`Edit AP entry for ${entry.payee_supplier_name || 'supplier'}`}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}