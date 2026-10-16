import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Calculator, LockKeyhole, UserRound } from 'lucide-react'
import { verifyAccountantCredentials } from '../../lib/supabase'
import logoImage from '../../images/Tafi logo transparent.png'

export default function AccountantLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoginMessage('')
    setIsSubmitting(true)
    const { profile, error } = await verifyAccountantCredentials(email, password)
    setIsSubmitting(false)
    if (error || !profile) {
      setLoginMessage(error ? error.message : 'Email or password is incorrect.')
      return
    }

    navigate('/accountant-dashboard', { state: { accountant: profile } })
  }

  return (
    <div className="login-page role-login-page">
      <aside className="brand-panel role-login-brand">
        <div className="brand-badge">
          <img src={logoImage} alt="Triton ACCE Food Inc. logo" className="brand-logo" />
        </div>
        <div className="login-brand-message">
          <p className="eyebrow">TRITON ACCE FOOD INC. · FINANCE</p>
          <h1>Clarity for every number.</h1>
          <p className="brand-copy">
            Bring accounting records, approvals, and financial operations into focus.
          </p>
        </div>
        <p className="brand-reserve">One workspace. Every team in sync.</p>
      </aside>

      <main className="login-main">
        <section className="login-panel role-login-panel">
        <p className="role-tag admin-role-tag">
          <Calculator size={16} aria-hidden="true" />
          Accountant
        </p>
        <h2>Welcome back</h2>
        <p className="login-description">Sign in to your finance workspace.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="accountant-email">Email</label>
            <div className="login-input-wrap">
              <UserRound className="login-input-icon" size={18} aria-hidden="true" />
              <input
                id="accountant-email"
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
            <label htmlFor="accountant-password">Password</label>
            <div className="login-input-wrap">
              <LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
              <input
                id="accountant-password"
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
          {loginMessage && (
            <p className={`login-notice ${loginMessage.startsWith('Signed in') ? 'success' : 'error'}`} role="status">
              {loginMessage}
            </p>
          )}
        </form>

        <Link to="/" className="back-link">
          ← Back to role selection
        </Link>
        </section>
      </main>
    </div>
  )
}
