import AccountantTafiCDJ from '../Accountant/Accountant_TAFI_cdj'
import {
  createTafiAdminTafiCDJEntry,
  listTafiAdminTafiCDJEntries
} from '../../lib/supabase'

export default function TafiTafiCDJ({ sessionToken }) {
  return (
    <AccountantTafiCDJ
      sessionToken={sessionToken}
      createEntry={createTafiAdminTafiCDJEntry}
      listEntries={listTafiAdminTafiCDJEntries}
      sessionRoleLabel="TAFI Admin"
    />
  )
}