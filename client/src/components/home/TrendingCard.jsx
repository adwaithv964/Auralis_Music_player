/**
 * components/home/TrendingCard.jsx
 *
 * A premium card for a trending song with:
 *   - Rank badge overlay
 *   - Platform source badge
 *   - Trend badge (🔥 Viral, 📈 Rising, ⭐ New Entry, #1)
 *   - Hover play button
 *   - Click to resolve & play via handlePlay
 */
import { useState } from 'react';
import { motion }   from 'framer-motion';
import { artProxy } from '../../utils/audioHelpers';

const SOURCE_COLORS = {
  'Last.fm':    '#d51007',
  'Apple Music':'#fc3c44',
  'JioSaavn':   '#2bc5b4',
};

export function TrendingCard({ track, index, isActive, isResolving, onPlay }) {
  const [imgErr, setImgErr] = useState(false);

  const artwork = !imgErr && track.artworkUrl
    ? artProxy(track.artworkUrl)
    : `https://via.placeholder.com/300x300/1a1a2e/7cc7ff?text=${encodeURIComponent(track.title?.charAt(0) || '♪')}`;

  const source  = track.sources?.[0] || 'iTunes';
  const srcColor = SOURCE_COLORS[source] || '#7cc7ff';

  return (
    <motion.div
      className="trending-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      onClick={() => onPlay(track)}
      style={{ '--src-color': srcColor }}
    >
      {/* Artwork */}
      <div className="trending-card__art">
        <img
          src={artwork}
          alt={track.title}
          onError={() => setImgErr(true)}
          loading="lazy"
        />

        {/* Rank number */}
        <div className="trending-card__rank">#{track.trendRank || index + 1}</div>

        {/* Trend badge */}
        {track.badge && (
          <div
            className="trending-card__badge"
            style={{ backgroundColor: track.badge.color }}
          >
            {track.badge.label}
          </div>
        )}

        {/* Hover overlay */}
        <div className="trending-card__overlay">
          {isResolving ? (
            <div className="trending-card__spinner" />
          ) : (
            <button className="trending-card__play" aria-label="Play">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
        </div>

        {/* Active indicator */}
        {isActive && <div className="trending-card__active-bar" />}
      </div>

      {/* Meta */}
      <div className="trending-card__meta">
        <p className="trending-card__title" title={track.title}>
          {track.title}
        </p>
        <p className="trending-card__artist" title={track.artist}>
          {track.artist}
        </p>
        {track.releaseDate && (
          <p className="trending-card__date">
            {new Date(track.releaseDate).toLocaleDateString('en-IN', {
              month: 'short', year: 'numeric',
            })}
          </p>
        )}
        <div className="trending-card__source" style={{ color: srcColor }}>
          <span className="trending-card__source-dot" />
          {source}
        </div>
      </div>
    </motion.div>
  );
}
