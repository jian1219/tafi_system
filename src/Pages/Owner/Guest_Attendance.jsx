import TafiEmployeeAttendance from '../TAFI_Admin/TAFI_Employee_Attendance'

export default function GuestAttendance({ sessionToken }) {
	return <TafiEmployeeAttendance sessionToken={sessionToken} readOnly />
}