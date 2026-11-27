import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  createBranchRefundSummaryEntry,
  deleteBranchRefundSummaryEntry,
  listBranchRefundSummary,
  updateBranchRefundSummaryEntry
} from '../../lib/supabase'

const refundReasons = [
  'Spoiled / Expired',
  'Undercooked / Overcooked / Off-flavor',
  'Customer Change Mind',
  'Wrong Order'
]

const getManilaDateKey = () => {
  const dateParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

const createEmptyEntry = () => ({
  date: getManilaDateKey(),
  refundReplacement: '',
  refundReplacementSlipNo: '',
  qty: '1',
  replacementItem: '',
  totalRefund: '',
  reason: '',
  remarks: ''
})

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

export default function BranchAdminRefundReplacement({ branchName = 'Branch', branchAdmin }) {
  const sessionToken = branchAdmin?.session_token
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(createEmptyEntry)
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const [status, setStatus] = useState('loading')
  const [isSaving, setIsSaving] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState('')
  const [deletingEntryId, setDeletingEntryId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const filteredEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(selectedMonth)),
    [entries, selectedMonth]
  )

  useEffect(() => {
    let isCurrent = true

    const loadEntries = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const { data, error: loadError } = await listBranchRefundSummary(sessionToken)
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

    const qty = Number(form.qty)
    const totalRefund = Number(form.totalRefund)
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Quantity must be a whole number greater than zero.')
      return
    }
    if (!Number.isFinite(totalRefund) || totalRefund < 0
      || Math.round(totalRefund * 100) !== totalRefund * 100) {
      setError('Enter a valid total refund amount with no more than two decimal places.')
      return
    }

    setIsSaving(true)
    const entry = {
      ...(editingEntryId ? { id: editingEntryId } : {}),
      date: form.date,
      refundReplacement: form.refundReplacement.trim(),
      refundReplacementSlipNo: form.refundReplacementSlipNo.trim(),
      qty,
      replacementItem: form.replacementItem.trim(),
      totalRefund,
      reason: form.reason,
      remarks: form.remarks.trim()
    }
    const saveEntry = editingEntryId
      ? updateBranchRefundSummaryEntry
      : createBranchRefundSummaryEntry
    const { error: saveError } = await saveEntry(sessionToken, entry)
    if (saveError) {
      setError(saveError.message)
      setIsSaving(false)
      return
    }

    setForm(createEmptyEntry())
    setEditingEntryId('')
    setSelectedMonth(form.date.slice(0, 7))
    const { data, error: loadError } = await listBranchRefundSummary(sessionToken)
    setIsSaving(false)
    if (loadError) {
      setError(`Entry saved, but the history could not be refreshed: ${loadError.message}`)
      setStatus('error')
      return
    }

    setEntries(data ?? [])
    setStatus('ready')
    setMessage(`Refund / replacement entry ${editingEntryId ? 'updated' : 'saved'}.`)
  }

  const handleEditEntry = (entry) => {
    setEditingEntryId(entry.id)
    setForm({
      date: entry.date,
      refundReplacement: entry.refund_replacement,
      refundReplacementSlipNo: entry.refund_replacement_slip_no,
      qty: String(entry.qty),
      replacementItem: entry.replacement_item,
      totalRefund: Number(entry.total_refund).toFixed(2),
      reason: entry.reason_for_refund_replacement,
      remarks: entry.remarks ?? ''
    })
    setSelectedMonth(entry.date.slice(0, 7))
    setError('')
    setMessage(`Editing refund / replacement slip ${entry.refund_replacement_slip_no}.`)
  }

  const handleDeleteEntry = async (entry) => {
    if (isSaving || deletingEntryId) return
    if (!window.confirm(
      `Delete refund / replacement slip ${entry.refund_replacement_slip_no} dated ${formatDate(entry.date)}? This cannot be undone.`
    )) return

    setError('')
    setMessage('')
    setDeletingEntryId(entry.id)
    const { error: deleteError } = await deleteBranchRefundSummaryEntry(sessionToken, entry.id)
    if (deleteError) {
      setError(deleteError.message)
      setDeletingEntryId('')
      return
    }

    if (editingEntryId === entry.id) {
      setForm(createEmptyEntry())
      setEditingEntryId('')
    }
    const { data, error: loadError } = await listBranchRefundSummary(sessionToken)
    setDeletingEntryId('')
    if (loadError) {
      setEntries((current) => current.filter((item) => item.id !== entry.id))
      setError(`Entry deleted, but the history could not be refreshed: ${loadError.message}`)
      setStatus('error')
      return
    }

    setEntries(data ?? [])
    setStatus('ready')
    setMessage('Refund / replacement entry deleted.')
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Refund / Replacement Summary</h3>
          <p className="employee-info-description">
            Record refund and replacement details for this branch.
          </p>
        </div>
      </header>

      {error && <p className="cash-advance-message error" role="alert">{error}</p>}
      {message && <p className="cash-advance-message" role="status">{message}</p>}

      <form className="branch-cdj-form" onSubmit={handleSubmit}>
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
          <span>Refund / Replacement</span>
          <input
            type="text"
            value={form.refundReplacement}
            onChange={(event) => setForm((current) => ({
              ...current,
              refundReplacement: event.target.value
            }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>Refund / Replacement Slip No.</span>
          <input
            type="text"
            value={form.refundReplacementSlipNo}
            onChange={(event) => setForm((current) => ({
              ...current,
              refundReplacementSlipNo: event.target.value
            }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>Qty</span>
          <input
            type="number"
            min="1"
            step="1"
            value={form.qty}
            onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>Replacement Item</span>
          <input
            type="text"
            value={form.replacementItem}
            onChange={(event) => setForm((current) => ({
              ...current,
              replacementItem: event.target.value
            }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>Total Refund (PHP)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.totalRefund}
            onChange={(event) => setForm((current) => ({
              ...current,
              totalRefund: event.target.value
            }))}
            required
          />
        </label>
        <label className="branch-cdj-field">
          <span>Reason</span>
          <select
            value={form.reason}
            onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
            required
          >
            <option value="">Select a reason</option>
            {refundReasons.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
        </label>
        <label className="branch-cdj-field">
          <span>Remarks</span>
          <input
            type="text"
            value={form.remarks}
            onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
          />
        </label>
        <button type="submit" disabled={isSaving || Boolean(deletingEntryId) || status !== 'ready'}>
          {isSaving ? (editingEntryId ? 'Updating…' : 'Saving…') : (editingEntryId ? 'Update Entry' : 'Save Entry')}
        </button>
        {editingEntryId && (
          <button
            type="button"
            className="crj-cancel-button"
            disabled={isSaving || Boolean(deletingEntryId)}
            onClick={() => {
              setForm(createEmptyEntry())
              setEditingEntryId('')
              setError('')
              setMessage('')
            }}
          >
            Cancel Edit
          </button>
        )}
      </form>

      <div className="cash-advance-history-heading">
        <div>
          <h4>Refund / Replacement History</h4>
          <p>Showing entries for {selectedMonth}.</p>
        </div>
        <label className="cash-advance-month-control">
          <span>Month</span>
          <input
            type="month"
            value={selectedMonth}
            disabled={isSaving || Boolean(deletingEntryId)}
            onChange={(event) => {
              if (event.target.value) setSelectedMonth(event.target.value)
            }}
          />
        </label>
      </div>

      {status === 'loading' ? (
        <p className="cash-advance-message" role="status">Loading refund / replacement history…</p>
      ) : (
        <div className="cash-advance-table-wrap" role="region" aria-label="Refund and replacement history" tabIndex="0">
          <table className="cash-advance-table branch-refund-summary-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Refund / Replacement</th>
                <th>Slip No.</th>
                <th>Qty</th>
                <th>Replacement Item</th>
                <th>Total Refund</th>
                <th>Reason</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  <td>{entry.refund_replacement}</td>
                  <td>{entry.refund_replacement_slip_no}</td>
                  <td>{entry.qty}</td>
                  <td>{entry.replacement_item}</td>
                  <td>{formatCurrency(entry.total_refund)}</td>
                  <td>{entry.reason_for_refund_replacement}</td>
                  <td>{entry.remarks || '—'}</td>
                  <td>
                    <div className="branch-refund-summary-actions">
                      <button
                        type="button"
                        className="crj-edit-button"
                        aria-label={`Edit refund / replacement slip ${entry.refund_replacement_slip_no}`}
                        title="Edit"
                        disabled={isSaving || Boolean(deletingEntryId)}
                        onClick={() => handleEditEntry(entry)}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="crj-delete-button"
                        aria-label={`${deletingEntryId === entry.id ? 'Deleting' : 'Delete'} refund / replacement slip ${entry.refund_replacement_slip_no}`}
                        title={deletingEntryId === entry.id ? 'Deleting…' : 'Delete'}
                        disabled={isSaving || Boolean(deletingEntryId)}
                        onClick={() => handleDeleteEntry(entry)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan="9">
                    No refund / replacement entries for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}