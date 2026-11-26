import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, LockKeyhole, ScanLine, UserRound } from 'lucide-react'
import { verifyBranchAdminCredentials } from '../../../lib/supabase'
import logoImage from '../../../images/Tafi logo transparent.png'

const scannerSessionStorageKey = 'tafi-counter-scanner-session'

export default function CounterScannerLogin() {
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
      return
    }
    if (!profile) {
      setLoginMessage('Email or password is incorrect.')
      return
    }
    if (!profile.session_token) {
      setLoginMessage('Branch login did not return a session token. Try again or contact your administrator.')
      return
    }

    try {
      window.sessionStorage.setItem(scannerSessionStorageKey, JSON.stringify(profile))
    } catch (storageError) {
      console.error('Unable to persist the Counter Scanner session.', storageError)
    }
    navigate('/counter-scanner-dashboard', { state: { branchAdmin: profile } })
  }

  return (
    <div className="login-page role-login-page">
      <aside className="brand-panel role-login-brand">
        <div className="brand-badge">
          <img src={logoImage} alt="Triton ACCE Food Inc. logo" className="brand-logo" />
        </div>
        <div className="login-brand-message">
          <p className="eyebrow">TRITON ACCE FOOD INC. · COUNTER SCANNER</p>
          <h1>Ready at the counter.</h1>
          <p className="brand-copy">
            Sign in with your branch email and password to open the Counter Scanner workspace.
          </p>
        </div>
        <p className="brand-reserve">One workspace. Every team in sync.</p>
      </aside>

      <main className="login-main">
        <section className="login-panel role-login-panel">
          <p className="role-tag admin-role-tag">
            <ScanLine size={16} aria-hidden="true" />
            Counter Scanner
          </p>
          <h2>Welcome back</h2>
          <p className="login-description">Sign in using your branch account.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="counter-scanner-email">Branch email</label>
              <div className="login-input-wrap">
                <UserRound className="login-input-icon" size={18} aria-hidden="true" />
                <input
                  id="counter-scanner-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter branch email"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="counter-scanner-password">Password</label>
              <div className="login-input-wrap">
                <LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
                <input
                  id="counter-scanner-password"
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
              {isSubmitting ? 'Signing in…' : 'Login'}
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