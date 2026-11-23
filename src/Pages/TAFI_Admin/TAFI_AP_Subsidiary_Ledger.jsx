import { useEffect, useState } from 'react'
import AccountantAPSubsidiaryLedger from '../Accountant/Accountant_AP_Subsidiary_ledger'
import {
  listTafiAdminAPSubsidiaryLedger,
  saveTafiAdminAPSubsidiaryLedgerEntry,
  deleteTafiAdminAPSubsidiaryLedgerEntry,
  listTafiAdminInventoryInformation
} from '../../lib/supabase'

export default function TafiAPSubsidiaryLedger({ sessionToken }) {
  const [supplierOptions, setSupplierOptions] = useState([])
  const [supplierOptionsLoading, setSupplierOptionsLoading] = useState(true)
  const [supplierOptionsError, setSupplierOptionsError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadSuppliers = async () => {
      if (!sessionToken) {
        setSupplierOptionsLoading(false)
        return
      }

      const { data, error } = await listTafiAdminInventoryInformation(sessionToken)
      if (!isCurrent) return
      setSupplierOptionsLoading(false)
      if (error) {
        setSupplierOptionsError(`Shared Inventory suppliers could not be loaded: ${error.message}`)
        return
      }

      setSupplierOptions([...new Set(
        (data ?? []).map((item) => item.supplier?.trim()).filter(Boolean)
      )].sort((first, second) => first.localeCompare(second)))
      setSupplierOptionsError('')
    }

    void loadSuppliers()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  return (
    <AccountantAPSubsidiaryLedger
      sessionToken={sessionToken}
      listEntries={listTafiAdminAPSubsidiaryLedger}
      saveEntry={saveTafiAdminAPSubsidiaryLedgerEntry}
      deleteEntry={deleteTafiAdminAPSubsidiaryLedgerEntry}
      sessionRoleLabel="TAFI Admin"
      supplierOptions={supplierOptions}
      supplierOptionsLoading={supplierOptionsLoading}
      supplierOptionsError={supplierOptionsError}
    />
  )
}