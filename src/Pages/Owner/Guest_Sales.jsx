import { useState } from 'react'
import {
	listGuestBranchCashReceiptsJournalEntries,
	listGuestBranchDailySummaryCRJ,
	listGuestBranchDeposits,
	listGuestBranchFoodPandaTransactions,
	listGuestBranchGcashTransactions,
	listGuestBranchSalesDiscounts,
	listGuestBranchSalesTargets,
	listGuestBranchSelectorOptions
} from '../../lib/supabase'
import TafiSales from '../TAFI_Admin/TAFI_Sales'

const guestSalesApi = {
	listBranchCashReceiptsJournalEntries: listGuestBranchCashReceiptsJournalEntries,
	listBranchSalesTargets: listGuestBranchSalesTargets,
	listBranchSalesDiscounts: listGuestBranchSalesDiscounts,
	listBranchDailySummaryCRJ: listGuestBranchDailySummaryCRJ,
	listBranchDeposits: listGuestBranchDeposits,
	listBranchGcashTransactions: listGuestBranchGcashTransactions,
	listBranchFoodPandaTransactions: listGuestBranchFoodPandaTransactions
}

export default function GuestSales({ sessionToken, section }) {
	const [selectedBranchId, setSelectedBranchId] = useState('')

	return (
		<TafiSales
			sessionToken={sessionToken}
			section={section}
			selectedBranchId={selectedBranchId}
			onSelectedBranchChange={setSelectedBranchId}
			listBranches={listGuestBranchSelectorOptions}
			sessionRole="Owner"
			canManageEntries={false}
			canManageTargets={false}
			canManageDeposits={false}
			canManageTransactions={false}
			canManageDiscounts={false}
			salesApi={guestSalesApi}
		/>
	)
}