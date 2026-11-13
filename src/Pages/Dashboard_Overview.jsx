import { useEffect, useRef, useState } from 'react'
import { Barcode, BookOpen, ClipboardList, PackageX, Pause, Play, Quote } from 'lucide-react'

function WorkspaceImagePlayer({ imageSrc, audioSrc }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackMessage, setPlaybackMessage] = useState('')

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined

    let isCurrent = true
    const attemptAutoplay = async () => {
      try {
        await audio.play()
        if (isCurrent) setPlaybackMessage('')
      } catch (error) {
        if (!isCurrent) return
        setPlaybackMessage(error instanceof Error && error.name === 'NotAllowedError'
          ? 'Select Play to start the music.'
          : error instanceof Error
            ? error.message
            : 'Unable to play mean.mp3.')
      }
    }

    void attemptAutoplay()
    return () => {
      isCurrent = false
      audio.pause()
    }
  }, [audioSrc])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return

    setPlaybackMessage('')
    if (!audio.paused) {
      audio.pause()
      return
    }

    try {
      await audio.play()
    } catch (error) {
      setPlaybackMessage(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Select Play to start the music.'
        : error instanceof Error
          ? error.message
          : 'Unable to play mean.mp3.')
    }
  }

  return (
    <figure className="accountant-overview-workspace-image">
      <img src={imageSrc} alt="" />
      {audioSrc && (
        <>
          <audio
            ref={audioRef}
            src={audioSrc}
            preload="auto"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={() => {
              setIsPlaying(false)
              setPlaybackMessage('Unable to load mean.mp3.')
            }}
          />
          <div className="accountant-overview-workspace-audio">
            <button
              className={`accountant-overview-workspace-audio-button${isPlaying ? ' is-playing' : ''}`}
              type="button"
              onClick={togglePlayback}
              aria-label={isPlaying ? 'Pause music' : 'Play music'}
            >
              {isPlaying
                ? <Pause size={18} fill="currentColor" aria-hidden="true" />
                : <Play size={18} fill="currentColor" aria-hidden="true" />}
            </button>
            {playbackMessage && (
              <span className="accountant-overview-workspace-audio-status" role="status">
                {playbackMessage}
              </span>
            )}
          </div>
        </>
      )}
    </figure>
  )
}

