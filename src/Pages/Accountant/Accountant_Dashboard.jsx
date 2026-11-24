import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Barcode, Calculator, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Package, Receipt, Wallet } from 'lucide-react'
import {
	listAccountantBranchCDJEntries,
	listAccountantInventoryBranches,
	revokeAccountantSession
} from '../../lib/supabase'
import useSessionStorageState from '../../lib/useSessionStorageState'
import useRoleSessionExpiry from '../../lib/useRoleSessionExpiry'
import logoImage from '../../images/Tafi logo transparent.png'
import AccountantBarcode from './Accountant_Barcode'
import AccountantBranchStockRecords from './Accountant_Branch_Stock_records'
import AccountantBranchStockCard from './Accountant_Branch_Stock_Card'
import AccountantTafiCDJ from './Accountant_TAFI_cdj'
import AccountantInventoryInformation from './Accountant_Inventory_Information'
import AccountantInventoryLog from './Accountant_Inventory_log'
import AccountantInventoryTransferForm from './Accountant_Inventory_Transfer_Form'
import AccountantBranchCDJ from './Accountant_Branch_cdj'
import AccountantAPSubsidiaryLedger from './Accountant_AP_Subsidiary_ledger'
import TafiOverviewAnalytics from '../TAFI_Admin/TAFI_Overview_Analytics'
const AccountantSales = lazy(() => import('./Accountant_Sales'))

const overviewNavigationItem = { id: 'overview', label: 'Overview', icon: LayoutDashboard }
const inventoryNavigationGroup = {
	id: 'inventory',
	label: 'Inventory',
	items: [
		{ id: 'inventory', label: 'Inventory Information', icon: Package },
		{ id: 'barcode', label: 'TAFI Inventory', icon: Barcode },
		{ id: 'inventory-log', label: 'Branch Usage Log', icon: ClipboardList },
		{ id: 'inventory-transform', label: 'Inventory Transfer Form Records', icon: ClipboardList },
		{ id: 'branch-stock-records', label: 'Branch Stock Records', icon: Package },
		{ id: 'branch-stock-card', label: 'Branch Stock Card', icon: ClipboardList }
	]
}
const salesNavigationGroup = {
	id: 'sales',
	label: 'Sales',
	items: [
		{ id: 'sales-crj', label: 'Cash Receipts Journal', icon: Receipt },
		{ id: 'sales-deposit', label: 'Deposit', icon: Wallet },
		{ id: 'sales-transactions', label: 'Transactions', icon: ClipboardList },
		{ id: 'sales-discounts', label: 'Discounts', icon: Receipt },
		{ id: 'sales-summary', label: 'Summary', icon: ClipboardList }
	]
}
const expenseNavigationGroup = {
	id: 'expense',
	label: 'Expense',
	items: [
		{ id: 'tafi-cdj', label: 'TAFI CDJ', icon: Receipt },
		{ id: 'branch-cdj', label: 'Branch CDJ', icon: Receipt },
		{ id: 'ap-subsidiary-ledger', label: 'AP Subsidiary Ledger', icon: Receipt }
	]
}
const dashboardPages = [
	overviewNavigationItem.id,
	...inventoryNavigationGroup.items.map((item) => item.id),
	...salesNavigationGroup.items.map((item) => item.id),
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
	const [isSalesExpanded, setIsSalesExpanded] = useState(() => (
		salesNavigationGroup.items.some((item) => item.id === activePage)
	))
	const [selectedSalesBranchId, setSelectedSalesBranchId] = useState('')

	const navigateToPage = (page) => {
		setActivePage(page)
		if (inventoryNavigationGroup.items.some((item) => item.id === page)) {
			setIsInventoryExpanded(true)
		}
		if (expenseNavigationGroup.items.some((item) => item.id === page)) {
			setIsExpenseExpanded(true)
		}
		if (salesNavigationGroup.items.some((item) => item.id === page)) {
			setIsSalesExpanded(true)
		}
	}

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
							className={`tafi-admin-nav-group-toggle${salesNavigationGroup.items.some((item) => item.id === activePage) ? ' has-active' : ''}`}
							aria-expanded={isSalesExpanded}
							aria-controls="accountant-sales-nav-items"
							onClick={() => setIsSalesExpanded((expanded) => !expanded)}
						>
							<span>{salesNavigationGroup.label}</span>
							<ChevronDown size={16} aria-hidden="true" />
						</button>
						<div
							className="tafi-admin-nav-group-items"
							id="accountant-sales-nav-items"
							role="group"
							aria-label={salesNavigationGroup.label}
							hidden={!isSalesExpanded}
						>
							{salesNavigationGroup.items.map(({ id, label, icon: Icon }) => (
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
							{activePage === 'ap-subsidiary-ledger'
								? 'AP Subsidiary Ledger'
								: activePage === 'branch-cdj'
								? 'Branch Cash Disbursement Journal'
								: activePage === 'tafi-cdj'
									? 'TAFI CDJ'
								: activePage === 'inventory'
								? 'Inventory Information'
								: activePage === 'inventory-log'
									? 'Branch Usage Log'
								: activePage === 'inventory-transform'
									? 'Inventory Transfer Form Records'
								: activePage === 'barcode'
									? 'TAFI Inventory'
										: activePage === 'branch-stock-card'
											? 'Branch Stock Card'
										: activePage === 'branch-stock-records'
											? 'Branch Stock Records'
											: activePage === 'sales-crj'
												? 'Cash Receipts Journal'
												: activePage === 'sales-deposit'
													? 'Deposit'
													: activePage === 'sales-transactions'
														? 'Transactions'
														: activePage === 'sales-discounts'
															? 'Discounts'
															: activePage === 'sales-summary'
																? 'Summary'
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
						<TafiOverviewAnalytics
							sessionToken={sessionToken}
							roleLabel="Accountant"
							hideTafiHeadOffice
							listBranches={listAccountantInventoryBranches}
							listExpenseEntries={listAccountantBranchCDJEntries}
						/>
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
					{activePage === 'branch-stock-card' && (
						<AccountantBranchStockCard sessionToken={sessionToken} />
					)}
					{activePage === 'branch-cdj' && (
						<AccountantBranchCDJ sessionToken={accountant.session_token} />
					)}
					{activePage === 'tafi-cdj' && (
						<AccountantTafiCDJ sessionToken={accountant.session_token} />
					)}
					{activePage === 'ap-subsidiary-ledger' && (
						<AccountantAPSubsidiaryLedger sessionToken={accountant.session_token} />
					)}
					{salesNavigationGroup.items.some((item) => item.id === activePage) && (
						<Suspense fallback={<p className="cash-advance-message" role="status">Loading Sales tools...</p>}>
							<AccountantSales
								sessionToken={sessionToken}
								section={activePage}
								selectedBranchId={selectedSalesBranchId}
								onSelectedBranchChange={setSelectedSalesBranchId}
							/>
						</Suspense>
					)}
				</section>
			</main>
		</div>
	)
}