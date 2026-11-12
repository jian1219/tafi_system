import { useState } from 'react'
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Megaphone,
  Package,
  Receipt,
  Users,
  Wallet
} from 'lucide-react'
import BranchOverviewAnalytics from './Branch_Overview_Analytics'

const overviewCards = [
  {
    id: 'employees',
    title: 'Employees and attendance',
    category: 'Employee Management',
    icon: Users,
    summary: 'Manage employee records, attendance, and leave credits.',
    accent: 'employees'
  },
  {
    id: 'payroll',
    title: 'Payroll and finance',
    category: 'Payroll & Finance',
    icon: Wallet,
    summary: 'Review payroll, cash advances, additions, and deductions.',
    accent: 'payroll'
  },
  {
    id: 'sales',
    title: 'Sales',
    category: 'Sales',
    icon: Receipt,
    summary: 'Open sales journals, deposits, transactions, discounts, and summaries.',
    accent: 'sales'
  },
  {
    id: 'expenses',
    title: 'Expenses',
    category: 'Expense',
    icon: Receipt,
    summary: 'Record cash disbursements and review daily and monthly summaries.',
    accent: 'expenses'
  },
  {
    id: 'inventory',
    title: 'Inventory and stock',
    category: 'Inventory',
    icon: Package,
    summary: 'Track branch stock, confirm receipts, and follow stock requests.',
    accent: 'inventory'
  }
]

const overviewSections = [
  { id: 'workspace-info', label: 'Workspace Info', icon: BookOpen },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'branch-analytics', label: 'Branch Analytics', icon: BarChart3 }
]

export default function BranchOverview({ branchAdmin }) {
  const [activeSection, setActiveSection] = useState('workspace-info')

  return (
    <div className="branch-overview-layout">
      <div
        className="branch-overview-content"
        role="region"
        aria-label="Overview content"
        tabIndex={0}
      >
        {activeSection === 'workspace-info' ? (
          <section className="branch-overview-workspace" aria-labelledby="branch-overview-heading">
            <header className="branch-overview-heading">
              <div>
                <p className="branch-overview-heading-label">Your dashboard</p>
                <h2 id="branch-overview-heading">Branch workspace</h2>
              </div>
              <div className="branch-overview-heading-actions">
                <span className="branch-overview-count">05 sections</span>
              </div>
            </header>
            <div className="branch-overview-cards">
              {overviewCards.map(({ id, title, category, icon: Icon, summary, accent }, index) => (
                <article className={`branch-overview-card branch-overview-card-${accent}`} key={id}>
                  <span className="branch-overview-card-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <div className="branch-overview-card-copy">
                    <p>{category}</p>
                    <h3>{title}</h3>
                    <span>{summary}</span>
                  </div>
                  <span className="branch-overview-card-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </article>
              ))}
            </div>
          </section>
        ) : activeSection === 'branch-analytics' ? (
          <BranchOverviewAnalytics
            sessionToken={branchAdmin?.session_token}
          />
        ) : (
          <section
            className="branch-overview-empty"
            aria-label={`${overviewSections.find((section) => section.id === activeSection)?.label} content`}
          />
        )}
      </div>

      <aside
        className="branch-overview-navigation-panel"
        id="branch-overview-navigation"
      >
        <header className="branch-overview-nav-header">
          <div>
            <p>BRANCH ADMIN</p>
            <h2>Overview</h2>
          </div>
        </header>
        <nav className="branch-overview-section-nav" aria-label="Overview sections">
          {overviewSections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`branch-overview-section-button${activeSection === id ? ' active' : ''}`}
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => setActiveSection(id)}
            >
              <span className="branch-overview-section-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="branch-overview-section-label">{label}</span>
              <ChevronRight className="branch-overview-section-arrow" size={15} aria-hidden="true" />
            </button>
          ))}
        </nav>
      </aside>
    </div>
  )
}