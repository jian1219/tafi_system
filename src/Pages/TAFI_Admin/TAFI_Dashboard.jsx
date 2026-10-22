import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronDown, CircleDollarSign, ClipboardList, LogOut, MinusCircle, Package, PlusCircle, ShieldCheck, Trophy, Users, Wallet } from 'lucide-react'
import { revokeTafiAdminSession } from '../../lib/supabase'
import useRoleSessionExpiry from '../../lib/useRoleSessionExpiry'
import TafiEmployee from './TAFI_Employee'
import TafiEmployeeContributions from './TAFI_Employee_Contributions'
import TafiEmployeeAttendance from './TAFI_Employee_Attendance'
import TafiLeaveCredits from './TAFI_Leave_Credits'
import TafiBranchPayroll from './TAFI_Branch_Payroll'
const TafiOtherAdditionPay = lazy(() => import('./TAFI_Other_Addition_Pay'))
const TafiOtherDeductionPay = lazy(() => import('./TAFI_Other_Deduction_Pay'))
const TafiCashAdvance = lazy(() => import('./TAFI_Cash_Advance'))
const TafiRankings = lazy(() => import('./TAFI_Rankings'))
const TafiInventory = lazy(() => import('./TAFI_Inventory'))
const TafiStockInventory = lazy(() => import('./TAFI_Stock_Inventory'))
const TafiRequestStockOrder = lazy(() => import('./TAFI_Request_Stock_Order'))
const TafiInventoryLog = lazy(() => import('./TAFI_Inventory_log'))
import logoImage from '../../images/Tafi logo transparent.png'

const navigationGroups = [
	{
		id: 'employee-management',
		label: 'Employee Management',
		items: [
			{ id: 'employees', label: 'Employee', icon: Users },
			{ id: 'attendance', label: 'Employee Attendance', icon: CalendarDays },
			{ id: 'rankings', label: 'Employee Rankings', icon: Trophy },
			{ id: 'leave-credits', label: 'Leave Credits', icon: PlusCircle }
		]
	},
	{
		id: 'payroll-finance',
		label: 'Payroll & Finance',
		items: [
			{ id: 'contributions', label: 'Mandatory Contributions', icon: CircleDollarSign },
			{ id: 'other-additions', label: 'Other Addition Pay', icon: PlusCircle },
			{ id: 'other-deductions', label: 'Other Deduction Pay', icon: MinusCircle },
			{ id: 'cash-advance', label: 'Cash Advance', icon: CircleDollarSign },
			{ id: 'payroll', label: 'Branch Payroll', icon: Wallet }
		]
	},
	{
		id: 'inventory',
		label: 'Inventory',
		items: [
			{ id: 'inventory', label: 'Inventory Information', icon: Package },
			{ id: 'stock-inventory', label: 'Stock Inventory', icon: Package },
			{ id: 'stock-requests', label: 'Stock Requests', icon: ClipboardList },
			{ id: 'inventory-log', label: 'Branch Usage Log', icon: ClipboardList }
		]
	}
]
const navigationItems = navigationGroups.flatMap((group) => group.items)

