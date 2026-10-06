import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoImage from '../../images/Tafi logo transparent.png'

export default function BranchAdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (event) => {
    event.preventDefault()
    if (username.trim() && password.trim()) {
      navigate('/branch-admin-dashboard')
    }
  }

  return (
    <div className="login-page">
      <div className="brand-panel">
        <div className="brand-badge">
          <img src={logoImage} alt="TAFI logo" className="brand-logo" />
        </div>
        <p className="eyebrow">Branch operations</p>
        <h1>TAFI</h1>
        <p className="brand-copy">
          Track branch performance, staff activity, and operational coordination.
        </p>
      </div>

      <div className="login-panel">
        <p className="role-tag">Branch Admin</p>
        <h2>Login</h2>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="branch-admin-username">Username</label>
            <input
              id="branch-admin-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
            />
          </div>

          <div className="input-group">
            <label htmlFor="branch-admin-password">Password</label>
            <input
              id="branch-admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </div>

          <button type="submit" className="login-button">
            Login
          </button>
        </form>

        <Link to="/" className="back-link">
          ← Back to role selection
        </Link>
      </div>
    </div>
  )
}
