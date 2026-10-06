import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Building2, Crown, LogOut, Plus, ShieldCheck } from 'lucide-react'
import { createBranchWithAdmin, listSuperAdminBranches } from '../../lib/supabase'
import logoImage from '../../images/Tafi logo transparent.png'

export default function SuperAdminDashboard() {
	const location = useLocation()
	const [superAdminEmail, setSuperAdminEmail] = useState(location.state?.email ?? '')
	const [superAdminPassword, setSuperAdminPassword] = useState('')
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

	const loadBranches = async (event) => {
		event.preventDefault()
		setIsLoading(true)
		setNotice('')
		const { data, error } = await listSuperAdminBranches(superAdminEmail, superAdminPassword)
		setIsLoading(false)

		if (error) {
			setIsAuthorized(false)
			setBranches([])
			setNotice(error.message)
			setNoticeType('error')
			return
		}

		setIsAuthorized(true)
		setBranches(data ?? [])
		setNotice('Super Admin verified. Branch management is unlocked for this page session.')
		setNoticeType('success')
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
						<h2>Branch management</h2>
						<p>Create branches and assign one Branch Admin to each.</p>
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
					<div className="super-admin-management-grid">
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
					</div>
				)}
			</main>
		</div>
	)
}
