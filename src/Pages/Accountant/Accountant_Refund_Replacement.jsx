import { useEffect, useMemo, useState } from 'react'
import {
  listAccountantBranchRefundSummary,
  listAccountantInventoryBranches
} from '../../lib/supabase'

const getManilaMonthKey = () => {
  const dateParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}`
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

export default function AccountantRefundReplacement({ sessionToken }) {
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [entries, setEntries] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(getManilaMonthKey)
  const [branchStatus, setBranchStatus] = useState('loading')
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
  const filteredEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(selectedMonth)),
    [entries, selectedMonth]
  )

  useEffect(() => {
    let isCurrent = true

    const loadBranches = async () => {
      if (!sessionToken) {
        setErrorMessage('Accountant session is unavailable. Please sign in again.')
        setBranchStatus('error')
        return
      }

      setBranchStatus('loading')
      const { data, error } = await listAccountantInventoryBranches(sessionToken)
      if (!isCurrent) return
      if (error) {
        setErrorMessage(error.message)
        setBranchStatus('error')
        return
      }

      const branchList = data ?? []
      setBranches(branchList)
      setSelectedBranchId((current) => (
        branchList.some((branch) => branch.branch_id === current)
          ? current
          : branchList[0]?.branch_id ?? ''
      ))
      setErrorMessage('')
      setBranchStatus('ready')
    }

    loadBranches()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  useEffect(() => {
    if (branchStatus !== 'ready' || !selectedBranchId || !sessionToken) {
      return undefined
    }

    let isCurrent = true
    const loadEntries = async () => {
      setIsLoadingEntries(true)
      setErrorMessage('')
      const { data, error } = await listAccountantBranchRefundSummary(sessionToken, selectedBranchId)
      if (!isCurrent) return
      setIsLoadingEntries(false)
      if (error) {
        setEntries([])
        setErrorMessage(error.message)
        return
      }

      setEntries(data ?? [])
    }

    loadEntries()
    return () => {
      isCurrent = false
    }
  }, [branchStatus, selectedBranchId, sessionToken])

  return (
    <section className="accountant-inventory-section">
      <div className="accountant-inventory-list-heading">
        <div>
          <h2>Branch Refund / Replacement Summary</h2>
          <p>Review refund and replacement entries recorded by Branch Admins.</p>
        </div>
      </div>

      {errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}

      {branchStatus === 'ready' && (
        <div className="tafi-stock-inventory-filters">
          <label>
            <span>Branch</span>
            <select
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              disabled={branches.length === 0}
            >
              {branches.length === 0
                ? <option value="">No branches available</option>
                : branches.map((branch) => (
                  <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
                ))}
            </select>
          </label>
          <label className="tafi-stock-request-month-filter">
            <span>Month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                if (event.target.value) setSelectedMonth(event.target.value)
              }}
            />
          </label>
        </div>
      )}

      {branchStatus === 'loading' || isLoadingEntries ? (
        <p className="accountant-inventory-empty" role="status">Loading refund / replacement summary…</p>
      ) : errorMessage ? null : !selectedBranch ? (
        <p className="accountant-inventory-empty">No branches are available to review.</p>
      ) : filteredEntries.length === 0 ? (
        <p className="accountant-inventory-empty">
          No refund / replacement entries for {selectedBranch.branch_name} in {selectedMonth}.
        </p>
      ) : (
        <div className="accountant-inventory-table-wrap">
          <table className="accountant-inventory-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Refund / Replacement</th>
                <th scope="col">Slip No.</th>
                <th scope="col">Qty</th>
                <th scope="col">Replacement Item</th>
                <th scope="col">Total Refund</th>
                <th scope="col">Reason</th>
                <th scope="col">Remarks</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}