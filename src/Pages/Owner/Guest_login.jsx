import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, LockKeyhole, UserRound } from 'lucide-react'
import { verifyGuestCredentials } from '../../lib/supabase'
import logoImage from '../../images/Tafi logo transparent.png'

export default function GuestLogin() {
	const navigate = useNavigate()
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loginMessage, setLoginMessage] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)

	const handleSubmit = async (event) => {
		event.preventDefault()
		setLoginMessage('')
		setIsSubmitting(true)
		const { profile, error } = await verifyGuestCredentials(email, password)
		setIsSubmitting(false)
		if (error || !profile) {
			setLoginMessage(error ? error.message : 'Invalid email or password.')
			return
		}

		navigate('/guest-dashboard', { state: { guest: profile } })
	}

	return (
		<div className="login-page role-login-page guest-login-page">
			<aside className="brand-panel role-login-brand">
				<div className="brand-badge">
					<img src={logoImage} alt="Triton ACCE Food Inc. logo" className="brand-logo" />
				</div>
				<div className="login-brand-message">
					<p className="eyebrow">TRITON ACCE FOOD INC. · GUEST ACCESS</p>
					<h1>A simple, secure way to access your Guest workspace.</h1>
					<p className="brand-copy">
						Sign in with the Guest account credentials provided to you.
					</p>
				</div>
				<p className="brand-reserve">Welcome to the company workspace.</p>
			</aside>

			<main className="login-main">
				<section className="login-panel role-login-panel">
					<p className="role-tag admin-role-tag">
						<UserRound size={16} aria-hidden="true" />
						Guest
					</p>
					<h2>Welcome</h2>
					<p className="login-description">Enter your Guest account credentials to continue.</p>

					<form className="login-form" onSubmit={handleSubmit}>
						<div className="input-group">
							<label htmlFor="guest-email">Email</label>
							<div className="login-input-wrap">
								<UserRound className="login-input-icon" size={18} aria-hidden="true" />
								<input
									id="guest-email"
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
							<label htmlFor="guest-password">Password</label>
							<div className="login-input-wrap">
								<LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
								<input
									id="guest-password"
									type="password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									placeholder="Enter password"
									autoComplete="current-password"
									required
								/>
							</div>
						</div>

						<button type="submit" className="login-button" disabled={isSubmitting}>
							{isSubmitting ? 'Signing in...' : 'Sign in'}
							<ArrowRight size={18} aria-hidden="true" />
						</button>
						{loginMessage && <p className="login-notice error" role="alert">{loginMessage}</p>}
					</form>

					<Link to="/" className="back-link">
						← Back to role selection
					</Link>
				</section>
			</main>
		</div>
	)
}