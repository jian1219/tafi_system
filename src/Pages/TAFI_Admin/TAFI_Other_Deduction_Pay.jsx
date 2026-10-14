import { useEffect, useMemo, useState } from 'react'
import {
  createTafiAdminHdmfLoan,
  createTafiAdminHdmfPayment,
  createTafiAdminOtherDeduction,
  listTafiAdminBranches,
  listTafiAdminEmployees,
  listTafiAdminHdmfLoans,
  listTafiAdminHdmfPayments,
  listTafiAdminOtherDeductions,
  listTafiAdminUndertimeRecords,
  saveTafiAdminUndertimeMinutes
} from '../../lib/supabase'
import BranchOtherDeduction from '../Branch_admin/Branch_Other_deduction'

export default function TafiOtherDeductionPay({ sessionToken }) {
  const [branches, setBranches] = useState([])
  const [employees, setEmployees] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [directoryStatus, setDirectoryStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadDirectory = async () => {
      if (!sessionToken) {
        setError('Your TAFI Admin session is missing. Sign in again to manage payroll deductions.')
        setDirectoryStatus('error')
        return
      }

      setDirectoryStatus('loading')
      const [branchesResult, employeesResult] = await Promise.all([
        listTafiAdminBranches(sessionToken),
        listTafiAdminEmployees(sessionToken)
      ])
      if (!isCurrent) return

      const directoryError = branchesResult.error ?? employeesResult.error
      if (directoryError) {
        setError(directoryError.message)
        setDirectoryStatus('error')
        return
      }

      const loadedBranches = branchesResult.data ?? []
      setBranches(loadedBranches)
      setEmployees(employeesResult.data ?? [])
      setSelectedBranchId((current) =>
        loadedBranches.some((branch) => branch.branch_id === current)
          ? current
          : loadedBranches[0]?.branch_id ?? ''
      )
      setError('')
      setDirectoryStatus('ready')
    }

    loadDirectory()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
  const branchEmployees = useMemo(() => employees
    .filter((employee) =>
      employee.branch_id === selectedBranchId && employee.employment_status === 'active'
    )
    .map((employee) => ({
      id: employee.employee_code,
      name: employee.employee_name,
      dailyRate: Number(employee.daily_rate)
    })), [employees, selectedBranchId])

  const deductionApi = useMemo(() => ({
    createHdmfLoan: (token, loan) => createTafiAdminHdmfLoan(token, selectedBranchId, loan),
    createHdmfPayment: (token, payment) =>
      createTafiAdminHdmfPayment(token, selectedBranchId, payment),
    createOtherDeduction: (token, deduction) =>
      createTafiAdminOtherDeduction(token, selectedBranchId, deduction),
    listHdmfLoans: (token) => listTafiAdminHdmfLoans(token, selectedBranchId),
    listHdmfPayments: (token, periodStart, periodEnd) =>
      listTafiAdminHdmfPayments(token, selectedBranchId, periodStart, periodEnd),
    listOtherDeductions: (token, periodStart, periodEnd) =>
      listTafiAdminOtherDeductions(token, selectedBranchId, periodStart, periodEnd),
    listUndertimeDeductions: (token, periodStart, periodEnd) =>
      listTafiAdminUndertimeRecords(token, selectedBranchId, periodStart, periodEnd),
    saveUndertimeMinutes: (token, undertime) =>
      saveTafiAdminUndertimeMinutes(token, selectedBranchId, undertime)
  }), [selectedBranchId])
  const branchSelector = (
    <label className="other-deduction-branch-picker">
      <span>Branch</span>
      <select
        value={selectedBranchId}
        onChange={(event) => setSelectedBranchId(event.target.value)}
      >
        {branches.map((branch) => (
          <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
        ))}
      </select>
    </label>
  )

  if (directoryStatus === 'loading') {
    return <p className="other-deduction-message" role="status">Loading branches and employees…</p>
  }

  if (directoryStatus === 'error') {
    return <p className="other-deduction-message error" role="alert">{error}</p>
  }

  if (branches.length === 0) {
    return <p className="other-deduction-message" role="status">No branches are available for payroll deductions.</p>
  }

  return (
    selectedBranch && (
      <BranchOtherDeduction
        key={selectedBranchId}
        branchName={selectedBranch.branch_name}
        sessionToken={sessionToken}
        employees={branchEmployees}
        deductionApi={deductionApi}
        isTafiAdmin
        headerControl={branchSelector}
      />
    )
  )
}