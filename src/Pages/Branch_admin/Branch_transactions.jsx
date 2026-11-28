import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createBranchFoodPandaTransaction,
  createBranchGcashTransaction,
  deleteBranchFoodPandaTransaction,
  deleteBranchGcashTransaction,
  listBranchFoodPandaTransactions,
  listBranchGcashTransactions,
  updateBranchFoodPandaTransaction,
  updateBranchGcashTransaction
} from '../../lib/supabase'

const branchTransactionsApi = {
  createBranchFoodPandaTransaction,
  createBranchGcashTransaction,
  deleteBranchFoodPandaTransaction,
  deleteBranchGcashTransaction,
  listBranchFoodPandaTransactions,
  listBranchGcashTransactions,
  updateBranchFoodPandaTransaction,
  updateBranchGcashTransaction
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

export default function BranchTransactions({
  branchName = 'Branch',
  branchAdmin,
  api = branchTransactionsApi,
  canManageTransactions = true,
  canDeleteTransactions = false
}) {
  const sessionToken = branchAdmin?.session_token
  const [activeSection, setActiveSection] = useState('gcash')
  const [transactions, setTransactions] = useState({ gcash: [], foodPanda: [] })
  const [forms, setForms] = useState({
    gcash: createEmptyGcash(),
    foodPanda: createEmptyFoodPanda()
  })
  const [editingTransactionIds, setEditingTransactionIds] = useState({ gcash: '', foodPanda: '' })
  const [selectedMonth, setSelectedMonth] = useState(() => getManilaDateKey().slice(0, 7))
  const [formOpen, setFormOpen] = useState({ gcash: false, foodPanda: false })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingSection, setSavingSection] = useState('')
  const [deletingTransactionId, setDeletingTransactionId] = useState('')
  const canEditGcashTransactions = typeof api.updateBranchGcashTransaction === 'function'
  const canEditFoodPandaTransactions = typeof api.updateBranchFoodPandaTransaction === 'function'

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
        api.listBranchGcashTransactions(sessionToken),
        api.listBranchFoodPandaTransactions(sessionToken)
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
  }, [api, sessionToken])

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
      setEditingTransactionIds((current) => ({ ...current, [section]: '' }))
    }
  }

  const cancelEdit = (section) => {
    setEditingTransactionIds((current) => ({ ...current, [section]: '' }))
    setForms((current) => ({
      ...current,
      [section]: section === 'gcash' ? createEmptyGcash() : createEmptyFoodPanda()
    }))
    setFormOpen((current) => ({ ...current, [section]: false }))
    setError('')
    setMessage('')
  }

  const handleEdit = (section, transaction) => {
    setEditingTransactionIds((current) => ({ ...current, [section]: transaction.id }))
    setForms((current) => ({
      ...current,
      [section]: section === 'gcash'
        ? {
            date: transaction.date,
            gcashTime: transaction.gcash_time ?? '',
            referenceNo: transaction.reference_no ?? '',
            salesInvoice: transaction.sales_invoice ?? '',
            amount: String(transaction.amount),
            reference: transaction.reference ?? ''
          }
        : {
            date: transaction.date,
            foodPanda: transaction.food_panda ?? '',
            referenceNo: transaction.reference_no ?? '',
            salesInvoiceOrderSlipNo: transaction.sales_invoice_order_slip_no ?? '',
            invoice: transaction.invoice ?? '',
            amount: String(transaction.amount),
            reference: transaction.reference ?? ''
          }
    }))
    setSelectedMonth(transaction.date.slice(0, 7))
    setFormOpen((current) => ({ ...current, [section]: true }))
    setError('')
    setMessage(`Editing ${section === 'gcash' ? 'GCash' : 'Food Panda'} transaction for ${formatDate(transaction.date)}.`)
  }

  const handleSubmit = async (event, section) => {
    event.preventDefault()
    if (deletingTransactionId) {
      setError('Wait for the transaction deletion to finish before saving.')
      return
    }
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
    const editingTransactionId = editingTransactionIds[section]
    const transactionInput = { ...form, amount }
    const saveResult = section === 'gcash'
      ? editingTransactionId
        ? await api.updateBranchGcashTransaction(sessionToken, editingTransactionId, transactionInput)
        : await api.createBranchGcashTransaction(sessionToken, transactionInput)
      : editingTransactionId
        ? await api.updateBranchFoodPandaTransaction(sessionToken, editingTransactionId, transactionInput)
        : await api.createBranchFoodPandaTransaction(sessionToken, transactionInput)
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
    setEditingTransactionIds((current) => ({ ...current, [section]: '' }))

    const listResult = section === 'gcash'
      ? await api.listBranchGcashTransactions(sessionToken)
      : await api.listBranchFoodPandaTransactions(sessionToken)
    setSavingSection('')
    if (listResult.error) {
      setError(`Transaction ${editingTransactionId ? 'updated' : 'saved'}, but the list could not refresh: ${listResult.error.message}`)
      setStatus('error')
      return
    }

    setTransactions((current) => ({ ...current, [section]: listResult.data ?? [] }))
    setStatus('ready')
    setMessage(`${section === 'gcash' ? 'GCash' : 'Food Panda'} transaction ${editingTransactionId ? 'updated' : 'saved'}.`)
  }

  const handleDelete = async (section, transaction) => {
    const transactionType = section === 'gcash' ? 'GCash' : 'Food Panda'
    if (!window.confirm(
      `Delete this ${transactionType} transaction dated ${formatDate(transaction.date)} for ${formatCurrency(transaction.amount)}? This cannot be undone.`
    )) {
      return
    }

    const deleteTransaction = section === 'gcash'
      ? api.deleteBranchGcashTransaction
      : api.deleteBranchFoodPandaTransaction
    if (typeof deleteTransaction !== 'function') {
      setError(`Deleting ${transactionType} transactions is not available for this account.`)
      setMessage('')
      return
    }

    setError('')
    setMessage('')
    setDeletingTransactionId(transaction.id)
    const { error: deleteError } = await deleteTransaction(sessionToken, transaction.id)
    if (deleteError) {
      setError(deleteError.message)
      setDeletingTransactionId('')
      return
    }

    const listTransactions = section === 'gcash'
      ? api.listBranchGcashTransactions
      : api.listBranchFoodPandaTransactions
    const listResult = await listTransactions(sessionToken)
    setDeletingTransactionId('')
    if (listResult.error) {
      setTransactions((current) => ({
        ...current,
        [section]: current[section].filter((item) => item.id !== transaction.id)
      }))
      setError(`Transaction deleted, but the list could not refresh: ${listResult.error.message}`)
      setStatus('error')
      return
    }

    setTransactions((current) => ({ ...current, [section]: listResult.data ?? [] }))
    setStatus('ready')
    setMessage(`${transactionType} transaction deleted.`)
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
        {canManageTransactions && (
          <>
            <div className="branch-transaction-form-toggle">
              <button
                type="button"
                className="branch-cdj-add-entry"
                aria-expanded={formOpen.gcash}
                aria-controls="branch-transactions-gcash-form"
                disabled={savingSection !== '' || Boolean(deletingTransactionId)}
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
                <button type="submit" disabled={savingSection !== '' || Boolean(deletingTransactionId) || status !== 'ready'}>
                  {savingSection === 'gcash'
                    ? (editingTransactionIds.gcash ? 'Updating…' : 'Saving…')
                    : editingTransactionIds.gcash ? 'Update GCash Transaction' : 'Save GCash Transaction'}
                </button>
                {editingTransactionIds.gcash && (
                  <button type="button" className="deposit-cancel-button" onClick={() => cancelEdit('gcash')} disabled={savingSection !== ''}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </>
        )}

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
              <tr>
                {transactionColumns.gcash.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}
                {canManageTransactions && canDeleteTransactions && <th scope="col">Actions</th>}
              </tr>
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
                  {canManageTransactions && canDeleteTransactions && (
                    <td>
                      {canEditGcashTransactions && (
                        <button
                          type="button"
                          className="crj-edit-button"
                          onClick={() => handleEdit('gcash', transaction)}
                          disabled={savingSection !== '' || Boolean(deletingTransactionId)}
                          aria-label={`Edit GCash transaction dated ${formatDate(transaction.date)}`}
                          title="Edit transaction"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="branch-transaction-delete"
                        onClick={() => handleDelete('gcash', transaction)}
                        disabled={savingSection !== '' || Boolean(deletingTransactionId)}
                        aria-label={`${deletingTransactionId === transaction.id ? 'Deleting' : 'Delete'} GCash transaction dated ${formatDate(transaction.date)}`}
                        title={deletingTransactionId === transaction.id ? 'Deleting transaction' : 'Delete transaction'}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {status === 'ready' && visibleGcashTransactions.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan={transactionColumns.gcash.length + Number(canManageTransactions && canDeleteTransactions)}>
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
        {canManageTransactions && (
          <>
            <div className="branch-transaction-form-toggle">
              <button
                type="button"
                className="branch-cdj-add-entry"
                aria-expanded={formOpen.foodPanda}
                aria-controls="branch-transactions-food-panda-form"
                disabled={savingSection !== '' || Boolean(deletingTransactionId)}
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
                <button type="submit" disabled={savingSection !== '' || Boolean(deletingTransactionId) || status !== 'ready'}>
                  {savingSection === 'foodPanda'
                    ? (editingTransactionIds.foodPanda ? 'Updating…' : 'Saving…')
                    : editingTransactionIds.foodPanda ? 'Update Food Panda Transaction' : 'Save Food Panda Transaction'}
                </button>
                {editingTransactionIds.foodPanda && (
                  <button type="button" className="deposit-cancel-button" onClick={() => cancelEdit('foodPanda')} disabled={savingSection !== ''}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </>
        )}

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
              <tr>
                {transactionColumns.foodPanda.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}
                {canManageTransactions && canDeleteTransactions && <th scope="col">Actions</th>}
              </tr>
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
                  {canManageTransactions && canDeleteTransactions && (
                    <td>
                      {canEditFoodPandaTransactions && (
                        <button
                          type="button"
                          className="crj-edit-button"
                          onClick={() => handleEdit('foodPanda', transaction)}
                          disabled={savingSection !== '' || Boolean(deletingTransactionId)}
                          aria-label={`Edit Food Panda transaction dated ${formatDate(transaction.date)}`}
                          title="Edit transaction"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="branch-transaction-delete"
                        onClick={() => handleDelete('foodPanda', transaction)}
                        disabled={savingSection !== '' || Boolean(deletingTransactionId)}
                        aria-label={`${deletingTransactionId === transaction.id ? 'Deleting' : 'Delete'} Food Panda transaction dated ${formatDate(transaction.date)}`}
                        title={deletingTransactionId === transaction.id ? 'Deleting transaction' : 'Delete transaction'}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {status === 'ready' && visibleFoodPandaTransactions.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan={transactionColumns.foodPanda.length + Number(canManageTransactions && canDeleteTransactions)}>
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
