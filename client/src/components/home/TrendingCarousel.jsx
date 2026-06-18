/**
 * components/home/TrendingCarousel.jsx
 *
 * Full trending section with 5 carousels of real chart data:
 *   🔥 Trending Now   — combined top 12
 *   📈 Viral          — fast-rising recent songs
 *   🎬 Movie Tracks   — OST / film songs
 *   🎵 New Releases   — last 30 days
 *   👑 Top Charts     — chart-position ranked
 *
 * Data comes from useTrendingSongs (Last.fm + iTunes + JioSaavn).
 */
import { useState }     from 'react';
import { motion }       from 'framer-motion';
import { useTrendingSongs } from '../../hooks/useTrendingSongs';
import { TrendingCard }    from './TrendingCard';
import { usePlayer }       from '../../context/PlayerContext';

function SectionHeader({ icon, title, subtitle, onRefresh, isLoading }) {
  return (
    <div className="trending-section-header">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: 'var(--accent)', fontSize: '0.72rem', letterSpacing: '0.1em' }}>
          {subtitle}
        </p>
        <h2 className="trending-section-title">
          <span className="trending-section-icon">{icon}</span>
          {title}
        </h2>
      </div>
      {onRefresh && (
        <motion.button
          className="trending-refresh-btn"
          onClick={onRefresh}
          animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
          transition={{ duration: 0.8, ease: 'linear', repeat: isLoading ? Infinity : 0 }}
          title="Refresh trending data"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </motion.button>
      )}
    </div>
  );
}

function SkeletonCards({ count = 6 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="trending-card trending-card--skeleton">
          <div className="trending-card__art trending-skeleton" />
          <div className="trending-card__meta">
            <div className="trending-skeleton trending-skeleton--text" style={{ width: '80%' }} />
            <div className="trending-skeleton trending-skeleton--text" style={{ width: '55%', marginTop: 6 }} />
          </div>
        </div>
      ))}
    </>
  );
}

function TrendingRow({ tracks, isLoading, emptyMsg }) {
  const { handlePlay, currentTrack, resolvingId } = usePlayer();

  if (isLoading) {
    return (
      <div className="trending-carousel">
        <SkeletonCards count={6} />
      </div>
    );
  }
  if (!tracks?.length) {
    return (
      <div className="trending-empty">
        <span>🎵</span>
        <p>{emptyMsg || 'No tracks found. Fetching chart data…'}</p>
      </div>
    );
  }

  return (
    <div className="trending-carousel">
      {tracks.map((t, i) => (
        <TrendingCard
          key={t.id}
          track={t}
          index={i}
          isActive={currentTrack?.id === t.id}
          isResolving={resolvingId === t.id}
          onPlay={handlePlay}
        />
      ))}
    </div>
  );
}

export function TrendingCarousel({ language = 'malayalam' }) {
  const [activeTab, setActiveTab] = useState('trending');
  const {
    trending, viral, movieTracks, newReleases, topCharts,
    isLoading, lastUpdated, totalSources, error, refresh,
  } = useTrendingSongs(language);

  const TABS = [
    { id: 'trending',    icon: '🔥', label: 'Trending',      data: trending,    empty: 'Fetching trending charts…' },
    { id: 'viral',       icon: '📈', label: 'Viral',         data: viral,       empty: 'No viral tracks yet.' },
    { id: 'movieTracks', icon: '🎬', label: 'Movie Tracks',  data: movieTracks, empty: 'No movie tracks found.' },
    { id: 'newReleases', icon: '🎵', label: 'New Releases',  data: newReleases, empty: 'No recent releases found.' },
    { id: 'topCharts',   icon: '👑', label: 'Top Charts',    data: topCharts,   empty: 'Chart data unavailable.' },
  ];

  const active = TABS.find(t => t.id === activeTab) || TABS[0];

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  return (
    <section className="trending-section">
      {/* Header */}
      <SectionHeader
        icon="🎵"
        title={`Trending · ${language.charAt(0).toUpperCase() + language.slice(1)}`}
        subtitle="📡 LIVE CHART DATA"
        onRefresh={refresh}
        isLoading={isLoading}
      />

      {/* Source pills */}
      {totalSources?.length > 0 && (
        <div className="trending-sources">
          {totalSources.map(src => (
            <span key={src} className="trending-source-pill">{src}</span>
          ))}
          {lastUpdated && (
            <span className="trending-updated">
              Updated: {fmtDate(lastUpdated)}
            </span>
          )}
        </div>
      )}

      {/* Error notice */}
      {error && !isLoading && (
        <div className="trending-error">
          ⚠️ Using cached data — {error}
          {' '}
          <button onClick={refresh}>Retry</button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="trending-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`trending-tab${activeTab === tab.id ? ' trending-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.data?.length > 0 && (
              <span className="trending-tab__count">{tab.data.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Carousel */}
      <TrendingRow
        tracks={active.data}
        isLoading={isLoading && !active.data?.length}
        emptyMsg={active.empty}
      />
    </section>
  );
}
