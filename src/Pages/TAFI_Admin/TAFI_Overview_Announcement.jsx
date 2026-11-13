import { Megaphone, MessageSquare } from 'lucide-react'

const announcements = []

export default function TafiOverviewAnnouncement() {
  return (
    <section
      className="branch-overview-announcements"
      aria-labelledby="tafi-overview-announcements-heading"
    >
      <header className="branch-overview-announcements-header">
        <div>
          <p className="branch-overview-heading-label">TAFI UPDATES</p>
          <h2 id="tafi-overview-announcements-heading">Announcements</h2>
          <p>Important notices and updates for the TAFI team.</p>
        </div>
        <span className="branch-overview-announcements-tag">
          <Megaphone size={15} aria-hidden="true" />
          TAFI noticeboard
        </span>
      </header>

      <div className="branch-overview-announcements-highlight">
        <span className="branch-overview-announcements-icon">
          <Megaphone size={22} aria-hidden="true" />
        </span>
        <div>
          <p>TEAM COMMUNICATION</p>
          <h3>Stay up to date</h3>
          <span>Company notices and team updates will be shared here.</span>
        </div>
        <span className="branch-overview-announcements-count">
          {announcements.length} announcements
        </span>
      </div>

      <section
        className="branch-overview-announcements-feed"
        aria-labelledby="tafi-overview-announcements-feed-heading"
      >
        <header>
          <div>
            <h3 id="tafi-overview-announcements-feed-heading">Recent announcements</h3>
            <p>Updates shared with the TAFI team</p>
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
                  <p>TAFI ANNOUNCEMENT</p>
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
            <span>New updates will appear here when they are available.</span>
          </div>
        )}
      </section>
    </section>
  )
}