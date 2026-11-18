import AccountantAPSubsidiaryLedger from '../Accountant/Accountant_AP_Subsidiary_ledger'
import AccountantBranchCDJ from '../Accountant/Accountant_Branch_cdj'
import AccountantTafiCDJ from '../Accountant/Accountant_TAFI_cdj'
import {
	listGuestBranchCDJEntries,
	listGuestBranchDailySummaryCDJ,
	listGuestBranchSelectorOptions,
	listGuestTafiAPSubsidiaryLedger,
	listGuestTafiCDJEntries
} from '../../lib/supabase'

export default function GuestExpense({ sessionToken, section }) {
	if (section === 'branch-cdj') {
		return (
			<AccountantBranchCDJ
				sessionToken={sessionToken}
				listBranches={listGuestBranchSelectorOptions}
				listEntries={listGuestBranchCDJEntries}
				listDailySummaries={listGuestBranchDailySummaryCDJ}
				sessionRoleLabel="Owner"
			/>
		)
	}

	if (section === 'tafi-cdj') {
		return (
			<AccountantTafiCDJ
				sessionToken={sessionToken}
				listEntries={listGuestTafiCDJEntries}
				sessionRoleLabel="Owner"
				readOnly
			/>
		)
	}

	return (
		<AccountantAPSubsidiaryLedger
			sessionToken={sessionToken}
			listEntries={listGuestTafiAPSubsidiaryLedger}
			sessionRoleLabel="Owner"
			readOnly
		/>
	)
}