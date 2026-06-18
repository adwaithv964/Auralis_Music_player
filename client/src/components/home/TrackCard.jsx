import { useState } from 'react';
import { motion } from 'framer-motion';

const PLACEHOLDER_COLORS = [
  ['#1db954', '#191414'],
  ['#7c3aed', '#2d1b69'],
  ['#ec4899', '#831843'],
  ['#f59e0b', '#78350f'],
  ['#06b6d4', '#164e63'],
  ['#ef4444', '#7f1d1d'],
];

/**
 * TrackCard — Premium square album card (Spotify-quality)
 * Shows artwork, title, artist. Hover reveals play button overlay.
 */
export function TrackCard({ track, isActive, isResolving, onPlay, index = 0 }) {
  const [imgError, setImgError] = useState(false);
  const colors = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const artSrc = track.artworkUrl && !imgError
    ? `/api/artwork?url=${encodeURIComponent(track.artworkUrl)}`
    : null;

  return (
    <motion.div
      className="track-card-premium"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.5) }}
      whileHover={{ y: -4 }}
      onClick={() => onPlay(track)}
    >
      {/* Artwork */}
      <div className="track-card-art-wrap">
        {artSrc ? (
          <img
            src={artSrc}
            alt={track.title}
            className="track-card-art"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="track-card-art track-card-art--empty"
            style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
          >
            <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)" width="32" height="32">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
          </div>
        )}

        {/* Hover play overlay */}
        <motion.div
          className="track-card-overlay"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
        >
          <motion.button
            className="track-card-play-btn"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.96 }}
            onClick={(e) => { e.stopPropagation(); onPlay(track); }}
            aria-label={`Play ${track.title}`}
          >
            {isResolving ? (
              <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" width="22" height="22">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </motion.button>
        </motion.div>

        {/* Active indicator */}
        {isActive && (
          <div className="track-card-active-badge">
            <span /><span /><span />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="track-card-info">
        <p className={`track-card-title${isActive ? ' track-card-title--active' : ''}`}>
          {track.title}
        </p>
        <p className="track-card-artist">{track.artist}</p>
      </div>
    </motion.div>
  );
}
