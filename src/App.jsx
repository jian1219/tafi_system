import { useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ArrowRight, Calculator, Crown, ShieldCheck, Store } from 'lucide-react'
import AccountantLogin from './Pages/Accountant/Accountant_login'
import AdminLogin from './Pages/TAFI_Admin/TAFI_Admin_login'
import BranchAdminLogin from './Pages/Branch_admin/Branch_admin_login'
import BranchAdminDashboard from './Pages/Branch_admin/Branch_admin_dashboard'
import SuperAdminLogin from './Pages/Super_Admin/Super_Admin'
import SuperAdminDashboard from './Pages/Super_Admin/Super_Admin_Dashboard'
import logoImage from './images/Tafi logo transparent.png'
import './App.css'

const roles = [
  {
    name: 'Accountant',
    path: '/accountant-login',
    icon: Calculator,
    description: 'Manage finance, invoices, and budget tracking.'
  },
  {
    name: 'TAFI Admin',
    path: '/tafi-admin-login',
    icon: ShieldCheck,
    description: 'Oversee system access, settings, and operations.'
  },
  {
    name: 'Branch Admin',
    path: '/branch-admin-login',
    icon: Store,
    description: 'Coordinate branch activity and team performance.'
  },
  {
    name: 'Super Admin',
    path: '/super-admin-login',
    icon: Crown,
    description: 'Manage company-wide access and administration.'
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
      <div className="brand-panel">
        <div className="brand-badge">
          <img src={logoImage} alt="TAFI logo" className="brand-logo" />
        </div>
        <p className="eyebrow">Workspace portal</p>
        <h1>TAFI</h1>
        <p className="brand-copy">
          Select your role to access the responsibilities assigned to your team.
        </p>
        <p className="brand-reserve">2026 Reserve • Triton ACCE Food Inc.</p>
      </div>

      <div className="role-panel">
        <p className="role-title">Login as</p>

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
                  <span className="role-icon"><RoleIcon size={20} aria-hidden="true" /></span>
                  <span className="role-name">{role.name}</span>
                  <ArrowRight className="role-arrow" size={18} aria-hidden="true" />
                </span>
                <span className="role-description">{role.description}</span>
              </button>
            )
          })}
        </div>

      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/accountant-login" element={<AccountantLogin />} />
        <Route path="/tafi-admin-login" element={<AdminLogin />} />
        <Route path="/branch-admin-login" element={<BranchAdminLogin />} />
        <Route path="/super-admin-login" element={<SuperAdminLogin />} />
        <Route path="/branch-admin-dashboard" element={<BranchAdminDashboard />} />
        <Route path="/super-admin-dashboard" element={<SuperAdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
