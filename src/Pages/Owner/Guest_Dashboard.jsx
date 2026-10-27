import { lazy, Suspense, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CircleDollarSign, LayoutDashboard, LogOut, ShieldCheck, Trophy, Users, Wallet } from 'lucide-react'
import { revokeGuestSession } from '../../lib/supabase'
import useSessionStorageState from '../../lib/useSessionStorageState'
import useRoleSessionExpiry from '../../lib/useRoleSessionExpiry'
import GuestOverview from './Guest_Overview'
import GuestEmployee from './Guest_Employee'
import GuestAttendance from './Guest_Attendance'
const GuestRankings = lazy(() => import('./Guest_Rankings'))
const GuestCashAdvance = lazy(() => import('./Guest_Cash_Advance'))
const GuestBranchPayroll = lazy(() => import('./Guest_Branch_Payroll'))
import logoImage from '../../images/Tafi logo transparent.png'

const navigationItems = [
	{ id: 'overview', label: 'Overview', icon: LayoutDashboard },
	{ id: 'employee', label: 'Employee', icon: Users },
	{ id: 'attendance', label: 'Attendance', icon: CalendarDays },
	{ id: 'cash-advance', label: 'Cash Advance', icon: CircleDollarSign },
	{ id: 'payroll', label: 'Branch Payroll', icon: Wallet },
	{ id: 'rankings', label: 'Employee Rankings', icon: Trophy }
]

export default function GuestDashboard() {
	const location = useLocation()
	const navigate = useNavigate()
	const guest = location.state?.guest
	const isSessionActive = useRoleSessionExpiry(guest, '/guest-login')
	const [activePage, setActivePage] = useSessionStorageState(
		'tafi-guest-dashboard-page',
		'overview',
		navigationItems.map((item) => item.id)
	)
	const [signOutError, setSignOutError] = useState('')
	const [isSigningOut, setIsSigningOut] = useState(false)

	if (!isSessionActive) return <Navigate to="/guest-login" replace />

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
						<strong>Owner Workspace</strong>
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
						<p className="eyebrow">Owner workspace</p>
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
							: activePage === 'attendance'
								? <GuestAttendance sessionToken={guest.session_token} />
								: activePage === 'cash-advance'
									? (
										<Suspense fallback={<p className="cash-advance-message" role="status">Loading cash advance…</p>}>
											<GuestCashAdvance sessionToken={guest.session_token} />
										</Suspense>
									)
									: activePage === 'payroll'
										? (
											<Suspense fallback={<p className="payroll-contribution-message" role="status">Loading branch payroll…</p>}>
												<GuestBranchPayroll sessionToken={guest.session_token} />
											</Suspense>
										)
								: (
									<Suspense fallback={<p className="ranking-loading" role="status">Loading employee rankings…</p>}>
										<GuestRankings sessionToken={guest.session_token} />
									</Suspense>
								)}
				</section>
			</main>
		</div>
	)
}