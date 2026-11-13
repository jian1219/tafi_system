import { useState } from 'react'
import { BarChart3, BookOpen, ChevronRight, Megaphone } from 'lucide-react'
import DashboardOverview from '../Dashboard_Overview'
import TafiOverviewAnalytics from './TAFI_Overview_Analytics'
import TafiOverviewAnnouncement from './TAFI_Overview_Announcement'
import lanyImage from '../../images/lany.jpg'
import meanMusic from '../../music/mean.mp3'

const overviewSections = [
  { id: 'workspace-info', label: 'Workspace Info', icon: BookOpen },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'branch-analytics', label: 'Branch Analytics', icon: BarChart3 }
]

export default function TafiOverview({
  sessionToken,
  noAvailableStockCount,
  isLoadingNoAvailableStockCount,
  noAvailableStockCountError,
  noPriceBarcodeCount,
  isLoadingNoPriceBarcodeCount,
  noPriceBarcodeCountError,
  pendingStockRequestBranches,
  isLoadingPendingStockRequests,
  pendingStockRequestsError
}) {
  const [activeSection, setActiveSection] = useState('workspace-info')

  return (
    <div className="branch-overview-layout">
      <div
        className="branch-overview-content"
        role="region"
        aria-label="TAFI Overview content"
        tabIndex={0}
      >
        {activeSection === 'workspace-info' ? (
          <DashboardOverview
            roleName="TAFI Admin"
            showBarcodeWithoutPrice
            showPlaceholderCards={false}
            noDataCardCount={3}
            stackWorkspaceCards
            showPendingStockRequests
            showWelcomePanel={false}
            workspaceImage={lanyImage}
            workspaceAudio={meanMusic}
            noAvailableStockCount={noAvailableStockCount}
            isLoadingNoAvailableStockCount={isLoadingNoAvailableStockCount}
            noAvailableStockCountError={noAvailableStockCountError}
            noPriceBarcodeCount={noPriceBarcodeCount}
            isLoadingNoPriceBarcodeCount={isLoadingNoPriceBarcodeCount}
            noPriceBarcodeCountError={noPriceBarcodeCountError}
            pendingStockRequestBranches={pendingStockRequestBranches}
            isLoadingPendingStockRequests={isLoadingPendingStockRequests}
            pendingStockRequestsError={pendingStockRequestsError}
          />
        ) : activeSection === 'announcements' ? (
          <TafiOverviewAnnouncement />
        ) : (
          <TafiOverviewAnalytics sessionToken={sessionToken} />
        )}
      </div>

      <aside className="branch-overview-navigation-panel" id="tafi-overview-navigation">
        <header className="branch-overview-nav-header">
          <div>
            <p>TAFI ADMIN</p>
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
