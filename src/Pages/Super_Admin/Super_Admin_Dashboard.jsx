import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Building2, Calculator, Crown, LogOut, Plus, ShieldCheck, UserRound } from 'lucide-react'
import { createAccountant, createBranchWithAdmin, createGuestAccount, createTafiAdmin, listAccountants, listGuestAccounts, listSuperAdminBranches, listTafiAdmins } from '../../lib/supabase'
import useSessionStorageState from '../../lib/useSessionStorageState'
import logoImage from '../../images/Tafi logo transparent.png'

const managementSections = [
	{
		id: 'branch-admins',
		label: 'Branch Administrator',
		description: 'Create branches and manage their Branch Admin accounts.',
		countLabel: 'branches',
		icon: Building2
	},
	{
		id: 'accountants',
		label: 'TAFI Accountant',
		description: 'Create and review TAFI Accountant accounts.',
		countLabel: 'accounts',
		icon: Calculator
	},
	{
		id: 'tafi-admins',
		label: 'TAFI Admin',
		description: 'Create and review TAFI Admin accounts.',
		countLabel: 'accounts',
		icon: ShieldCheck
	},
	{
		id: 'guest-accounts',
		label: 'Guest Account',
		description: 'Create and review Guest account records. Guest sign-in is not enabled.',
		countLabel: 'accounts',
		icon: UserRound
	}
]

