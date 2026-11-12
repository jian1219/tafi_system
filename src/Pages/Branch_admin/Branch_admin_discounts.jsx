import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createBranchSalesDiscount, listBranchSalesDiscounts } from '../../lib/supabase'

const discountTypes = [
  { value: 'Senior Citizen', rate: 20 },
  { value: 'PWD', rate: 20 },
  { value: "Eagle's", rate: 10 },
  { value: 'Pag-ibig', rate: 10 },
  { value: 'Loyalty Card', rate: 10 }
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

const createEmptyDiscount = () => ({
  date: getManilaDateKey(),
  type: discountTypes[0].value,
  name: '',
  salesInvoice: '',
  billing: '',
  consigment: '',
  gross: '',
  customerCountPerOrder: '',
  noPersonGrantedDiscount: ''
})

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

export default function BranchAdminDiscounts({ branchName = 'Branch', branchAdmin }) {
  const sessionToken = branchAdmin?.session_token
  const [form, setForm] = useState(createEmptyDiscount)
  const [formOpen, setFormOpen] = useState(false)
  const [discounts, setDiscounts] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const visibleDiscounts = useMemo(
    () => discounts.filter((discount) => discount.date?.slice(0, 7) === selectedMonth),
    [discounts, selectedMonth]
  )

  useEffect(() => {
    let isCurrent = true

    const loadDiscounts = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const result = await listBranchSalesDiscounts(sessionToken)
      if (!isCurrent) return
      if (result.error) {
        setError(result.error.message)
        setStatus('error')
        return
      }

      setDiscounts(result.data ?? [])
      setError('')
      setStatus('ready')
    }

    loadDiscounts()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
    setMessage('')
  }

  const toggleForm = () => {
    const isOpen = formOpen
    setFormOpen(!isOpen)
    setError('')
    setMessage('')
    if (isOpen) setForm(createEmptyDiscount())
  }

  const typeRate = discountTypes.find(({ value }) => value === form.type)?.rate ?? 0
  const gross = Number(form.gross)
  const customerCount = Number(form.customerCountPerOrder)
  const grantedCount = Number(form.noPersonGrantedDiscount)
  const canCalculateBasis = Number.isFinite(gross)
    && gross >= 0
    && Number.isInteger(customerCount)
    && customerCount > 0
    && Number.isInteger(grantedCount)
    && grantedCount >= 0
    && grantedCount <= customerCount
  const basis = canCalculateBasis ? (gross / customerCount) / 1.12 * grantedCount : null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const grossAmount = Number(form.gross)
    const perOrderCount = Number(form.customerCountPerOrder)
    const discountedCount = Number(form.noPersonGrantedDiscount)
    if (!form.date || !form.type || !Number.isFinite(grossAmount) || grossAmount < 0) {
      setError('Select a date and discount type, and enter a gross amount of zero or greater.')
      return
    }
    if (Math.abs(grossAmount * 100 - Math.round(grossAmount * 100)) > 0.000001) {
      setError('Gross can have up to two decimal places.')
      return
    }
    if (!Number.isInteger(perOrderCount) || perOrderCount < 1
      || !Number.isInteger(discountedCount) || discountedCount < 0
      || discountedCount > perOrderCount) {
      setError('Enter a customer count greater than zero and a discounted-person count from zero up to the customer count.')
      return
    }

    setSaving(true)
    const saveResult = await createBranchSalesDiscount(sessionToken, {
      ...form,
      gross: grossAmount,
      customerCountPerOrder: perOrderCount,
      noPersonGrantedDiscount: discountedCount
    })
    if (saveResult.error) {
      setError(saveResult.error.message)
      setSaving(false)
      return
    }

    setForm(createEmptyDiscount())
    setFormOpen(false)
    const listResult = await listBranchSalesDiscounts(sessionToken)
    setSaving(false)
    if (listResult.error) {
      setError(`Discount saved, but the list could not refresh: ${listResult.error.message}`)
      setStatus('error')
      return
    }

    setDiscounts(listResult.data ?? [])
    setStatus('ready')
    setMessage('Sales discount saved.')
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Sales Discounts</h3>
        </div>
      </header>

      {error && <p className="accountant-inventory-error" role="alert">{error}</p>}
      {message && <p className="accountant-inventory-notice" role="status">{message}</p>}

      <div className="accountant-inventory-panel">
        <div className="branch-transaction-form-toggle">
          <button
            type="button"
            className="branch-cdj-add-entry"
            aria-expanded={formOpen}
            aria-controls="branch-sales-discounts-form"
            disabled={saving}
            onClick={toggleForm}
          >
            {formOpen
              ? <X size={17} aria-hidden="true" />
              : <Plus size={17} aria-hidden="true" />}
            {formOpen ? 'Close form' : 'Add Sales Discount'}
          </button>
        </div>
        <form
          id="branch-sales-discounts-form"
          className="branch-transaction-form branch-discounts-form"
          hidden={!formOpen}
          onSubmit={handleSubmit}
        >
          <label>
            <span>Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(event) => updateForm('date', event.target.value)}
              required
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={form.type}
              onChange={(event) => updateForm('type', event.target.value)}
              required
            >
              {discountTypes.map(({ value, rate }) => (
                <option key={value} value={value}>{value} ({rate}%)</option>
              ))}
            </select>
          </label>
          <label>
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
            />
          </label>
          <label>
            <span>Sales invoice</span>
            <input
              type="text"
              value={form.salesInvoice}
              onChange={(event) => updateForm('salesInvoice', event.target.value)}
            />
          </label>
          <label>
            <span>Billing</span>
            <input
              type="text"
              value={form.billing}
              onChange={(event) => updateForm('billing', event.target.value)}
            />
          </label>
          <label>
            <span>Consignment</span>
            <input
              type="text"
              value={form.consigment}
              onChange={(event) => updateForm('consigment', event.target.value)}
            />
          </label>
          <label>
            <span>Gross</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.gross}
              onChange={(event) => updateForm('gross', event.target.value)}
              required
            />
          </label>
          <label>
            <span>Customer count per order</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.customerCountPerOrder}
              onChange={(event) => updateForm('customerCountPerOrder', event.target.value)}
              required
            />
          </label>
          <label>
            <span>No. of people granted discount</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.noPersonGrantedDiscount}
              onChange={(event) => updateForm('noPersonGrantedDiscount', event.target.value)}
              required
            />
          </label>
          <div className="branch-discounts-calculations" aria-live="polite">
            <span>Discount rate <strong>{typeRate}%</strong></span>
            <span>Basis <strong>{basis === null ? '—' : formatCurrency(basis)}</strong></span>
          </div>
          <div className="branch-transaction-actions">
            <button type="submit" disabled={saving || status !== 'ready'}>
              {saving ? 'Saving…' : 'Save Discount'}
            </button>
          </div>
        </form>
      </div>

      <div className="accountant-inventory-panel">
        <div className="cash-advance-history-heading">
          <div>
            <h4>Saved discounts</h4>
            <p>{visibleDiscounts.length} {visibleDiscounts.length === 1 ? 'record' : 'records'} shown</p>
          </div>
          <label className="cash-advance-month-control">
            <span>Discount month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>
        </div>
        {status === 'loading' && (
          <p className="accountant-inventory-empty" role="status">Loading discounts…</p>
        )}
        <div className="cash-advance-table-wrap" role="region" aria-label="Saved sales discounts" tabIndex="0">
          <table className="cash-advance-table branch-discounts-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Type</th>
                <th scope="col">Rate</th>
                <th scope="col">Name</th>
                <th scope="col">Sales invoice</th>
                <th scope="col">Billing</th>
                <th scope="col">Consignment</th>
                <th scope="col">Gross</th>
                <th scope="col">Customers / order</th>
                <th scope="col">Discounted people</th>
                <th scope="col">Basis</th>
              </tr>
            </thead>
            <tbody>
              {visibleDiscounts.map((discount) => (
                <tr key={discount.id}>
                  <td>{formatDate(discount.date)}</td>
                  <td>{discount.type}</td>
                  <td>{Number(discount.disc_rate)}%</td>
                  <td>{discount.name || '—'}</td>
                  <td>{discount.sales_invoice || '—'}</td>
                  <td>{discount.billing || '—'}</td>
                  <td>{discount.consigment || '—'}</td>
                  <td>{formatCurrency(discount.gross)}</td>
                  <td>{discount.customer_count_per_order}</td>
                  <td>{discount.no_person_granted_discount}</td>
                  <td>{formatCurrency(discount.basis)}</td>
                </tr>
              ))}
              {status === 'ready' && visibleDiscounts.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan={11}>No sales discounts for the selected month.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}