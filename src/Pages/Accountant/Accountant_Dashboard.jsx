import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Calculator, LayoutDashboard, LogOut, Package } from 'lucide-react'
import { revokeAccountantSession } from '../../lib/supabase'
import logoImage from '../../images/Tafi logo transparent.png'
import AccountantInventoryInformation from './Accountant_Inventory_Information'

export default function AccountantDashboard() {
	const location = useLocation()
	const navigate = useNavigate()
	const accountant = location.state?.accountant
	const [signOutError, setSignOutError] = useState('')
	const [activePage, setActivePage] = useState('overview')

	if (!accountant) return <Navigate to="/accountant-login" replace />

	const handleSignOut = async (event) => {
		event.preventDefault()
		const { error } = await revokeAccountantSession(accountant.session_token)
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
						<strong>TAFI Accountant</strong>
						<span>Finance workspace</span>
					</div>
				</div>

				<p className="tafi-admin-nav-label">Workspace</p>
				<nav className="tafi-admin-nav" aria-label="Dashboard sections">
					<button
						type="button"
						className={`tafi-admin-nav-item${activePage === 'overview' ? ' active' : ''}`}
						aria-current={activePage === 'overview' ? 'page' : undefined}
						onClick={() => setActivePage('overview')}
					>
						<LayoutDashboard size={19} aria-hidden="true" />
						<span>Overview</span>
					</button>
					<button
						type="button"
						className={`tafi-admin-nav-item${activePage === 'inventory' ? ' active' : ''}`}
						aria-current={activePage === 'inventory' ? 'page' : undefined}
						onClick={() => setActivePage('inventory')}
					>
						<Package size={19} aria-hidden="true" />
						<span>Inventory Information</span>
					</button>
				</nav>

				<div className="tafi-admin-sidebar-footer">
					<span>{accountant.accountant_name}</span>
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
						<p className="eyebrow">TAFI Accountant workspace</p>
						<h1>{activePage === 'inventory' ? 'Inventory Information' : 'Accountant Dashboard'}</h1>
					</div>
					<div className="tafi-admin-account">
						<Calculator size={18} aria-hidden="true" />
						<span>{accountant.accountant_email}</span>
					</div>
				</header>

				<section className="tafi-admin-content" aria-live="polite">
					{activePage === 'inventory' && (
						<AccountantInventoryInformation sessionToken={accountant.session_token} />
					)}
				</section>
			</main>
		</div>
	)
}