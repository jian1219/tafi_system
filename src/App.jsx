import { useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import AccountantLogin from './Pages/Accountant/Accountant_login'
import AdminLogin from './Pages/Admin_2/Admin_2_login'
import BranchAdminLogin from './Pages/Branch_admin/Branch_admin_login'
import BranchAdminDashboard from './Pages/Branch_admin/Branch_admin_dashboard'
import logoImage from './images/Tafi logo transparent.png'
import './App.css'

const roles = [
  {
    name: 'Accountant',
    path: '/accountant-login',
    description: 'Manage finance, invoices, and budget tracking.'
  },
  {
    name: 'Admin',
    path: '/admin-2-login',
    description: 'Oversee system access, settings, and operations.'
  },
  {
    name: 'Branch Admin',
    path: '/branch-admin-login',
    description: 'Coordinate branch activity and team performance.'
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
          {roles.map((role) => (
            <button
              key={role.name}
              type="button"
              className={`role-card ${selectedRole === role.name ? 'selected' : ''}`}
              onClick={() => handleSelectRole(role)}
            >
              <span className="role-name">{role.name}</span>
              <span className="role-description">{role.description}</span>
            </button>
          ))}
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
        <Route path="/admin-2-login" element={<AdminLogin />} />
        <Route path="/branch-admin-login" element={<BranchAdminLogin />} />
        <Route path="/branch-admin-dashboard" element={<BranchAdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
