import AccountantBranchCDJ from '../Accountant/Accountant_Branch_cdj'
import {
  listTafiAdminBranchCDJEntries,
  listTafiAdminBranchDailySummaryCDJ,
  listTafiAdminBranches
} from '../../lib/supabase'

export default function TafiBranchCDJ({ sessionToken }) {
  return (
    <AccountantBranchCDJ
      sessionToken={sessionToken}
      listBranches={listTafiAdminBranches}
      listEntries={listTafiAdminBranchCDJEntries}
      listDailySummaries={listTafiAdminBranchDailySummaryCDJ}
      sessionRoleLabel="TAFI Admin"
    />
  )
}