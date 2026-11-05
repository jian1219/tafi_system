import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Barcode, Calculator, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Package, Receipt } from 'lucide-react'
import { listAccountantTafiStockInventory, revokeAccountantSession } from '../../lib/supabase'
import useSessionStorageState from '../../lib/useSessionStorageState'
import useRoleSessionExpiry from '../../lib/useRoleSessionExpiry'
import logoImage from '../../images/Tafi logo transparent.png'
import AccountantBarcode from './Accountant_Barcode'
import AccountantBranchStockRecords from './Accountant_Branch_Stock_records'
import AccountantTafiCDJ from './Accountant_TAFI_cdj'
import AccountantInventoryInformation from './Accountant_Inventory_Information'
import AccountantInventoryLog from './Accountant_Inventory_log'
import AccountantInventoryTransferForm from './Accountant_Inventory_Transfer_Form'
import AccountantBranchCDJ from './Accountant_Branch_cdj'

const overviewNavigationItem = { id: 'overview', label: 'Overview', icon: LayoutDashboard }
const inventoryNavigationGroup = {
	id: 'inventory',
	label: 'Inventory',
	items: [
		{ id: 'inventory', label: 'Inventory Information', icon: Package },
		{ id: 'barcode', label: 'TAFI Inventory', icon: Barcode },
		{ id: 'inventory-log', label: 'Branch Usage Log', icon: ClipboardList },
		{ id: 'inventory-transform', label: 'Inventory Transform Records', icon: ClipboardList },
		{ id: 'branch-stock-records', label: 'Branch Stock Records', icon: Package }
	]
}
const expenseNavigationGroup = {
	id: 'expense',
	label: 'Expense',
	items: [
		{ id: 'tafi-cdj', label: 'TAFI CDJ', icon: Receipt },
		{ id: 'branch-cdj', label: 'Branch CDJ', icon: Receipt }
	]
}
const dashboardPages = [
	overviewNavigationItem.id,
	...inventoryNavigationGroup.items.map((item) => item.id),
	...expenseNavigationGroup.items.map((item) => item.id)
]

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
		dashboardPages
	)
	const [isInventoryExpanded, setIsInventoryExpanded] = useState(() => (
		inventoryNavigationGroup.items.some((item) => item.id === activePage)
	))
	const [isExpenseExpanded, setIsExpenseExpanded] = useState(() => (
		expenseNavigationGroup.items.some((item) => item.id === activePage)
	))
	const [noAvailableStockCount, setNoAvailableStockCount] = useState(null)
	const [isLoadingNoAvailableStockCount, setIsLoadingNoAvailableStockCount] = useState(false)
	const [noAvailableStockCountError, setNoAvailableStockCountError] = useState('')

	const navigateToPage = (page) => {
		setActivePage(page)
		if (inventoryNavigationGroup.items.some((item) => item.id === page)) {
			setIsInventoryExpanded(true)
		}
		if (expenseNavigationGroup.items.some((item) => item.id === page)) {
			setIsExpenseExpanded(true)
		}
	}

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
						className={`tafi-admin-nav-item${activePage === overviewNavigationItem.id ? ' active' : ''}`}
						aria-current={activePage === overviewNavigationItem.id ? 'page' : undefined}
						onClick={() => navigateToPage(overviewNavigationItem.id)}
					>
						<LayoutDashboard size={19} aria-hidden="true" />
						<span>{overviewNavigationItem.label}</span>
					</button>
					<div className="tafi-admin-nav-group">
						<button
							type="button"
							className={`tafi-admin-nav-group-toggle${inventoryNavigationGroup.items.some((item) => item.id === activePage) ? ' has-active' : ''}`}
							aria-expanded={isInventoryExpanded}
							aria-controls="accountant-inventory-nav-items"
							onClick={() => setIsInventoryExpanded((expanded) => !expanded)}
						>
							<span>{inventoryNavigationGroup.label}</span>
							<ChevronDown size={16} aria-hidden="true" />
						</button>
						<div
							className="tafi-admin-nav-group-items"
							id="accountant-inventory-nav-items"
							role="group"
							aria-label={inventoryNavigationGroup.label}
							hidden={!isInventoryExpanded}
						>
							{inventoryNavigationGroup.items.map(({ id, label, icon: Icon }) => (
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
					<div className="tafi-admin-nav-group">
						<button
							type="button"
							className={`tafi-admin-nav-group-toggle${expenseNavigationGroup.items.some((item) => item.id === activePage) ? ' has-active' : ''}`}
							aria-expanded={isExpenseExpanded}
							aria-controls="accountant-expense-nav-items"
							onClick={() => setIsExpenseExpanded((expanded) => !expanded)}
						>
							<span>{expenseNavigationGroup.label}</span>
							<ChevronDown size={16} aria-hidden="true" />
						</button>
						<div
							className="tafi-admin-nav-group-items"
							id="accountant-expense-nav-items"
							role="group"
							aria-label={expenseNavigationGroup.label}
							hidden={!isExpenseExpanded}
						>
							{expenseNavigationGroup.items.map(({ id, label, icon: Icon }) => (
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
							{activePage === 'branch-cdj'
								? 'Branch Cash Disbursement Journal'
								: activePage === 'tafi-cdj'
									? 'TAFI CDJ'
								: activePage === 'inventory'
								? 'Inventory Information'
								: activePage === 'inventory-log'
									? 'Branch Usage Log'
								: activePage === 'inventory-transform'
									? 'Inventory Transform Records'
								: activePage === 'barcode'
									? 'TAFI Inventory'
										: activePage === 'branch-stock-records'
											? 'Branch Stock Records'
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
					{activePage === 'inventory-transform' && (
						<AccountantInventoryTransferForm sessionToken={accountant.session_token} />
					)}
					{activePage === 'barcode' && (
						<AccountantBarcode sessionToken={accountant.session_token} />
					)}
					{activePage === 'branch-stock-records' && (
						<AccountantBranchStockRecords />
					)}
					{activePage === 'branch-cdj' && (
						<AccountantBranchCDJ sessionToken={accountant.session_token} />
					)}
					{activePage === 'tafi-cdj' && (
						<AccountantTafiCDJ sessionToken={accountant.session_token} />
					)}
				</section>
			</main>
		</div>
	)
}