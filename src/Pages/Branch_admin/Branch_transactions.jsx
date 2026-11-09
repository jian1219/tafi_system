import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  createBranchFoodPandaTransaction,
  createBranchGcashTransaction,
  listBranchFoodPandaTransactions,
  listBranchGcashTransactions
} from '../../lib/supabase'

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

const createEmptyGcash = () => ({
  date: getManilaDateKey(),
  gcashTime: '',
  referenceNo: '',
  salesInvoice: '',
  amount: '',
  reference: ''
})

const createEmptyFoodPanda = () => ({
  date: getManilaDateKey(),
  foodPanda: '',
  referenceNo: '',
  salesInvoiceOrderSlipNo: '',
  invoice: '',
  amount: '',
  reference: ''
})

const formFields = {
  gcash: [
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'gcashTime', label: 'GCash time', type: 'text' },
    { key: 'referenceNo', label: 'Reference no.', type: 'text' },
    { key: 'salesInvoice', label: 'Sales invoice', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'reference', label: 'Reference', type: 'text' }
  ],
  foodPanda: [
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'foodPanda', label: 'Food Panda', type: 'text' },
    { key: 'referenceNo', label: 'Reference no.', type: 'text' },
    { key: 'salesInvoiceOrderSlipNo', label: 'Sales invoice/order slip no.', type: 'text' },
    { key: 'invoice', label: 'Invoice', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'reference', label: 'Reference', type: 'text' }
  ]
}

const transactionColumns = {
  gcash: [
    { key: 'date', label: 'Date', isDate: true },
    { key: 'gcash_time', label: 'GCash time' },
    { key: 'reference_no', label: 'Reference no.' },
    { key: 'sales_invoice', label: 'Sales invoice' },
    { key: 'amount', label: 'Amount', isAmount: true },
    { key: 'reference', label: 'Reference' }
  ],
  foodPanda: [
    { key: 'date', label: 'Date', isDate: true },
    { key: 'food_panda', label: 'Food Panda' },
    { key: 'reference_no', label: 'Reference no.' },
    { key: 'sales_invoice_order_slip_no', label: 'Sales invoice/order slip no.' },
    { key: 'invoice', label: 'Invoice' },
    { key: 'amount', label: 'Amount', isAmount: true },
    { key: 'reference', label: 'Reference' }
  ]
}

