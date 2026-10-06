import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Crown, LockKeyhole, UserRound } from 'lucide-react'
import { verifySuperAdminCredentials } from '../../lib/supabase'
import logoImage from '../../images/Tafi logo transparent.png'

export default function SuperAdminLogin() {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loginNotice, setLoginNotice] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const navigate = useNavigate()

	const handleSubmit = async (event) => {
		event.preventDefault()
		setLoginNotice('')
		setIsSubmitting(true)
		const { profile, error } = await verifySuperAdminCredentials(email, password)
		setIsSubmitting(false)
		if (error) {
			setLoginNotice(error.message)
			return
		}
		if (!profile) {
			setLoginNotice('Email or password is incorrect.')
			return
		}
		navigate('/super-admin-dashboard', { state: { email: profile.user_email } })
	}

	return (
		<div className="login-page">
			<div className="brand-panel">
				<div className="brand-badge">
					<img src={logoImage} alt="TAFI logo" className="brand-logo" />
				</div>
				<p className="eyebrow">Company administration</p>
				<h1>TAFI</h1>
				<p className="brand-copy">
					Manage company-wide access, administration, and operations.
				</p>
			</div>

			<div className="login-panel">
				<p className="role-tag admin-role-tag">
					<Crown size={16} aria-hidden="true" />
					Super Admin
				</p>
				<h2>Login</h2>

				<form className="login-form" onSubmit={handleSubmit}>
					<div className="input-group">
						<label htmlFor="super-admin-email">Email</label>
						<div className="login-input-wrap">
							<UserRound className="login-input-icon" size={18} aria-hidden="true" />
							<input
								id="super-admin-email"
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="Enter email"
								autoComplete="email"
								required
							/>
						</div>
					</div>

					<div className="input-group">
						<label htmlFor="super-admin-password">Password</label>
						<div className="login-input-wrap">
							<LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
							<input
								id="super-admin-password"
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder="Enter password"
								autoComplete="current-password"
								required
							/>
						</div>
					</div>

					<button type="submit" className="login-button">
						{isSubmitting ? 'Signing in...' : 'Login'}
						<ArrowRight size={18} aria-hidden="true" />
					</button>
					{loginNotice && <p className="login-notice" role="status">{loginNotice}</p>}
				</form>

				<Link to="/" className="back-link">
					← Back to role selection
				</Link>
			</div>
		</div>
	)
}
