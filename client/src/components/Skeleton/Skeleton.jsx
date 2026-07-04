import './skeleton.css';

/**
 * Skeleton — Reusable loading placeholder components
 *
 * All skeletons are:
 *  - aria-hidden="true" (screen-reader invisible)
 *  - tabIndex={-1} (no keyboard focus)
 *  - prefers-reduced-motion safe (pulse disabled via CSS)
 *  - Zero JS animation — pure CSS shimmer
 *
 * Exported primitives:
 *  SkeletonBox      — generic rounded rect
 *  SkeletonText     — single text line
 *  SkeletonTrackCard  — square card (artwork + 2 text lines)
 *  SkeletonArtistCard — round avatar card
 *  SkeletonSongRow    — horizontal list row (artwork + title/artist + duration)
 *  SkeletonSection    — full horizontal scroll section with title + N cards
 *  SkeletonSearchGrid — grid of song rows for Search page
 *  SkeletonQuickAccess — quick-access pill cards
 */

/** Base skeleton rect — everything builds from this */
export function SkeletonBox({ width, height, radius = 8, style, className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`sk-box ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** Single text-line placeholder */
export function SkeletonText({ width = '100%', height = 12, style }) {
  return <SkeletonBox width={width} height={height} radius={6} style={style} />;
}

/**
 * Square track card skeleton — matches TrackCard layout exactly:
 *  - Square artwork
 *  - Title line (full width)
 *  - Artist line (70%)
 */
export function SkeletonTrackCard({ index = 0 }) {
  return (
    <div
      aria-hidden="true"
      className="sk-track-card"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <SkeletonBox className="sk-track-card__art" radius={10} style={{ animationDelay: `${index * 80}ms` }} />
      <div className="sk-track-card__info">
        <SkeletonText width="85%" height={12} style={{ animationDelay: `${index * 80 + 60}ms` }} />
        <SkeletonText width="60%" height={10} style={{ marginTop: 7, animationDelay: `${index * 80 + 120}ms` }} />
      </div>
    </div>
  );
}

/**
 * Round artist card skeleton — matches ArtistCard:
 *  - Circle avatar
 *  - Name line (centred)
 *  - "Artist" sub-label line (centred, shorter)
 */
export function SkeletonArtistCard({ index = 0 }) {
  return (
    <div aria-hidden="true" className="sk-artist-card" style={{ animationDelay: `${index * 80}ms` }}>
      <SkeletonBox className="sk-artist-card__avatar" radius={999} style={{ animationDelay: `${index * 80}ms` }} />
      <SkeletonText width="70%" height={11} style={{ margin: '10px auto 0', animationDelay: `${index * 80 + 60}ms` }} />
      <SkeletonText width="45%" height={9} style={{ margin: '6px auto 0', animationDelay: `${index * 80 + 120}ms` }} />
    </div>
  );
}

/**
 * Horizontal song row skeleton — matches Library/playlist track rows:
 *  - Index number space
 *  - Square thumb
 *  - Title + artist stacked
 *  - Duration placeholder at right
 */
export function SkeletonSongRow({ index = 0 }) {
  const delay = index * 50;
  return (
    <div aria-hidden="true" className="sk-song-row" style={{ animationDelay: `${delay}ms` }}>
      <SkeletonBox width={22} height={14} radius={4} style={{ flexShrink: 0, animationDelay: `${delay}ms` }} />
      <SkeletonBox className="sk-song-row__thumb" radius={6} style={{ flexShrink: 0, animationDelay: `${delay + 40}ms` }} />
      <div className="sk-song-row__text">
        <SkeletonText width="65%" height={12} style={{ animationDelay: `${delay + 60}ms` }} />
        <SkeletonText width="42%" height={10} style={{ marginTop: 6, animationDelay: `${delay + 100}ms` }} />
      </div>
      <SkeletonBox width={36} height={12} radius={4} style={{ flexShrink: 0, marginLeft: 'auto', animationDelay: `${delay + 80}ms` }} />
    </div>
  );
}

/**
 * Quick access pill card skeleton — matches the 2×3 quick-access grid on Home
 */
export function SkeletonQuickAccess({ index = 0 }) {
  return (
    <div aria-hidden="true" className="sk-quick-access" style={{ animationDelay: `${index * 60}ms` }}>
      <SkeletonBox className="sk-quick-access__thumb" radius={8} style={{ animationDelay: `${index * 60}ms` }} />
      <SkeletonText width="55%" height={11} style={{ animationDelay: `${index * 60 + 60}ms` }} />
    </div>
  );
}

/**
 * A full section skeleton: section title + horizontal card row
 *
 * @param {'track'|'artist'} cardType
 * @param {number} count  number of placeholder cards
 */
export function SkeletonSection({ cardType = 'track', count = 5, index = 0 }) {
  return (
    <div aria-hidden="true" className="sk-section">
      {/* Section title + "See all" placeholder */}
      <div className="sk-section__header">
        <SkeletonText width={140} height={14} style={{ animationDelay: `${index * 120}ms` }} />
        <SkeletonText width={52} height={11} style={{ animationDelay: `${index * 120 + 60}ms` }} />
      </div>

      {/* Horizontal scroll row of cards */}
      <div className="sk-section__row">
        {Array.from({ length: count }, (_, i) =>
          cardType === 'artist'
            ? <SkeletonArtistCard key={i} index={i} />
            : <SkeletonTrackCard key={i} index={i} />
        )}
      </div>
    </div>
  );
}

/**
 * Home page full loading skeleton:
 *  - Quick access grid
 *  - 3 horizontal sections (track cards)
 *  - 1 horizontal section (artist cards)
 */
export function SkeletonHomePage() {
  return (
    <div aria-hidden="true" className="sk-home-page">
      {/* Quick access 2×3 grid */}
      <div className="sk-quick-access-grid">
        {Array.from({ length: 6 }, (_, i) => <SkeletonQuickAccess key={i} index={i} />)}
      </div>

      {/* 3 track sections */}
      {[0, 1, 2].map(i => (
        <SkeletonSection key={i} cardType="track" count={5} index={i} />
      ))}

      {/* 1 artist section */}
      <SkeletonSection cardType="artist" count={5} index={3} />

      {/* 1 more track section */}
      <SkeletonSection cardType="track" count={5} index={4} />
    </div>
  );
}

/**
 * Search page skeleton — vertical list of song rows
 */
export function SkeletonSearchPage({ count = 10 }) {
  return (
    <div aria-hidden="true" className="sk-search-page">
      {/* Section header */}
      <div className="sk-section__header">
        <SkeletonText width={100} height={11} />
        <SkeletonText width={160} height={18} style={{ marginTop: 8 }} />
      </div>
      <div className="sk-song-list">
        {Array.from({ length: count }, (_, i) => <SkeletonSongRow key={i} index={i} />)}
      </div>
    </div>
  );
}

/**
 * Library page skeleton — playlist cards grid + song rows section
 */
export function SkeletonPlaylistCard({ index = 0 }) {
  return (
    <div aria-hidden="true" className="sk-playlist-card" style={{ animationDelay: `${index * 70}ms` }}>
      <SkeletonBox className="sk-playlist-card__art" radius={12} style={{ animationDelay: `${index * 70}ms` }} />
      <SkeletonText width="75%" height={12} style={{ marginTop: 10, animationDelay: `${index * 70 + 60}ms` }} />
      <SkeletonText width="50%" height={10} style={{ marginTop: 6, animationDelay: `${index * 70 + 120}ms` }} />
    </div>
  );
}

/**
 * NowPlaying panel skeleton — artwork + title + artist only.
 * Playback controls are NEVER replaced — only info placeholders.
 */
export function SkeletonNowPlaying() {
  return (
    <div aria-hidden="true" className="sk-now-playing">
      {/* Square artwork placeholder */}
      <SkeletonBox className="sk-now-playing__art" radius={16} />
      {/* Title */}
      <SkeletonText width="72%" height={18} style={{ margin: '18px auto 0', display: 'block' }} />
      {/* Artist */}
      <SkeletonText width="50%" height={13} style={{ margin: '10px auto 0', display: 'block' }} />
    </div>
  );
}

