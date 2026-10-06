import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import logoImage from '../../images/Tafi logo transparent.png'
import BranchAdminEmployee from './Branch_admin_employee'
import BranchAttendanceMonitoring from './Branch_attendance_monitoring'
import BranchPayroll from './Branch_Payroll'
import BranchReport from './Branch_report'

const tabs = [
  { name: 'Employee Info', component: BranchAdminEmployee },
  { name: 'Branch attendance monitoring', component: BranchAttendanceMonitoring },
  { name: 'Branch payroll', component: BranchPayroll },
  { name: 'Branch reports', component: BranchReport }
]

export default function BranchAdminDashboard() {
  const [activeTab, setActiveTab] = useState('Employee Info')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date())

  const ActiveComponent = tabs.find((tab) => tab.name === activeTab)?.component || BranchAdminEmployee

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
                <div className="sidebar-label">Overview</div>
                <div className="sidebar-card">
                  <strong>24</strong>
                  Staff assigned
                </div>
                <div className="sidebar-card">
                  <strong>96%</strong>
                  Attendance rate
                </div>
              </div>

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
              <div className="user-chip">Branch Admin</div>
            </div>
          </div>

          <div className="tab-content">
            <ActiveComponent />
          </div>

          <Link to="/" className="back-link" style={{ marginTop: '18px', display: 'inline-block' }}>
            ← Return home
          </Link>
        </main>
      </div>
    </div>
  )
}
