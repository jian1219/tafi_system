import { Megaphone, MessageSquare } from 'lucide-react'

const announcements = [
  { id: 'team-jeolee', title: 'Team Jeolee' }
]

export default function BranchOverviewAnnouncement() {
  return (
    <section
      className="branch-overview-announcements"
      aria-labelledby="branch-overview-announcements-heading"
    >
      <header className="branch-overview-announcements-header">
        <div>
          <p className="branch-overview-heading-label">BRANCH UPDATES</p>
          <h2 id="branch-overview-announcements-heading">Announcements</h2>
          <p>Important notices and updates for your branch.</p>
        </div>
        <span className="branch-overview-announcements-tag">
          <Megaphone size={15} aria-hidden="true" />
          Branch noticeboard
        </span>
      </header>

      <div className="branch-overview-announcements-highlight">
        <span className="branch-overview-announcements-icon">
          <Megaphone size={22} aria-hidden="true" />
        </span>
        <div>
          <p>TEAM COMMUNICATION</p>
          <h3>Stay up to date</h3>
          <span>Find branch notices, schedule changes, and team updates in one place.</span>
        </div>
        <span className="branch-overview-announcements-count">
          {announcements.length} announcement{announcements.length === 1 ? '' : 's'}
        </span>
      </div>

      <section className="branch-overview-announcements-feed" aria-labelledby="branch-overview-announcements-feed-heading">
        <header>
          <div>
            <h3 id="branch-overview-announcements-feed-heading">Recent announcements</h3>
            <p>Updates shared with this branch</p>
          </div>
          <span>Noticeboard</span>
        </header>
        {announcements.length > 0 ? (
          <div className="branch-overview-announcement-list">
            {announcements.map((announcement) => (
              <article className="branch-overview-announcement-item" key={announcement.id}>
                <span className="branch-overview-announcement-item-icon">
                  <MessageSquare size={18} aria-hidden="true" />
                </span>
                <div>
                  <p>BRANCH ANNOUNCEMENT</p>
                  <h4>{announcement.title}</h4>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="branch-overview-announcements-empty">
            <span className="branch-overview-announcements-empty-icon">
              <MessageSquare size={22} aria-hidden="true" />
            </span>
            <p>NOTHING NEW</p>
            <h4>No announcements yet</h4>
            <span>When an announcement is shared with your branch, it will appear here.</span>
          </div>
        )}
      </section>
    </section>
  )
}
