import { lazy, Suspense, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronDown, CircleDollarSign, ClipboardList, LayoutDashboard, LogOut, Receipt, ShieldCheck, Trophy, Users, Wallet } from 'lucide-react'
import { revokeGuestSession } from '../../lib/supabase'
import useSessionStorageState from '../../lib/useSessionStorageState'
import useRoleSessionExpiry from '../../lib/useRoleSessionExpiry'
import GuestOverview from './Guest_Overview'
import GuestEmployee from './Guest_Employee'
import GuestAttendance from './Guest_Attendance'
const GuestRankings = lazy(() => import('./Guest_Rankings'))
const GuestCashAdvance = lazy(() => import('./Guest_Cash_Advance'))
const GuestBranchPayroll = lazy(() => import('./Guest_Branch_Payroll'))
const GuestMandatoryContributions = lazy(() => import('./Guest_Mandatory_Contributions'))
const GuestSales = lazy(() => import('./Guest_Sales'))
const GuestExpense = lazy(() => import('./Guest_Expense'))
import logoImage from '../../images/Tafi logo transparent.png'

const overviewNavigationItem = { id: 'overview', label: 'Overview', icon: LayoutDashboard }
const navigationGroups = [
	{
		id: 'employee-management',
		label: 'Employee Management',
		items: [
			{ id: 'employee', label: 'Employee', icon: Users },
			{ id: 'attendance', label: 'Employee Attendance', icon: CalendarDays },
			{ id: 'rankings', label: 'Employee Rankings', icon: Trophy }
		]
	},
	{
		id: 'payroll-finance',
		label: 'Payroll & Finance',
		items: [
			{ id: 'contributions', label: 'Mandatory Contributions', icon: CircleDollarSign },
			{ id: 'cash-advance', label: 'Cash Advance', icon: CircleDollarSign },
			{ id: 'payroll', label: 'Branch Payroll', icon: Wallet }
		]
	},
	{
		id: 'sales',
		label: 'Sales',
		items: [
			{ id: 'sales-crj', label: 'Cash Receipts Journal', icon: Receipt },
			{ id: 'sales-deposit', label: 'Deposit', icon: Wallet },
			{ id: 'sales-transactions', label: 'Transactions', icon: ClipboardList },
			{ id: 'sales-discounts', label: 'Discounts', icon: Receipt },
			{ id: 'sales-summary', label: 'Summary', icon: ClipboardList }
		]
	},
	{
		id: 'expense',
		label: 'Expense',
		items: [
			{ id: 'branch-cdj', label: 'Branch CDJ', icon: Receipt },
			{ id: 'tafi-cdj', label: 'TAFI CDJ', icon: Receipt },
			{ id: 'ap-subsidiary-ledger', label: 'AP Subsidiary Ledger', icon: ClipboardList }
		]
	}
]
const navigationItems = [overviewNavigationItem, ...navigationGroups.flatMap((group) => group.items)]

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
	const [expandedGroups, setExpandedGroups] = useState(() => {
		const activeGroup = navigationGroups.find((group) =>
			group.items.some((item) => item.id === activePage)
		)
		return { [activeGroup?.id ?? 'employee-management']: true }
	})
	const [signOutError, setSignOutError] = useState('')
	const [isSigningOut, setIsSigningOut] = useState(false)

	if (!isSessionActive) return <Navigate to="/guest-login" replace />

	const navigateToPage = (id) => {
		setActivePage(id)
		const activeGroup = navigationGroups.find((group) =>
			group.items.some((item) => item.id === id)
		)
		if (activeGroup) {
			setExpandedGroups((current) => ({ ...current, [activeGroup.id]: true }))
		}
	}

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
					<button
						type="button"
						className={`tafi-admin-nav-item${activePage === overviewNavigationItem.id ? ' active' : ''}`}
						aria-current={activePage === overviewNavigationItem.id ? 'page' : undefined}
						onClick={() => navigateToPage(overviewNavigationItem.id)}
					>
						<LayoutDashboard size={19} aria-hidden="true" />
						<span>{overviewNavigationItem.label}</span>
					</button>
					{navigationGroups.map((group) => {
						const isExpanded = Boolean(expandedGroups[group.id])
						const containsActivePage = group.items.some((item) => item.id === activePage)
						const groupItemsId = `guest-nav-group-${group.id}`
						return (
							<div className="tafi-admin-nav-group" key={group.id}>
								<button
									type="button"
									className={`tafi-admin-nav-group-toggle${containsActivePage ? ' has-active' : ''}`}
									aria-expanded={isExpanded}
									aria-controls={groupItemsId}
									onClick={() => setExpandedGroups((current) => ({
										...current,
										[group.id]: !current[group.id]
									}))}
								>
									<span>{group.label}</span>
									<ChevronDown size={16} aria-hidden="true" />
								</button>
								<div
									className="tafi-admin-nav-group-items"
									id={groupItemsId}
									role="group"
									aria-label={group.label}
									hidden={!isExpanded}
								>
									{group.items.map(({ id, label, icon: Icon }) => (
										<button
											key={id}
											type="button"
											className={`tafi-admin-nav-item${activePage === id ? ' active' : ''}`}
											aria-current={activePage === id ? 'page' : undefined}
											onClick={() => navigateToPage(id)}
										>
											<Icon size={19} aria-hidden="true" />
											<span>{label}</span>
										</button>
									))}
								</div>
							</div>
						)
					})}
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
						? <GuestOverview sessionToken={guest.session_token} />
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
											: activePage === 'contributions'
												? (
													<Suspense fallback={<p className="contribution-message" role="status">Loading mandatory contributions…</p>}>
														<GuestMandatoryContributions sessionToken={guest.session_token} />
													</Suspense>
												)
												: ['sales-crj', 'sales-deposit', 'sales-transactions', 'sales-discounts', 'sales-summary'].includes(activePage)
													? (
														<Suspense fallback={<p className="cash-advance-message" role="status">Loading sales records…</p>}>
															<GuestSales sessionToken={guest.session_token} section={activePage} />
														</Suspense>
													)
													: ['branch-cdj', 'tafi-cdj', 'ap-subsidiary-ledger'].includes(activePage)
														? (
															<Suspense fallback={<p className="cash-advance-message" role="status">Loading expense records…</p>}>
																<GuestExpense sessionToken={guest.session_token} section={activePage} />
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