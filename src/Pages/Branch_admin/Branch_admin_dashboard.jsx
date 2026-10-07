import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import logoImage from '../../images/Tafi logo transparent.png'
import BranchAdminEmployee from './Branch_admin_employee'
import BranchAttendanceMonitoring from './Branch_attendance_monitoring'
import BranchPayroll from './Branch_Payroll'
import BranchReport from './Branch_report'
import BranchMandatoryContributionEmployee from './Branch_Mandatory_contribution_employee'
import BranchCashAdvance from './Branch_Cash_advance'
import BranchOtherDeduction from './Branch_Other_deduction'
import BranchOtherAdditionPay from './Branch_Other_Addition_pay'
import { revokeBranchAdminSession } from '../../lib/supabase'

const tabs = [
  { name: 'Employee Info', component: BranchAdminEmployee },
  { name: 'Attendance monitoring', component: BranchAttendanceMonitoring },
  { name: 'Mandatory Contribution Employee', component: BranchMandatoryContributionEmployee },
  { name: 'Cash Advance Pay', component: BranchCashAdvance },
  { name: 'Others Deduction Pay', component: BranchOtherDeduction },
  { name: 'Others Addition Pay', component: BranchOtherAdditionPay },
  { name: 'Branch payroll', component: BranchPayroll },
  { name: 'Branch reports', component: BranchReport }
]

export default function BranchAdminDashboard() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('Employee Info')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date())
  const [branchAdmin] = useState(() => {
    if (location.state?.branchAdmin) return location.state.branchAdmin
    try {
      return JSON.parse(window.sessionStorage.getItem('tafi-branch-admin-session') || 'null')
    } catch {
      return null
    }
  })
  const branchName = branchAdmin?.branch_name || 'Bansasi Branch'

  const ActiveComponent = tabs.find((tab) => tab.name === activeTab)?.component || BranchAdminEmployee

  const handleLogout = () => {
    try {
      window.sessionStorage.removeItem('tafi-branch-admin-session')
    } catch (error) {
      console.error('Unable to clear the Branch Admin session.', error)
    }

    if (branchAdmin?.session_token) {
      revokeBranchAdminSession(branchAdmin.session_token).then(({ error }) => {
        if (error) console.error('Unable to revoke the Branch Admin session.', error)
      })
    }
  }

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentDateTime(new Date()), 1000)
    return () => window.clearInterval(timerId)
  }, [])

  return (
    <div className="dashboard-page">
      <div className={`dashboard-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className={`dashboard-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-label={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {isSidebarCollapsed ? 'Show' : 'Hide'}
          </button>

          <div className="dashboard-brand">
            <img src={logoImage} alt="TAFI logo" />
            {!isSidebarCollapsed && <h3>TAFI</h3>}
          </div>

          {!isSidebarCollapsed && (
            <>
              <div className="sidebar-section">
                <div className="sidebar-label">Quick actions</div>
                {tabs.map((tab) => (
                  <button
                    key={tab.name}
                    type="button"
                    className={`sidebar-action ${activeTab === tab.name ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.name)}
                    aria-current={activeTab === tab.name ? 'page' : undefined}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className="dashboard-main">
          <div className="dashboard-header">
            <h2>Branch Admin Dashboard</h2>
            <div className="dashboard-header-meta">
              <div className="dashboard-clock" aria-label="Current local date and time">
                <span>{currentDateTime.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                <strong>{currentDateTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
              </div>
              <div className="user-chip">
                {branchAdmin?.admin_name || 'Branch Admin'}
                {branchAdmin?.branch_name && <small>{branchAdmin.branch_name}</small>}
              </div>
              <Link to="/" className="dashboard-signout" onClick={handleLogout}>
                <LogOut size={17} aria-hidden="true" />
                Logout
              </Link>
            </div>
          </div>

          <div className="tab-content">
            <ActiveComponent branchName={branchName} branchAdmin={branchAdmin} />
          </div>
        </main>
      </div>
    </div>
  )
}