export default function SuperAdminDashboard() {
	const location = useLocation()
	const [superAdminEmail, setSuperAdminEmail] = useState(location.state?.email ?? '')
	const [superAdminPassword, setSuperAdminPassword] = useState('')
	const [activeSection, setActiveSection] = useSessionStorageState(
		'tafi-super-admin-dashboard-section',
		'branch-admins',
		managementSections.map((section) => section.id)
	)
	const [branches, setBranches] = useState([])
	const [isAuthorized, setIsAuthorized] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [notice, setNotice] = useState('')
	const [noticeType, setNoticeType] = useState('')
	const [branchName, setBranchName] = useState('')
	const [branchLocation, setBranchLocation] = useState('')
	const [adminName, setAdminName] = useState('')
	const [adminEmail, setAdminEmail] = useState('')
	const [adminPassword, setAdminPassword] = useState('')
	const [tafiAdmins, setTafiAdmins] = useState([])
	const [tafiAdminName, setTafiAdminName] = useState('')
	const [tafiAdminEmail, setTafiAdminEmail] = useState('')
	const [tafiAdminPassword, setTafiAdminPassword] = useState('')
	const [accountants, setAccountants] = useState([])
	const [accountantName, setAccountantName] = useState('')
	const [accountantEmail, setAccountantEmail] = useState('')
	const [accountantPassword, setAccountantPassword] = useState('')
	const [guestAccounts, setGuestAccounts] = useState([])
	const [guestName, setGuestName] = useState('')
	const [guestEmail, setGuestEmail] = useState('')
	const [guestPassword, setGuestPassword] = useState('')

	const loadBranches = async (event) => {
		event.preventDefault()
		setIsLoading(true)
		setNotice('')
		const { data, error } = await listSuperAdminBranches(superAdminEmail, superAdminPassword)
		const [adminsResult, accountantsResult, guestAccountsResult] = error
			? [{ data: null }, { data: null }, { data: null }]
			: await Promise.all([
				listTafiAdmins(superAdminEmail, superAdminPassword),
				listAccountants(superAdminEmail, superAdminPassword),
				listGuestAccounts(superAdminEmail, superAdminPassword)
			])
		setIsLoading(false)

		if (error) {
			setIsAuthorized(false)
			setBranches([])
			setTafiAdmins([])
			setAccountants([])
			setGuestAccounts([])
			setNotice(error.message)
			setNoticeType('error')
			return
		}

		setIsAuthorized(true)
		setBranches(data ?? [])
		setTafiAdmins(adminsResult.data ?? [])
		setAccountants(accountantsResult.data ?? [])
		setGuestAccounts(guestAccountsResult.data ?? [])
		const accountError = adminsResult.error || accountantsResult.error || guestAccountsResult.error
		setNotice(accountError
			? `Super Admin verified, but account lists could not be loaded: ${accountError.message}`
			: 'Super Admin verified. Management is unlocked for this page session.')
		setNoticeType(accountError ? 'error' : 'success')
	}

	const addBranch = async (event) => {
		event.preventDefault()
		setIsLoading(true)
		setNotice('')
		const { error } = await createBranchWithAdmin({
			superAdminEmail,
			superAdminPassword,
			branchName,
			branchLocation,
			adminName,
			adminEmail,
			adminPassword
		})

		if (error) {
			setIsLoading(false)
			setNotice(error.message)
			setNoticeType('error')
			return
		}

		const { data, error: refreshError } = await listSuperAdminBranches(superAdminEmail, superAdminPassword)
		setIsLoading(false)
		if (!refreshError) setBranches(data ?? [])
		setBranchName('')
		setBranchLocation('')
		setAdminName('')
		setAdminEmail('')
		setAdminPassword('')
		setNotice(refreshError
			? 'Branch and Branch Admin were created. Reload the branch list to view them.'
			: 'Branch and Branch Admin created successfully.')
		setNoticeType('success')
	}

	const addTafiAdmin = async (event) => {
		event.preventDefault()
		setIsLoading(true)
		setNotice('')
		const { error } = await createTafiAdmin({
			superAdminEmail,
			superAdminPassword,
			adminName: tafiAdminName,
			adminEmail: tafiAdminEmail,
			adminPassword: tafiAdminPassword
		})

		if (error) {
			setIsLoading(false)
			setNotice(error.message)
			setNoticeType('error')
			return
		}

		const { data, error: refreshError } = await listTafiAdmins(superAdminEmail, superAdminPassword)
		setIsLoading(false)
		if (!refreshError) setTafiAdmins(data ?? [])
		setTafiAdminName('')
		setTafiAdminEmail('')
		setTafiAdminPassword('')
		setNotice('TAFI Admin account created successfully.')
		setNoticeType('success')
	}

	const addAccountant = async (event) => {
		event.preventDefault()
		setIsLoading(true)
		setNotice('')
		const { error } = await createAccountant({
			superAdminEmail,
			superAdminPassword,
			accountantName,
			accountantEmail,
			accountantPassword
		})

		if (error) {
			setIsLoading(false)
			setNotice(error.message)
			setNoticeType('error')
			return
		}

		const { data, error: refreshError } = await listAccountants(superAdminEmail, superAdminPassword)
		setIsLoading(false)
		if (!refreshError) setAccountants(data ?? [])
		setAccountantName('')
		setAccountantEmail('')
		setAccountantPassword('')
		setNotice(refreshError
			? 'Accountant account created. Reload the account list to view it.'
			: 'TAFI Accountant account created successfully.')
		setNoticeType('success')
	}

	const addGuestAccount = async (event) => {
		event.preventDefault()
		setIsLoading(true)
		setNotice('')
		const { error } = await createGuestAccount({
			superAdminEmail,
			superAdminPassword,
			guestName,
			guestEmail,
			guestPassword
		})

		if (error) {
			setIsLoading(false)
			setNotice(error.message)
			setNoticeType('error')
			return
		}

		const { data, error: refreshError } = await listGuestAccounts(superAdminEmail, superAdminPassword)
		setIsLoading(false)
		if (!refreshError) setGuestAccounts(data ?? [])
		setGuestName('')
		setGuestEmail('')
		setGuestPassword('')
		setNotice(refreshError
			? `Guest account created, but the list could not be refreshed: ${refreshError.message}`
			: 'Guest account created successfully.')
		setNoticeType(refreshError ? 'error' : 'success')
	}

	const activeManagementSection = managementSections.find((section) =>
		section.id === activeSection
	) ?? managementSections[0]
	const sectionCounts = {
		'branch-admins': branches.length,
		accountants: accountants.length,
		'tafi-admins': tafiAdmins.length,
		'guest-accounts': guestAccounts.length
	}

	return (
		<div className="dashboard-page super-admin-dashboard-page">
			<main className="super-admin-dashboard">
				<header className="super-admin-dashboard-header">
					<div className="super-admin-dashboard-brand">
						<img src={logoImage} alt="TAFI logo" />
						<div>
							<p className="eyebrow">Company administration</p>
							<h1>Super Admin Dashboard</h1>
						</div>
					</div>
					<Link to="/" className="super-admin-signout">
						<LogOut size={17} aria-hidden="true" />
						Sign out
					</Link>
				</header>

				<section className="super-admin-welcome">
					<span className="super-admin-welcome-icon"><Crown size={24} aria-hidden="true" /></span>
					<div>
						<h2>{isAuthorized ? 'Administrator management' : 'Super Admin access'}</h2>
						<p>
							{isAuthorized
								? 'Choose a sidebar section to manage branch, accountant, or TAFI Admin accounts.'
								: 'Verify your credentials to manage branches and administrator accounts.'}
						</p>
					</div>
				</section>

				<form className="super-admin-verify-form" onSubmit={loadBranches}>
					<div>
						<h2>Verify administrator</h2>
						<p>Enter your Super Admin credentials to load and manage branches.</p>
					</div>
					<label>
						<span>Super Admin email</span>
						<input
							type="email"
							value={superAdminEmail}
							onChange={(event) => setSuperAdminEmail(event.target.value)}
							autoComplete="username"
							required
						/>
					</label>
					<label>
						<span>Super Admin password</span>
						<input
							type="password"
							value={superAdminPassword}
							onChange={(event) => setSuperAdminPassword(event.target.value)}
							autoComplete="current-password"
							required
						/>
					</label>
					<button type="submit" className="super-admin-action-button" disabled={isLoading}>
						{isLoading ? 'Verifying...' : 'Verify and load branches'}
					</button>
				</form>

				{notice && <p className={`super-admin-notice ${noticeType}`} role="status">{notice}</p>}

				{isAuthorized && (
					<div className="super-admin-workspace">
						<aside className="super-admin-management-sidebar">
							<div className="super-admin-sidebar-heading">
								<p>Management</p>
								<h2>Administrator accounts</h2>
							</div>
							<nav className="super-admin-section-nav" aria-label="Administrator management">
								{managementSections.map((section) => {
									const Icon = section.icon
									const count = sectionCounts[section.id]
									const countLabel = section.id === 'branch-admins'
										? count === 1 ? 'branch' : section.countLabel
										: count === 1 ? 'account' : section.countLabel
									return (
										<button
											key={section.id}
											type="button"
											className={`super-admin-section-nav-item${activeSection === section.id ? ' active' : ''}`}
											aria-current={activeSection === section.id ? 'page' : undefined}
											onClick={() => setActiveSection(section.id)}
										>
											<span className="super-admin-section-nav-icon">
												<Icon size={19} aria-hidden="true" />
											</span>
											<span className="super-admin-section-nav-copy">
												<strong>{section.label}</strong>
												<small>{count} {countLabel}</small>
											</span>
										</button>
									)
								})}
							</nav>
						</aside>

						<section className="super-admin-workspace-content" aria-labelledby="super-admin-section-title">
							<header className="super-admin-workspace-heading">
								<p className="eyebrow">Account management</p>
								<h2 id="super-admin-section-title">{activeManagementSection.label}</h2>
								<p>{activeManagementSection.description}</p>
							</header>

							<div className="super-admin-section-panels">
								{activeSection === 'branch-admins' && (
									<>
										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<Building2 size={19} aria-hidden="true" />
												<div>
													<h2>Add branch and administrator</h2>
													<p>Each new branch is created with one Branch Admin account.</p>
												</div>
											</div>

											<form className="super-admin-branch-form" onSubmit={addBranch}>
												<label>
													<span>Branch name</span>
													<input value={branchName} onChange={(event) => setBranchName(event.target.value)} required />
												</label>
												<label>
													<span>Branch location</span>
													<input value={branchLocation} onChange={(event) => setBranchLocation(event.target.value)} placeholder="City or address" />
												</label>
												<div className="super-admin-form-divider">
													<ShieldCheck size={17} aria-hidden="true" />
													<span>Branch Admin account</span>
												</div>
												<label>
													<span>Admin name</span>
													<input value={adminName} onChange={(event) => setAdminName(event.target.value)} required />
												</label>
												<label>
													<span>Admin email</span>
													<input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} autoComplete="off" required />
												</label>
												<label className="super-admin-full-width">
													<span>Temporary password (minimum 8 characters)</span>
													<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} minLength="8" autoComplete="new-password" required />
												</label>
												<button type="submit" className="super-admin-action-button super-admin-full-width" disabled={isLoading}>
													<Plus size={17} aria-hidden="true" />
													{isLoading ? 'Creating...' : 'Create branch and admin'}
												</button>
											</form>
										</section>

										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<Building2 size={19} aria-hidden="true" />
												<div>
													<h2>Branches</h2>
													<p>{branches.length} branch{branches.length === 1 ? '' : 'es'} registered</p>
												</div>
											</div>
											{branches.length ? (
												<div className="super-admin-branch-list">
													{branches.map((branch) => (
														<article className="super-admin-branch-item" key={branch.branch_id}>
															<div>
																<strong>{branch.branch_name}</strong>
																<span>{branch.branch_location || 'Location not provided'}</span>
															</div>
															<div>
																<strong>{branch.admin_name || 'Admin not assigned'}</strong>
																<span>{branch.admin_email || ''}</span>
															</div>
														</article>
													))}
												</div>
											) : (
												<p className="super-admin-empty-state">No branches have been created yet.</p>
											)}
										</section>
									</>
								)}

								{activeSection === 'accountants' && (
									<>
										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<Calculator size={19} aria-hidden="true" />
												<div>
													<h2>Create TAFI Accountant</h2>
													<p>Add an Accountant with a name, email, and password.</p>
												</div>
											</div>

											<form className="super-admin-branch-form" onSubmit={addAccountant}>
												<label>
													<span>Name</span>
													<input value={accountantName} onChange={(event) => setAccountantName(event.target.value)} autoComplete="name" required />
												</label>
												<label>
													<span>Email</span>
													<input type="email" value={accountantEmail} onChange={(event) => setAccountantEmail(event.target.value)} autoComplete="off" required />
												</label>
												<label className="super-admin-full-width">
													<span>Password (minimum 8 characters)</span>
													<input type="password" value={accountantPassword} onChange={(event) => setAccountantPassword(event.target.value)} minLength="8" autoComplete="new-password" required />
												</label>
												<button type="submit" className="super-admin-action-button super-admin-full-width" disabled={isLoading}>
													<Plus size={17} aria-hidden="true" />
													{isLoading ? 'Creating...' : 'Create TAFI Accountant'}
												</button>
											</form>
										</section>

										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<Calculator size={19} aria-hidden="true" />
												<div>
													<h2>TAFI Accountants</h2>
													<p>{accountants.length} account{accountants.length === 1 ? '' : 's'} registered</p>
												</div>
											</div>
											{accountants.length ? (
												<div className="super-admin-branch-list">
													{accountants.map((accountant) => (
														<article className="super-admin-branch-item" key={accountant.accountant_id}>
															<div>
																<strong>{accountant.accountant_name}</strong>
																<span>{accountant.accountant_email}</span>
															</div>
														</article>
													))}
												</div>
											) : (
												<p className="super-admin-empty-state">No TAFI Accountant accounts have been created yet.</p>
											)}
										</section>
									</>
								)}

								{activeSection === 'tafi-admins' && (
									<>
										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<ShieldCheck size={19} aria-hidden="true" />
												<div>
													<h2>Create TAFI Admin account</h2>
													<p>Add a new TAFI Admin with a name, email, and password.</p>
												</div>
											</div>

											<form className="super-admin-branch-form" onSubmit={addTafiAdmin}>
												<label>
													<span>Name</span>
													<input value={tafiAdminName} onChange={(event) => setTafiAdminName(event.target.value)} required />
												</label>
												<label>
													<span>Email</span>
													<input type="email" value={tafiAdminEmail} onChange={(event) => setTafiAdminEmail(event.target.value)} autoComplete="off" required />
												</label>
												<label className="super-admin-full-width">
													<span>Password (minimum 8 characters)</span>
													<input type="password" value={tafiAdminPassword} onChange={(event) => setTafiAdminPassword(event.target.value)} minLength="8" autoComplete="new-password" required />
												</label>
												<button type="submit" className="super-admin-action-button super-admin-full-width" disabled={isLoading}>
													<Plus size={17} aria-hidden="true" />
													{isLoading ? 'Creating...' : 'Create TAFI Admin'}
												</button>
											</form>
										</section>

										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<ShieldCheck size={19} aria-hidden="true" />
												<div>
													<h2>TAFI Admins</h2>
													<p>{tafiAdmins.length} account{tafiAdmins.length === 1 ? '' : 's'} registered</p>
												</div>
											</div>
											{tafiAdmins.length ? (
												<div className="super-admin-branch-list">
													{tafiAdmins.map((admin) => (
														<article className="super-admin-branch-item" key={admin.admin_id}>
															<div>
																<strong>{admin.admin_name}</strong>
																<span>{admin.admin_email}</span>
															</div>
														</article>
													))}
												</div>
											) : (
												<p className="super-admin-empty-state">No TAFI Admin accounts have been created yet.</p>
											)}
										</section>
									</>
								)}

								{activeSection === 'guest-accounts' && (
									<>
										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<UserRound size={19} aria-hidden="true" />
												<div>
													<h2>Create Guest account</h2>
													<p>Create a Guest account record with a name, email, and password.</p>
												</div>
											</div>

											<form className="super-admin-branch-form" onSubmit={addGuestAccount}>
												<label>
													<span>Name</span>
													<input value={guestName} onChange={(event) => setGuestName(event.target.value)} autoComplete="name" required />
												</label>
												<label>
													<span>Email</span>
													<input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} autoComplete="off" required />
												</label>
												<label className="super-admin-full-width">
													<span>Password (minimum 8 characters)</span>
													<input type="password" value={guestPassword} onChange={(event) => setGuestPassword(event.target.value)} minLength="8" autoComplete="new-password" required />
												</label>
												<button type="submit" className="super-admin-action-button super-admin-full-width" disabled={isLoading}>
													<Plus size={17} aria-hidden="true" />
													{isLoading ? 'Creating...' : 'Create Guest account'}
												</button>
											</form>
										</section>

										<section className="super-admin-management-panel">
											<div className="super-admin-panel-heading">
												<UserRound size={19} aria-hidden="true" />
												<div>
													<h2>Guest accounts</h2>
													<p>{guestAccounts.length} account{guestAccounts.length === 1 ? '' : 's'} registered</p>
												</div>
											</div>
											{guestAccounts.length ? (
												<div className="super-admin-branch-list">
													{guestAccounts.map((guestAccount) => (
														<article className="super-admin-branch-item" key={guestAccount.guest_account_id}>
															<div>
																<strong>{guestAccount.guest_name}</strong>
																<span>{guestAccount.guest_email}</span>
															</div>
														</article>
													))}
												</div>
											) : (
												<p className="super-admin-empty-state">No Guest accounts have been created yet.</p>
											)}
										</section>
									</>
								)}
							</div>
						</section>
					</div>
				)}
			</main>
		</div>
	)
}
