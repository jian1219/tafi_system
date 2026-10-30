import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Barcode, Calculator, ClipboardList, LayoutDashboard, LogOut, Package } from 'lucide-react'
import { listAccountantTafiStockInventory, revokeAccountantSession } from '../../lib/supabase'
import useSessionStorageState from '../../lib/useSessionStorageState'
import useRoleSessionExpiry from '../../lib/useRoleSessionExpiry'
import logoImage from '../../images/Tafi logo transparent.png'
import AccountantBarcode from './Accountant_Barcode'
import AccountantInventoryInformation from './Accountant_Inventory_Information'
import AccountantInventoryLog from './Accountant_Inventory_log'

export default function AccountantDashboard() {
	const location = useLocation()
	const navigate = useNavigate()
	const accountant = location.state?.accountant
	const sessionToken = accountant?.session_token
	const isSessionActive = useRoleSessionExpiry(accountant, '/accountant-login')
	const [signOutError, setSignOutError] = useState('')
	const [activePage, setActivePage] = useSessionStorageState(
		'tafi-accountant-dashboard-page',
		'overview',
		['overview', 'inventory', 'inventory-log', 'barcode']
	)
	const [noAvailableStockCount, setNoAvailableStockCount] = useState(null)
	const [isLoadingNoAvailableStockCount, setIsLoadingNoAvailableStockCount] = useState(false)
	const [noAvailableStockCountError, setNoAvailableStockCountError] = useState('')

	useEffect(() => {
		if (activePage !== 'overview' || !sessionToken) return undefined

		let isCurrent = true
		const loadNoAvailableStockCount = async () => {
			setIsLoadingNoAvailableStockCount(true)
			setNoAvailableStockCountError('')
			const { data, error } = await listAccountantTafiStockInventory(sessionToken)
			if (!isCurrent) return

			setIsLoadingNoAvailableStockCount(false)
			if (error) {
				setNoAvailableStockCount(null)
				setNoAvailableStockCountError(error.message)
				return
			}

			setNoAvailableStockCount(
				(data ?? []).filter((item) => Number(item.available) === 0).length
			)
		}

		loadNoAvailableStockCount()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, activePage])

	if (!isSessionActive) return <Navigate to="/accountant-login" replace />

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
					<button
						type="button"
						className={`tafi-admin-nav-item${activePage === 'inventory-log' ? ' active' : ''}`}
						aria-current={activePage === 'inventory-log' ? 'page' : undefined}
						onClick={() => setActivePage('inventory-log')}
					>
						<ClipboardList size={19} aria-hidden="true" />
						<span>Branch Usage Log</span>
					</button>
					<button
						type="button"
						className={`tafi-admin-nav-item${activePage === 'barcode' ? ' active' : ''}`}
						aria-current={activePage === 'barcode' ? 'page' : undefined}
						onClick={() => setActivePage('barcode')}
					>
						<Barcode size={19} aria-hidden="true" />
						<span>Barcode Inventory</span>
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
						<h1>
							{activePage === 'inventory'
								? 'Inventory Information'
								: activePage === 'inventory-log'
									? 'Branch Usage Log'
									: activePage === 'barcode'
										? 'Barcode Inventory'
										: 'Accountant Dashboard'}
						</h1>
					</div>
					<div className="tafi-admin-account">
						<Calculator size={18} aria-hidden="true" />
						<span>{accountant.accountant_email}</span>
					</div>
				</header>

				<section className="tafi-admin-content" aria-live="polite">
					{activePage === 'overview' && (
						<div className="accountant-overview">
							<article className="accountant-overview-card" aria-labelledby="accountant-no-stock-title">
								<div>
									<p>TAFI Stock</p>
									<h2 id="accountant-no-stock-title">No available stock</h2>
									<span>Items with Available quantity of 0</span>
								</div>
								{isLoadingNoAvailableStockCount ? (
									<strong className="accountant-overview-count" role="status">…</strong>
								) : noAvailableStockCountError ? (
									<p className="accountant-inventory-error" role="alert">
										{noAvailableStockCountError}
									</p>
								) : (
									<strong className="accountant-overview-count">
										{noAvailableStockCount ?? 0}
									</strong>
								)}
							</article>
						</div>
					)}
					{activePage === 'inventory' && (
						<AccountantInventoryInformation sessionToken={accountant.session_token} />
					)}
					{activePage === 'inventory-log' && (
						<AccountantInventoryLog sessionToken={accountant.session_token} />
					)}
					{activePage === 'barcode' && (
						<AccountantBarcode sessionToken={accountant.session_token} />
					)}
				</section>
			</main>
		</div>
	)
}