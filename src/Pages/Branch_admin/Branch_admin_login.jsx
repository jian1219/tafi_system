import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, LockKeyhole, Store, UserRound } from 'lucide-react'
import { verifyBranchAdminCredentials } from '../../lib/supabase'
import logoImage from '../../images/Tafi logo transparent.png'

export default function BranchAdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoginMessage('')
    setIsSubmitting(true)
    const { profile, error } = await verifyBranchAdminCredentials(email, password)
    setIsSubmitting(false)

    if (error) {
      setLoginMessage(error.message)
    } else if (!profile) {
      setLoginMessage('Email or password is incorrect.')
    } else if (!profile.session_token) {
      setLoginMessage('Branch login did not return a session token. Apply the updated branch login SQL, then try again.')
    } else {
      try {
        window.sessionStorage.setItem('tafi-branch-admin-session', JSON.stringify(profile))
      } catch {
        // The route state still carries the profile when session storage is unavailable.
      }
      navigate('/branch-admin-dashboard', { state: { branchAdmin: profile } })
    }
  }

  return (
    <div className="login-page role-login-page">
      <aside className="brand-panel role-login-brand">
        <div className="brand-badge">
          <img src={logoImage} alt="Triton ACCE Food Inc. logo" className="brand-logo" />
        </div>
        <div className="login-brand-message">
          <p className="eyebrow">TRITON ACCE FOOD INC. · BRANCH OPERATIONS</p>
          <h1>Your branch, in view.</h1>
          <p className="brand-copy">
            Keep daily attendance, team activity, and branch operations moving together.
          </p>
        </div>
        <p className="brand-reserve">One workspace. Every team in sync.</p>
      </aside>

      <main className="login-main">
        <section className="login-panel role-login-panel">
        <p className="role-tag admin-role-tag">
          <Store size={16} aria-hidden="true" />
          Branch Admin
        </p>
        <h2>Welcome back</h2>
        <p className="login-description">Sign in to manage your branch workspace.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="branch-admin-email">Email</label>
            <div className="login-input-wrap">
              <UserRound className="login-input-icon" size={18} aria-hidden="true" />
              <input
                id="branch-admin-email"
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
            <label htmlFor="branch-admin-password">Password</label>
            <div className="login-input-wrap">
              <LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
              <input
                id="branch-admin-password"
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
