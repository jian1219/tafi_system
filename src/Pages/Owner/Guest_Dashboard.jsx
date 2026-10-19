import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react'
import { revokeGuestSession } from '../../lib/supabase'
import GuestOverview from './Guest_Overview'
import GuestEmployee from './Guest_Employee'
import GuestAttendance from './Guest_Attendance'
import logoImage from '../../images/Tafi logo transparent.png'

const navigationItems = [
	{ id: 'overview', label: 'Overview', icon: LayoutDashboard },
	{ id: 'employee', label: 'Employee', icon: Users },
	{ id: 'attendance', label: 'Attendance', icon: CalendarDays }
]

export default function GuestDashboard() {
	const location = useLocation()
	const navigate = useNavigate()
	const guest = location.state?.guest
	const [activePage, setActivePage] = useState('overview')
	const [signOutError, setSignOutError] = useState('')
	const [isSigningOut, setIsSigningOut] = useState(false)

	if (!guest?.session_token) return <Navigate to="/guest-login" replace />

	const handleSignOut = async (event) => {
		event.preventDefault()
		if (isSigningOut) return
		setSignOutError('')
		setIsSigningOut(true)
		const { error } = await revokeGuestSession(guest.session_token)
		setIsSigningOut(false)
		if (error) {
			setSignOutError(error.message)
			return
		}
		navigate('/')
	}

	return (
		<div className="tafi-admin-layout guest-dashboard">
			<aside className="tafi-admin-sidebar">
				<div className="tafi-admin-sidebar-brand">
					<img src={logoImage} alt="Triton ACCE Food Inc. logo" />
					<div>
						<strong>Guest Workspace</strong>
						<span>Limited access</span>
					</div>
				</div>

				<p className="tafi-admin-nav-label">Workspace</p>
				<nav className="tafi-admin-nav" aria-label="Dashboard sections">
					{navigationItems.map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							type="button"
							className={`tafi-admin-nav-item${activePage === id ? ' active' : ''}`}
							aria-current={activePage === id ? 'page' : undefined}
							onClick={() => setActivePage(id)}
						>
							<Icon size={19} aria-hidden="true" />
							<span>{label}</span>
						</button>
					))}
				</nav>

				<div className="tafi-admin-sidebar-footer">
					<span>{guest.guest_name}</span>
					<a
						href="/"
						className="tafi-admin-signout"
						onClick={handleSignOut}
						aria-disabled={isSigningOut}
					>
						<LogOut size={17} aria-hidden="true" />
						{isSigningOut ? 'Signing out...' : 'Sign out'}
					</a>
					{signOutError && <span role="alert">{signOutError}</span>}
				</div>
			</aside>

			<main className="tafi-admin-main">
				<header className="tafi-admin-page-header">
					<div>
						<p className="eyebrow">Guest workspace</p>
						<h1>{navigationItems.find((item) => item.id === activePage)?.label}</h1>
					</div>
					<div className="tafi-admin-account">
						<ShieldCheck size={18} aria-hidden="true" />
						<span>{guest.guest_email}</span>
					</div>
				</header>

				<section className="tafi-admin-content" aria-live="polite">
					{activePage === 'overview'
						? <GuestOverview guest={guest} />
						: activePage === 'employee'
							? <GuestEmployee sessionToken={guest.session_token} />
							: <GuestAttendance sessionToken={guest.session_token} />}
				</section>
			</main>
		</div>
	)
}