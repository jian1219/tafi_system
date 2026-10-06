import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { signInWithEmailPassword } from '../../lib/supabase'
import logoImage from '../../images/Tafi logo transparent.png'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoginMessage('')
    setIsSubmitting(true)
    const { error } = await signInWithEmailPassword(email, password)
    setIsSubmitting(false)
    setLoginMessage(error
      ? error.message
      : 'Signed in successfully. The TAFI Admin workspace is not configured yet.')
  }

  return (
    <div className="login-page">
      <div className="brand-panel">
        <div className="brand-badge">
          <img src={logoImage} alt="TAFI logo" className="brand-logo" />
        </div>
        <p className="eyebrow">System administration</p>
        <h1>TAFI</h1>
        <p className="brand-copy">
          Manage team permissions, platform settings, and core system operations.
        </p>
      </div>

      <div className="login-panel">
        <p className="role-tag admin-role-tag">
          <ShieldCheck size={16} aria-hidden="true" />
          TAFI Admin
        </p>
        <h2>Login</h2>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="admin-email">Email</label>
            <div className="login-input-wrap">
              <UserRound className="login-input-icon" size={18} aria-hidden="true" />
              <input
                id="admin-email"
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
            <label htmlFor="admin-password">Password</label>
            <div className="login-input-wrap">
              <LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
              <input
                id="admin-password"
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
      </div>
    </div>
  )
}
