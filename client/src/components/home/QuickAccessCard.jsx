import { motion } from 'framer-motion';
import { artProxy } from '../../utils/audioHelpers';

/**
 * QuickAccessCard — Compact Spotify-style pill card for the 2×3 top grid
 * Left artwork thumb, right title text, full row clickable
 */
export function QuickAccessCard({ track, isActive, onPlay, index = 0 }) {
  return (
    <motion.button
      className={`quick-card${isActive ? ' quick-card--active' : ''}`}
      onClick={() => onPlay(track)}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {track.artworkUrl ? (
        <img
          src={artProxy(track.artworkUrl)}
          alt={track.title}
          className="quick-card-art"
        />
      ) : (
        <div className="quick-card-art quick-card-art--empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <span className="quick-card-title">{track.title}</span>
      {isActive && (
        <div className="quick-card-eq">
          <span /><span /><span />
        </div>
      )}
    </motion.button>
  );
}

/**
 * MoodCard — Gradient discovery card for moods / genre playlists
 */
export function MoodCard({ label, emoji, gradient, onClick, index = 0 }) {
  return (
    <motion.button
      className="mood-card"
      style={{ background: gradient }}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.04, brightness: 1.1 }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="mood-card-emoji">{emoji}</span>
      <span className="mood-card-label">{label}</span>
    </motion.button>
  );
}
