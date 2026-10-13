import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CircleDollarSign, LogOut, PlusCircle, ShieldCheck, Users, Wallet } from 'lucide-react'
import { revokeTafiAdminSession } from '../../lib/supabase'
import TafiEmployee from './TAFI_Employee'
import TafiEmployeeContributions from './TAFI_Employee_Contributions'
import TafiEmployeeAttendance from './TAFI_Employee_Attendance'
import TafiBranchPayroll from './TAFI_Branch_Payroll'
const TafiOtherAdditionPay = lazy(() => import('./TAFI_Other_Addition_Pay'))
import logoImage from '../../images/Tafi logo transparent.png'

const navigationItems = [
	{ id: 'employees', label: 'Employee', icon: Users },
	{ id: 'attendance', label: 'Employee Attendance', icon: CalendarDays },
	{ id: 'contributions', label: 'Mandatory Contributions', icon: CircleDollarSign },
	{ id: 'other-additions', label: 'Other Addition Pay', icon: PlusCircle },
	{ id: 'payroll', label: 'Branch Payroll', icon: Wallet }
]

export default function TafiDashboard() {
	const location = useLocation()
	const navigate = useNavigate()
	const tafiAdmin = location.state?.tafiAdmin
	const [activePage, setActivePage] = useState('employees')
	const [signOutError, setSignOutError] = useState('')

	if (!tafiAdmin) return <Navigate to="/tafi-admin-login" replace />

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
					<img src={logoImage} alt="TAFI logo" />
					<div>
						<strong>TAFI Admin</strong>
						<span>System administration</span>
					</div>
				</div>

				<p className="tafi-admin-nav-label">Management</p>
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
							: activePage === 'contributions'
								? <TafiEmployeeContributions sessionToken={tafiAdmin.session_token} />
								: activePage === 'other-additions'
									? (
										<Suspense fallback={<p className="other-deduction-message" role="status">Loading payroll addition tools…</p>}>
											<TafiOtherAdditionPay sessionToken={tafiAdmin.session_token} />
										</Suspense>
									)
									: <TafiBranchPayroll sessionToken={tafiAdmin.session_token} />}
				</section>
			</main>
		</div>
	)
}