export default function DashboardOverview({
  roleName,
  noAvailableStockCount,
  isLoadingNoAvailableStockCount,
  noAvailableStockCountError,
  showBarcodeWithoutPrice = false,
  showPlaceholderCards = true,
  noDataCardCount = 0,
  stackWorkspaceCards = false,
  noPriceBarcodeCount,
  isLoadingNoPriceBarcodeCount,
  noPriceBarcodeCountError,
  showPendingStockRequests = false,
  showWelcomePanel = true,
  workspaceImage,
  workspaceAudio,
  pendingStockRequestBranches = [],
  isLoadingPendingStockRequests,
  pendingStockRequestsError
}) {
  const idPrefix = roleName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return (
    <div className={`accountant-overview${showWelcomePanel ? '' : ' accountant-overview-no-welcome'}${workspaceImage ? ' accountant-overview-has-image' : ''}${stackWorkspaceCards ? ' accountant-overview-workspace-stack' : ''}`}>
      <div className="accountant-overview-stock-column">
        <div className="accountant-overview-live-cards">
          <article className="accountant-overview-card" aria-labelledby={`${idPrefix}-no-stock-title`}>
          <div className="accountant-overview-card-header">
            <span className="accountant-overview-card-icon">
              <PackageX size={23} aria-hidden="true" />
            </span>
            <span className="accountant-overview-card-label">TAFI Stock</span>
          </div>
          <div className="accountant-overview-card-content">
            <p className="accountant-overview-card-eyebrow">Inventory alert</p>
            <h2 id={`${idPrefix}-no-stock-title`}>No available stock</h2>
            <p className="accountant-overview-card-description">
              Items with an available quantity of zero.
            </p>
          </div>
          <div className="accountant-overview-stock-total">
            <div>
              <span>Items unavailable</span>
              <strong>
                {isLoadingNoAvailableStockCount ? (
                  <span role="status">Loading</span>
                ) : noAvailableStockCountError ? (
                  <span role="alert">—</span>
                ) : (
                  noAvailableStockCount ?? 0
                )}
              </strong>
            </div>
            {noAvailableStockCountError && (
              <p className="accountant-inventory-error" role="alert">
                {noAvailableStockCountError}
              </p>
            )}
          </div>
          </article>
          {showBarcodeWithoutPrice && (
            <article
              className="accountant-overview-barcode-card"
              aria-labelledby={`${idPrefix}-unpriced-barcode-title`}
            >
              <span className="accountant-overview-barcode-icon">
                <Barcode size={21} aria-hidden="true" />
              </span>
              <div className="accountant-overview-barcode-copy">
                <p>Barcode inventory</p>
                <h3 id={`${idPrefix}-unpriced-barcode-title`}>Price not set</h3>
                <span>Barcode items without a per-item price.</span>
              </div>
              <div className="accountant-overview-barcode-count">
                <span>Missing price</span>
                <strong>
                  {isLoadingNoPriceBarcodeCount ? (
                    <span role="status">Loading</span>
                  ) : noPriceBarcodeCountError ? (
                    <span role="alert">—</span>
                  ) : (
                    noPriceBarcodeCount ?? 0
                  )}
                </strong>
              </div>
              {noPriceBarcodeCountError && (
                <p className="accountant-inventory-error" role="alert">
                  {noPriceBarcodeCountError}
                </p>
              )}
            </article>
          )}
        </div>
        {noDataCardCount > 0 && (
          <div className="accountant-overview-no-data-grid">
            {Array.from({ length: noDataCardCount }, (_, index) => (
              <article className="accountant-overview-no-data-card" key={`no-data-${index + 1}`}>
                No data
              </article>
            ))}
          </div>
        )}
        {showPlaceholderCards && Array.from({ length: 5 }, (_, index) => (
          <article className="accountant-overview-placeholder-card" key={`placeholder-${index + 1}`}>
            Dummy text
          </article>
        ))}
      </div>
      <div className="accountant-overview-right-column">
        {showWelcomePanel && (
          <section className="branch-overview-verse-panel accountant-overview-verse">
            <div className="branch-overview-brand">
              <span className="branch-overview-brand-icon">
                <BookOpen size={19} aria-hidden="true" />
              </span>
              <span>{roleName} workspace</span>
            </div>
            <div className="branch-overview-verse-content">
              <p className="branch-overview-welcome">Welcome back</p>
              <h2>{roleName} Overview</h2>
              <blockquote className="tafi-overview-verse branch-overview-scripture">
                <Quote className="branch-overview-quote-icon" size={30} aria-hidden="true" />
                <p>“Commit thy works unto the LORD, and thy thoughts shall be established.”</p>
                <cite>Proverbs 16:3 <span>·</span> KJV</cite>
              </blockquote>
            </div>
            <div className="branch-overview-verse-footer">
              <span className="branch-overview-status-dot" aria-hidden="true" />
              <span>Stewardship with accuracy and care</span>
            </div>
          </section>
        )}
        {!showWelcomePanel && workspaceImage && (
          <WorkspaceImagePlayer imageSrc={workspaceImage} audioSrc={workspaceAudio} />
        )}
        {showPendingStockRequests && (
          <article
            className="accountant-overview-requests-card"
            aria-labelledby={`${idPrefix}-purchase-order-requests-title`}
          >
            <div className="accountant-overview-requests-header">
              <span className="accountant-overview-requests-icon">
                <ClipboardList size={19} aria-hidden="true" />
              </span>
              <div className="accountant-overview-requests-heading">
                <h2 id={`${idPrefix}-purchase-order-requests-title`}>
                  Purchase Order Request Form
                </h2>
                <p>Branches with pending requests</p>
              </div>
              <span className="accountant-overview-requests-count">
                {isLoadingPendingStockRequests
                  ? 'Loading'
                  : pendingStockRequestBranches.length}
              </span>
            </div>
            {pendingStockRequestsError ? (
              <p className="accountant-overview-requests-message" role="alert">
                {pendingStockRequestsError}
              </p>
            ) : isLoadingPendingStockRequests ? (
              <p className="accountant-overview-requests-message" role="status">
                Loading purchase order requests...
              </p>
            ) : pendingStockRequestBranches.length > 0 ? (
              <ul className="accountant-overview-requests-list">
                {pendingStockRequestBranches.map((branch) => (
                  <li key={branch.branch_id}>
                    <span>{branch.branch_name}</span>
                    <span>{Number(branch.request_count)} items</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="accountant-overview-requests-message">
                No pending purchase order requests.
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  )
}
