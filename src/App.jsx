import { useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ArrowRight, Calculator, Crown, ShieldCheck, Store, UserRound } from 'lucide-react'
import AccountantLogin from './Pages/Accountant/Accountant_login'
import AccountantDashboard from './Pages/Accountant/Accountant_Dashboard'
import AdminLogin from './Pages/TAFI_Admin/TAFI_Admin_login'
import TafiDashboard from './Pages/TAFI_Admin/TAFI_Dashboard'
import BranchAdminLogin from './Pages/Branch_admin/Branch_admin_login'
import BranchAdminDashboard from './Pages/Branch_admin/Branch_admin_dashboard'
import GuestLogin from './Pages/Owner/Guest_login'
import GuestDashboard from './Pages/Owner/Guest_Dashboard'
import SuperAdminLogin from './Pages/Super_Admin/Super_Admin'
import SuperAdminDashboard from './Pages/Super_Admin/Super_Admin_Dashboard'
import logoImage from './images/Tafi logo transparent.png'
import './App.css'

import Pause from './Pages/Pause'

const roles = [
  {
    name: 'TAFI Accountant',
    path: '/accountant-login',
    icon: Calculator,
    description: 'Manage finance, invoices, budget tracking, and Inventory tracking.'
  },
  {
    name: 'TAFI Admin',
    path: '/tafi-admin-login',
    icon: ShieldCheck,
    description: 'Oversee branch operations, administration, and inventory tracking.'
  },
  {
    name: 'Branch Admin',
    path: '/branch-admin-login',
    icon: Store,
    description: 'Coordinate branch operations and team performance.'
  },
  {
    name: 'Owner',
    path: '/guest-login',
    icon: UserRound,
    description: 'Sign in to your Owner workspace.'
  }
]

function Home() {
  const [selectedRole, setSelectedRole] = useState('')
  const navigate = useNavigate()

  const handleSelectRole = (role) => {
    setSelectedRole(role.name)
    navigate(role.path)
  }

  return (
    <div className="home-page">
      <aside className="brand-panel">
        <div className="brand-badge">
          <img src={logoImage} alt="Triton ACCE Food Inc. logo" className="brand-logo" />
        </div>
        <div className="home-brand-message">
          <p className="eyebrow">TRITON ACCE FOOD INC.</p>
          <h2>One workspace.<br />Every team in sync.</h2>
          <p className="brand-copy">
            A connected hub for the people and operations that keep your business moving.
          </p>
        </div>
        <p className="brand-reserve">A better way to work, together.</p>
      </aside>

      <main className="workspace-main">
        <div className="workspace-content">
          <header className="workspace-header">
            <div className="workspace-header-label">
              <span className="workspace-status-dot" />
              Company workspace
            </div>
            <span className="workspace-header-note">Secure team access</span>
          </header>

          <section className="workspace-welcome" aria-labelledby="workspace-title">
            <p className="workspace-kicker">WELCOME</p>
            <h1 id="workspace-title">Choose your workspace</h1>
            <p>Sign in to the space that matches your role and responsibilities.</p>
          </section>

          <section className="role-panel" aria-labelledby="role-panel-title">
            <div className="role-panel-heading">
              <div>
                <h2 className="role-title" id="role-panel-title">Continue as</h2>
                <p className="role-subtitle">Select a team workspace to sign in.</p>
              </div>
              <span className="role-count">04 WORKSPACES</span>
            </div>

            <div className="role-list">
              {roles.map((role) => {
                const RoleIcon = role.icon
                return (
                  <button
                    key={role.name}
                    type="button"
                    className={`role-card ${selectedRole === role.name ? 'selected' : ''}`}
                    onClick={() => handleSelectRole(role)}
                  >
                    <span className="role-heading">
                      <span className="role-icon"><RoleIcon size={21} aria-hidden="true" /></span>
                      <span className="role-name">{role.name}</span>
                      <ArrowRight className="role-arrow" size={19} aria-hidden="true" />
                    </span>
                    <span className="role-description">{role.description}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <footer className="workspace-footer">
            <span>© 2026 Triton ACCE Food Inc.</span>
            <span><ShieldCheck size={16} aria-hidden="true" /> Authorized team members only</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/accountant-login" element={<AccountantLogin />} />
        <Route path="/accountant-dashboard" element={<AccountantDashboard />} />
        <Route path="/tafi-admin-login" element={<AdminLogin />} />
        <Route path="/tafi-dashboard" element={<TafiDashboard />} />
        <Route path="/branch-admin-login" element={<BranchAdminLogin />} />
        <Route path="/guest-login" element={<GuestLogin />} />
        <Route path="/guest-dashboard" element={<GuestDashboard />} />
        <Route path="/super-admin-login" element={<SuperAdminLogin />} />
        <Route path="/branch-admin-dashboard" element={<BranchAdminDashboard />} />
        <Route path="/super-admin-dashboard" element={<SuperAdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
