import { useEffect, useState } from 'react'
import { listBranchDailySummaryCRJ } from '../../lib/supabase'

const summaryColumns = [
  { key: 'date', label: 'Date', isDate: true },
  { key: 'code', label: 'Code' },
  { key: 'total_gross_sales', label: 'Total gross sales', isAmount: true },
  { key: 'contra_sales', label: 'Contra sales', isAmount: true },
  { key: 'total_noncash_sales', label: 'Total noncash sales', isAmount: true },
  { key: 'total_cash_sales', label: 'Total cash sales', isAmount: true },
  { key: 'net_cash_available', label: 'Net cash available', isAmount: true },
  { key: 'cash_count', label: 'Cash count', isAmount: true },
  { key: 'total_cash_deposited', label: 'Total cash deposited', isAmount: true },
  { key: 'difference', label: 'Difference', isAmount: true },
  { key: 'remarks', label: 'Remarks' }
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

export default function BranchAdminSummaryCRJ({ branchName = 'Branch', branchAdmin }) {
  const sessionToken = branchAdmin?.session_token
  const [activeSection, setActiveSection] = useState('daily')
  const [summaries, setSummaries] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadSummaries = async () => {
      if (!sessionToken) {
        setError('Your Branch Admin session is missing. Sign out and sign in again to continue.')
        setStatus('error')
        return
      }

      const { data, error: loadError } = await listBranchDailySummaryCRJ(sessionToken)
      if (!isCurrent) return
      if (loadError) {
        setError(loadError.message)
        setStatus('error')
        return
      }

      setSummaries(data ?? [])
      setError('')
      setStatus('ready')
    }

    loadSummaries()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  return (
    <section className="branch-cdj-page">
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Cash Receipts Journal Summary</h3>
        </div>
      </header>

      <div className="accountant-inventory-tabs" role="tablist" aria-label="Cash Receipts Journal summary sections">
        <button
          type="button"
          id="branch-crj-daily-summary-tab"
          className={`accountant-inventory-tab${activeSection === 'daily' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeSection === 'daily'}
          aria-controls="branch-crj-daily-summary-panel"
          onClick={() => setActiveSection('daily')}
        >
          Daily Summary
        </button>
        <button
          type="button"
          id="branch-crj-monthly-summary-tab"
          className={`accountant-inventory-tab${activeSection === 'monthly' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeSection === 'monthly'}
          aria-controls="branch-crj-monthly-summary-panel"
          onClick={() => setActiveSection('monthly')}
        >
          Monthly Summary
        </button>
      </div>

      {error && <p className="accountant-inventory-error" role="alert">{error}</p>}

      <div
        id="branch-crj-daily-summary-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="branch-crj-daily-summary-tab"
        hidden={activeSection !== 'daily'}
      >
        <div className="cash-advance-history-heading">
          <div>
            <h4>Daily Summary</h4>
            <p>{summaries.length} {summaries.length === 1 ? 'record' : 'records'}</p>
          </div>
        </div>
        {status === 'loading' && (
          <p className="accountant-inventory-empty" role="status">Loading daily summary…</p>
        )}
        <div
          className="cash-advance-table-wrap"
          role="region"
          aria-label="Daily Cash Receipts Journal Summary"
          tabIndex="0"
        >
          <table className="cash-advance-table branch-crj-summary-table">
            <thead>
              <tr>
                {summaryColumns.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <tr key={summary.id}>
                  {summaryColumns.map(({ key, isDate, isAmount }) => (
                    <td key={key}>
                      {isDate
                        ? formatDate(summary[key])
                        : isAmount
                          ? formatCurrency(summary[key])
                          : summary[key] || (key === 'remarks' ? '' : '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {status === 'ready' && summaries.length === 0 && (
                <tr>
                  <td className="employee-empty-state" colSpan={summaryColumns.length}>
                    No daily summaries have been recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        id="branch-crj-monthly-summary-panel"
        className="accountant-inventory-panel"
        role="tabpanel"
        aria-labelledby="branch-crj-monthly-summary-tab"
        hidden={activeSection !== 'monthly'}
      >
        <h4>Monthly Summary</h4>
        <p className="accountant-inventory-empty">Monthly summary data has not been gathered yet.</p>
      </div>
    </section>
  )
}