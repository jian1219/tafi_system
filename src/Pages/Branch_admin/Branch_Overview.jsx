import { useState } from 'react'
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Megaphone
} from 'lucide-react'
import BranchOverviewAnnouncement from './Branch_Overview_Announcement'
import BranchOverviewAnalytics from './Branch_Overview_Analytics'
import BranchMissingDailyInputs from './Branch_Missing_Daily_Inputs'

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
            </header>
            <BranchMissingDailyInputs sessionToken={branchAdmin?.session_token} />
          </section>
        ) : activeSection === 'announcements' ? (
          <BranchOverviewAnnouncement />
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