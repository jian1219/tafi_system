import { useEffect, useMemo, useState } from 'react'
import {
  listAccountantInventoryBranches,
  listTafiAdminBranchCashReceiptsJournalEntries,
  listTafiAdminBranchDeposits,
  listTafiAdminBranchFoodPandaTransactions,
  listTafiAdminBranchGcashTransactions,
  listTafiAdminBranchSalesTargets
} from '../../lib/supabase'
import BranchCashReceiptsJournal from '../Branch_admin/Branch_cash_receipts_journal'
import BranchDeposit from '../Branch_admin/Branch_Deposit'
import BranchTransactions from '../Branch_admin/Branch_transactions'

export default function AccountantSales({
  sessionToken,
  section,
  selectedBranchId,
  onSelectedBranchChange
}) {
  const [branches, setBranches] = useState([])
  const [isLoadingBranches, setIsLoadingBranches] = useState(true)
  const [branchError, setBranchError] = useState('')
  const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)

  const api = useMemo(() => ({
    listBranchCashReceiptsJournalEntries: (token) => (
      listTafiAdminBranchCashReceiptsJournalEntries(token, selectedBranchId)
    ),
    listBranchSalesTargets: (token) => (
      listTafiAdminBranchSalesTargets(token, selectedBranchId)
    ),
    listBranchDeposits: (token) => listTafiAdminBranchDeposits(token, selectedBranchId),
    listBranchGcashTransactions: (token) => (
      listTafiAdminBranchGcashTransactions(token, selectedBranchId)
    ),
    listBranchFoodPandaTransactions: (token) => (
      listTafiAdminBranchFoodPandaTransactions(token, selectedBranchId)
    )
  }), [selectedBranchId])

  useEffect(() => {
    let isCurrent = true

    const loadBranches = async () => {
      if (!sessionToken) {
        setBranchError('Accountant session is unavailable. Please sign in again.')
        setIsLoadingBranches(false)
        return
      }

      const { data, error } = await listAccountantInventoryBranches(sessionToken)
      if (!isCurrent) return
      setIsLoadingBranches(false)
      if (error) {
        setBranchError(error.message)
        return
      }

      const branchList = data ?? []
      setBranches(branchList)
      onSelectedBranchChange((current) => (
        branchList.some((branch) => branch.branch_id === current)
          ? current
          : branchList[0]?.branch_id ?? ''
      ))
      setBranchError('')
    }

    void loadBranches()
    return () => {
      isCurrent = false
    }
  }, [onSelectedBranchChange, sessionToken])

  const page = section === 'sales-crj'
    ? <BranchCashReceiptsJournal
        key={selectedBranchId}
        branchName={selectedBranch?.branch_name}
        branchAdmin={{ session_token: sessionToken }}
        api={api}
        canManageEntries={false}
      />
    : section === 'sales-deposit'
      ? <BranchDeposit
          key={selectedBranchId}
          branchName={selectedBranch?.branch_name}
          branchAdmin={{ session_token: sessionToken }}
          api={api}
          canManageDeposits={false}
        />
      : <BranchTransactions
          key={selectedBranchId}
          branchName={selectedBranch?.branch_name}
          branchAdmin={{ session_token: sessionToken }}
          api={api}
          canManageTransactions={false}
        />

  return (
    <section>
      <header className="branch-cash-advance-header">
        <div>
          <p className="employee-info-eyebrow">Accountant Sales</p>
          <p className="employee-info-description">
            Select a branch to view its sales journal, deposits, and transactions.
          </p>
        </div>
        <label className="cash-advance-month-control tafi-cash-advance-branch-select">
          <span>Branch</span>
          <select
            value={selectedBranchId}
            onChange={(event) => onSelectedBranchChange(event.target.value)}
            disabled={isLoadingBranches || branches.length === 0}
          >
            {isLoadingBranches && <option value="">Loading branches…</option>}
            {!isLoadingBranches && branches.length === 0 && <option value="">No branches available</option>}
            {branches.map((branch) => (
              <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
            ))}
          </select>
        </label>
      </header>

      {branchError && <p className="cash-advance-message error" role="alert">{branchError}</p>}
      {isLoadingBranches && <p className="cash-advance-message" role="status">Loading branches…</p>}
      {!isLoadingBranches && !branchError && branches.length === 0 && (
        <p className="cash-advance-message" role="status">No branches are available.</p>
      )}
      {!isLoadingBranches && selectedBranch && !branchError && page}
    </section>
  )
}