export default function TafiDashboard() {
	const location = useLocation()
	const navigate = useNavigate()
	const tafiAdmin = location.state?.tafiAdmin
	const isSessionActive = useRoleSessionExpiry(tafiAdmin, '/tafi-admin-login')
	const [activePage, setActivePage] = useState('employees')
	const [expandedGroups, setExpandedGroups] = useState({ 'employee-management': true })
	const [signOutError, setSignOutError] = useState('')

	if (!isSessionActive) return <Navigate to="/tafi-admin-login" replace />

	const handleSignOut = async (event) => {
		event.preventDefault()
		const { error } = await revokeTafiAdminSession(tafiAdmin.session_token)
		if (error) {
			setSignOutError(error.message)
			return
		}
		navigate('/')
	}

	return (
		<div className="tafi-admin-layout">
			<aside className="tafi-admin-sidebar">
				<div className="tafi-admin-sidebar-brand">
					<img src={logoImage} alt="Triton ACCE Food Inc. logo" />
					<div>
						<strong>TAFI Admin</strong>
						<span>System administration</span>
					</div>
				</div>

				<p className="tafi-admin-nav-label">Workspace</p>
				<nav className="tafi-admin-nav" aria-label="Dashboard sections">
					{navigationGroups.map((group) => {
						const isExpanded = Boolean(expandedGroups[group.id])
						const containsActivePage = group.items.some((item) => item.id === activePage)
						const groupItemsId = `tafi-admin-nav-group-${group.id}`
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
											onClick={() => {
												setActivePage(id)
												setExpandedGroups((current) => ({ ...current, [group.id]: true }))
											}}
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
					<span>{tafiAdmin.admin_name}</span>
					<Link to="/" className="tafi-admin-signout" onClick={handleSignOut}>
						<LogOut size={17} aria-hidden="true" />
						Sign out
					</Link>
					{signOutError && <span role="alert">{signOutError}</span>}
				</div>
			</aside>

			<main className="tafi-admin-main">
				<header className="tafi-admin-page-header">
					<div>
						<p className="eyebrow">TAFI Admin workspace</p>
						<h1>{navigationItems.find((item) => item.id === activePage)?.label}</h1>
					</div>
					<div className="tafi-admin-account">
						<ShieldCheck size={18} aria-hidden="true" />
						<span>{tafiAdmin.admin_email}</span>
					</div>
				</header>

				<section className="tafi-admin-content" aria-live="polite">
					{activePage === 'employees'
						? <TafiEmployee sessionToken={tafiAdmin.session_token} />
						: activePage === 'attendance'
							? <TafiEmployeeAttendance sessionToken={tafiAdmin.session_token} />
							: activePage === 'rankings'
								? (
									<Suspense fallback={<p className="other-deduction-message" role="status">Loading employee rankings…</p>}>
										<TafiRankings sessionToken={tafiAdmin.session_token} />
									</Suspense>
								)
							: activePage === 'leave-credits'
								? <TafiLeaveCredits sessionToken={tafiAdmin.session_token} />
								: activePage === 'contributions'
									? <TafiEmployeeContributions sessionToken={tafiAdmin.session_token} />
								: activePage === 'inventory'
								? (
								<Suspense fallback={<p className="other-deduction-message" role="status">Loading inventory tools…</p>}>
									<TafiInventory sessionToken={tafiAdmin.session_token} />
								</Suspense>
								)
								: activePage === 'stock-inventory'
									? (
										<Suspense fallback={<p className="other-deduction-message" role="status">Loading stock inventory...</p>}>
											<TafiStockInventory sessionToken={tafiAdmin.session_token} />
										</Suspense>
									)
									: activePage === 'stock-requests'
										? (
											<Suspense fallback={<p className="other-deduction-message" role="status">Loading stock requests...</p>}>
												<TafiRequestStockOrder sessionToken={tafiAdmin.session_token} />
											</Suspense>
										)
										: activePage === 'inventory-log'
											? (
												<Suspense fallback={<p className="other-deduction-message" role="status">Loading branch usage log...</p>}>
													<TafiInventoryLog sessionToken={tafiAdmin.session_token} />
												</Suspense>
											)
								: activePage === 'other-additions'
									? (
										<Suspense fallback={<p className="other-deduction-message" role="status">Loading payroll addition tools…</p>}>
											<TafiOtherAdditionPay sessionToken={tafiAdmin.session_token} />
										</Suspense>
										)
										: activePage === 'other-deductions'
											? (
											<Suspense fallback={<p className="other-deduction-message" role="status">Loading payroll deduction tools…</p>}>
												<TafiOtherDeductionPay sessionToken={tafiAdmin.session_token} />
											</Suspense>
											)
											: activePage === 'cash-advance'
												? (
												<Suspense fallback={<p className="cash-advance-message" role="status">Loading cash advance tools…</p>}>
													<TafiCashAdvance sessionToken={tafiAdmin.session_token} />
												</Suspense>
												)
											: <TafiBranchPayroll sessionToken={tafiAdmin.session_token} />}
				</section>
			</main>
		</div>
	)
}