export default function BranchTransactions({ branchName = 'Branch', branchAdmin }) {
  const sessionToken = branchAdmin?.session_token
  const [activeSection, setActiveSection] = useState('gcash')
  const [transactions, setTransactions] = useState({ gcash: [], foodPanda: [] })
  const [forms, setForms] = useState({
    gcash: createEmptyGcash(),
    foodPanda: createEmptyFoodPanda()
  })
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const [formOpen, setFormOpen] = useState({ gcash: false, foodPanda: false })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingSection, setSavingSection] = useState('')

  const visibleGcashTransactions = useMemo(
    () => transactions.gcash.filter((transaction) => transaction.date?.slice(0, 7) === selectedMonth),
    [transactions.gcash, selectedMonth]
  )
  const visibleFoodPandaTransactions = useMemo(
    () => transactions.foodPanda.filter((transaction) => transaction.date?.slice(0, 7) === selectedMonth),
    [transactions.foodPanda, selectedMonth]
  )

  useEffect(() => {
    let isCurrent = true

    const loadTransactions = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const [gcashResult, foodPandaResult] = await Promise.all([
        listBranchGcashTransactions(sessionToken),
        listBranchFoodPandaTransactions(sessionToken)
      ])
      if (!isCurrent) return
      if (gcashResult.error || foodPandaResult.error) {
        setError(gcashResult.error?.message ?? foodPandaResult.error.message)
        setStatus('error')
        return
      }

      setTransactions({
        gcash: gcashResult.data ?? [],
        foodPanda: foodPandaResult.data ?? []
      })
      setError('')
      setStatus('ready')
    }

    loadTransactions()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const updateForm = (section, key, value) => {
    setForms((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value }
    }))
  }

  const toggleForm = (section) => {
    const isOpen = formOpen[section]
    setFormOpen((current) => ({ ...current, [section]: !current[section] }))
    setError('')
    setMessage('')
    if (isOpen) {
      setForms((current) => ({
        ...current,
        [section]: section === 'gcash' ? createEmptyGcash() : createEmptyFoodPanda()
      }))
    }
  }

  const handleSubmit = async (event, section) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const form = forms[section]
    const amount = Number(form.amount)
    if (!form.date || !Number.isFinite(amount) || amount < 0) {
      setError('Select a date and enter an amount of zero or greater.')
      return
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      setError('Amount can have up to two decimal places.')
      return
    }

    setSavingSection(section)
    const saveResult = section === 'gcash'
      ? await createBranchGcashTransaction(sessionToken, { ...form, amount })
      : await createBranchFoodPandaTransaction(sessionToken, { ...form, amount })
    if (saveResult.error) {
      setError(saveResult.error.message)
      setSavingSection('')
      return
    }

    setForms((current) => ({
      ...current,
      [section]: section === 'gcash' ? createEmptyGcash() : createEmptyFoodPanda()
    }))
    setFormOpen((current) => ({ ...current, [section]: false }))

    const listResult = section === 'gcash'
      ? await listBranchGcashTransactions(sessionToken)
      : await listBranchFoodPandaTransactions(sessionToken)
    setSavingSection('')
    if (listResult.error) {
      setError(`Transaction saved, but the list could not refresh: ${listResult.error.message}`)
      setStatus('error')
      return
    }

    setTransactions((current) => ({ ...current, [section]: listResult.data ?? [] }))
    setStatus('ready')
    setMessage(`${section === 'gcash' ? 'GCash' : 'Food Panda'} transaction saved.`)
  }

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Branch Transactions</h3>
        </div>
      </header>

      <div
        className="accountant-inventory-tabs"
        role="tablist"
        aria-label="Branch transaction types"
      >
        <button
          type="button"
          id="branch-transactions-gcash-tab"
          className={`accountant-inventory-tab${activeSection === 'gcash' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeSection === 'gcash'}
          aria-controls="branch-transactions-gcash-panel"
          onClick={() => setActiveSection('gcash')}
        >
          GCash
        </button>
        <button
          type="button"
          id="branch-transactions-food-panda-tab"
          className={`accountant-inventory-tab${activeSection === 'foodPanda' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeSection === 'foodPanda'}
          aria-controls="branch-transactions-food-panda-panel"
          onClick={() => setActiveSection('foodPanda')}
        >
          Food Panda
        </button>
      </div>

      {status === 'loading' && (
        <p className="accountant-inventory-empty" role="status">Loading transactions…</p>
      )}
      {error && <p className="accountant-inventory-error" role="alert">{error}</p>}
      {message && <p className="accountant-inventory-notice" role="status">{message}</p>}

      <div
        id="branch-transactions-gcash-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="branch-transactions-gcash-tab"
        hidden={activeSection !== 'gcash'}
      >
        <div className="branch-transaction-form-toggle">
          <button
            type="button"
            className="branch-cdj-add-entry"
            aria-expanded={formOpen.gcash}
            aria-controls="branch-transactions-gcash-form"
            disabled={savingSection !== ''}
            onClick={() => toggleForm('gcash')}
          >
            {formOpen.gcash
              ? <X size={17} aria-hidden="true" />
              : <Plus size={17} aria-hidden="true" />}
            {formOpen.gcash ? 'Close form' : 'Add GCash Transaction'}
          </button>
        </div>
        <form
          id="branch-transactions-gcash-form"
          className="branch-transaction-form"
          hidden={!formOpen.gcash}
          onSubmit={(event) => handleSubmit(event, 'gcash')}
        >
          {formFields.gcash.map(({ key, label, type, required }) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type={type}
                min={type === 'number' ? '0' : undefined}
                step={type === 'number' ? '0.01' : undefined}
                inputMode={type === 'number' ? 'decimal' : undefined}
                value={forms.gcash[key]}
                onChange={(event) => updateForm('gcash', key, event.target.value)}
                required={required}
              />
            </label>
          ))}
          <div className="branch-transaction-actions">
            <button type="submit" disabled={savingSection !== '' || status !== 'ready'}>
              {savingSection === 'gcash' ? 'Saving…' : 'Save GCash Transaction'}
            </button>
          </div>
        </form>

        <div className="cash-advance-history-heading">
          <div>
            <h4>GCash transactions</h4>
            <p>{visibleGcashTransactions.length} {visibleGcashTransactions.length === 1 ? 'transaction' : 'transactions'} shown</p>
          </div>
          <label className="cash-advance-month-control">
            <span>Transaction month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>
        </div>
        <div className="cash-advance-table-wrap" role="region" aria-label="GCash transactions" tabIndex="0">
          <table className="cash-advance-table branch-transaction-table">
            <thead>
              <tr>{transactionColumns.gcash.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}</tr>
            </thead>
            <tbody>
              {visibleGcashTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  {transactionColumns.gcash.map(({ key, isDate, isAmount }) => (
                    <td key={key}>
                      {isDate
                        ? formatDate(transaction[key])
                        : isAmount
                          ? formatCurrency(transaction[key])
                          : transaction[key] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
              {status === 'ready' && visibleGcashTransactions.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan={transactionColumns.gcash.length}>
                    No GCash transactions for the selected month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        id="branch-transactions-food-panda-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="branch-transactions-food-panda-tab"
        hidden={activeSection !== 'foodPanda'}
      >
        <div className="branch-transaction-form-toggle">
          <button
            type="button"
            className="branch-cdj-add-entry"
            aria-expanded={formOpen.foodPanda}
            aria-controls="branch-transactions-food-panda-form"
            disabled={savingSection !== ''}
            onClick={() => toggleForm('foodPanda')}
          >
            {formOpen.foodPanda
              ? <X size={17} aria-hidden="true" />
              : <Plus size={17} aria-hidden="true" />}
            {formOpen.foodPanda ? 'Close form' : 'Add Food Panda Transaction'}
          </button>
        </div>
        <form
          id="branch-transactions-food-panda-form"
          className="branch-transaction-form"
          hidden={!formOpen.foodPanda}
          onSubmit={(event) => handleSubmit(event, 'foodPanda')}
        >
          {formFields.foodPanda.map(({ key, label, type, required }) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type={type}
                min={type === 'number' ? '0' : undefined}
                step={type === 'number' ? '0.01' : undefined}
                inputMode={type === 'number' ? 'decimal' : undefined}
                value={forms.foodPanda[key]}
                onChange={(event) => updateForm('foodPanda', key, event.target.value)}
                required={required}
              />
            </label>
          ))}
          <div className="branch-transaction-actions">
            <button type="submit" disabled={savingSection !== '' || status !== 'ready'}>
              {savingSection === 'foodPanda' ? 'Saving…' : 'Save Food Panda Transaction'}
            </button>
          </div>
        </form>

        <div className="cash-advance-history-heading">
          <div>
            <h4>Food Panda transactions</h4>
            <p>{visibleFoodPandaTransactions.length} {visibleFoodPandaTransactions.length === 1 ? 'transaction' : 'transactions'} shown</p>
          </div>
          <label className="cash-advance-month-control">
            <span>Transaction month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>
        </div>
        <div className="cash-advance-table-wrap" role="region" aria-label="Food Panda transactions" tabIndex="0">
          <table className="cash-advance-table branch-transaction-table">
            <thead>
              <tr>{transactionColumns.foodPanda.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}</tr>
            </thead>
            <tbody>
              {visibleFoodPandaTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  {transactionColumns.foodPanda.map(({ key, isDate, isAmount }) => (
                    <td key={key}>
                      {isDate
                        ? formatDate(transaction[key])
                        : isAmount
                          ? formatCurrency(transaction[key])
                          : transaction[key] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
              {status === 'ready' && visibleFoodPandaTransactions.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan={transactionColumns.foodPanda.length}>
                    No Food Panda transactions for the selected month.
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
