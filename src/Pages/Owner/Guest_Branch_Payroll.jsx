import TafiBranchPayroll from '../TAFI_Admin/TAFI_Branch_Payroll'

export default function GuestBranchPayroll({ sessionToken }) {
	return <TafiBranchPayroll sessionToken={sessionToken} readOnly />
}
