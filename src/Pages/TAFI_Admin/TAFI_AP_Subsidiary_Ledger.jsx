import AccountantAPSubsidiaryLedger from '../Accountant/Accountant_AP_Subsidiary_ledger'
import {
  listTafiAdminAPSubsidiaryLedger,
  saveTafiAdminAPSubsidiaryLedgerEntry
} from '../../lib/supabase'

export default function TafiAPSubsidiaryLedger({ sessionToken }) {
  return (
    <AccountantAPSubsidiaryLedger
      sessionToken={sessionToken}
      listEntries={listTafiAdminAPSubsidiaryLedger}
      saveEntry={saveTafiAdminAPSubsidiaryLedgerEntry}
      sessionRoleLabel="TAFI Admin"
    />
  )
}