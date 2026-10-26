import TafiCashAdvance from '../TAFI_Admin/TAFI_Cash_Advance'

export default function GuestCashAdvance({ sessionToken }) {
	return <TafiCashAdvance sessionToken={sessionToken} readOnly />
}
