import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import {
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CircleDollarSign,
  ChevronDown,
  LogOut,
  MinusCircle,
  Package,
  PlusCircle,
  Users,
  Wallet
} from 'lucide-react'
import logoImage from '../../images/Tafi logo transparent.png'
import BranchAdminEmployee from './Branch_admin_employee'
import BranchAttendanceMonitoring from './Branch_attendance_monitoring'
import BranchPayroll from './Branch_Payroll'
//import BranchReport from './Branch_report'
//import BranchMandatoryContributionEmployee from './Branch_Mandatory_contribution_employee'
import BranchCashAdvance from './Branch_Cash_advance'
import BranchOtherDeduction from './Branch_Other_deduction'
import BranchOtherAdditionPay from './Branch_Other_Addition_pay'
import BranchEmployeeLeaveCredits from './Branch_employee_leave_credits'
import BranchInventory from './Branch_Inventory'
import BranchInventoryLog from './Branch_Inventory_log'
import BranchRequestStock from './Branch_Request_Stock'
import { revokeBranchAdminSession } from '../../lib/supabase'
import useSessionStorageState from '../../lib/useSessionStorageState'
import useRoleSessionExpiry from '../../lib/useRoleSessionExpiry'

const navigationGroups = [
  {
    id: 'employee-management',
    label: 'Employee Management',
    items: [
      { name: 'Employee Info', label: 'Employee', component: BranchAdminEmployee, icon: Users },
      { name: 'Attendance monitoring', label: 'Employee Attendance', component: BranchAttendanceMonitoring, icon: CalendarDays },
      { name: 'Employee Leave Credits', label: 'Leave Credits', component: BranchEmployeeLeaveCredits, icon: CalendarCheck }
    ]
  },
  {
    id: 'payroll-finance',
    label: 'Payroll & Finance',
    items: [
      { name: 'Others Addition Pay', label: 'Other Addition Pay', component: BranchOtherAdditionPay, icon: PlusCircle },
      { name: 'Others Deduction Pay', label: 'Other Deduction Pay', component: BranchOtherDeduction, icon: MinusCircle },
      { name: 'Cash Advance Pay', label: 'Cash Advance', component: BranchCashAdvance, icon: CircleDollarSign },
      { name: 'Branch payroll', label: 'Branch Payroll', component: BranchPayroll, icon: Wallet }
    ]
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      { name: 'Branch Inventory', label: 'Branch Inventory', component: BranchInventory, icon: Package },
      { name: 'Daily Inventory Log', label: 'Daily Inventory Log', component: BranchInventoryLog, icon: CalendarDays },
      { name: 'Request Stock', label: 'Request Stock', component: BranchRequestStock, icon: ClipboardList }
    ]
  }
]
const tabs = navigationGroups.flatMap((group) => group.items)

export default function BranchAdminDashboard() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useSessionStorageState(
    'tafi-branch-admin-dashboard-page',
    'Employee Info',
    tabs.map((tab) => tab.name)
  )
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const activeGroup = navigationGroups.find((group) =>
      group.items.some((item) => item.name === activeTab)
    )
    return { [activeGroup?.id ?? 'employee-management']: true }
  })
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date())
  const [branchAdmin] = useState(() => {
    if (location.state?.branchAdmin) return location.state.branchAdmin
    try {
      return JSON.parse(window.sessionStorage.getItem('tafi-branch-admin-session') || 'null')
    } catch {
      return null
    }
  })
  const isSessionActive = useRoleSessionExpiry(
    branchAdmin,
    '/branch-admin-login',
    'tafi-branch-admin-session'
  )
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

  if (!isSessionActive) return <Navigate to="/branch-admin-login" replace />

  return (
    <div className="dashboard-page">
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="dashboard-brand">
            <img src={logoImage} alt="Triton ACCE Food Inc. logo" />
          </div>

          <p className="tafi-admin-nav-label">Workspace</p>
          <nav className="tafi-admin-nav" aria-label="Dashboard sections">
            {navigationGroups.map((group) => {
              const isExpanded = Boolean(expandedGroups[group.id])
              const containsActivePage = group.items.some((item) => item.name === activeTab)
              const groupItemsId = `branch-admin-nav-group-${group.id}`
              return (
                <div className="tafi-admin-nav-group" key={group.id}>
                  <button
                    type="button"
                    className={`tafi-admin-nav-group-toggle${containsActivePage ? ' has-active' : ''}`}
                    aria-expanded={isExpanded}
                    aria-controls={groupItemsId}
                    onClick={() => setExpandedGroups((current) => ({
                      ...current,
                      [group.id]: !current[group.id]
                    }))}
                  >
                    <span>{group.label}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <div
                    className="tafi-admin-nav-group-items"
                    id={groupItemsId}
                    role="group"
                    aria-label={group.label}
                    hidden={!isExpanded}
                  >
                    {group.items.map(({ name, label, icon: Icon }) => (
                      <button
                        key={name}
                        type="button"
                        className={`tafi-admin-nav-item${activeTab === name ? ' active' : ''}`}
                        aria-current={activeTab === name ? 'page' : undefined}
                        onClick={() => {
                          setActiveTab(name)
                          setExpandedGroups((current) => ({ ...current, [group.id]: true }))
                        }}
                      >
                        <Icon size={19} aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </nav>
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
