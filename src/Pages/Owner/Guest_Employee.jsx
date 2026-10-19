import TafiEmployee from '../TAFI_Admin/TAFI_Employee'

export default function GuestEmployee({ sessionToken }) {
	return <TafiEmployee sessionToken={sessionToken} readOnly />
}