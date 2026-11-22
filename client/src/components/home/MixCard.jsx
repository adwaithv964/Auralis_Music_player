import { useState } from 'react';
import { motion } from 'framer-motion';

/** Gradient fallbacks for each index when artwork fails to load */
const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #1a237e 0%, #39E89A 100%)',
  'linear-gradient(135deg, #004d40 0%, #20C982 100%)',
  'linear-gradient(135deg, #bf360c 0%, #ff7043 100%)',
  'linear-gradient(135deg, #0d1b2a 0%, #2979ff 100%)',
];

/**
 * MixCard — Landscape card for "Made for You" mixes.
 *
 * Props:
 *   title      — mix name e.g. "Daily Mix 1"
 *   description — short description
 *   artworkSrc — image URL
 *   onPlay     — () => void
 *   index      — 0-based index (used for gradient fallback)
 */
export function MixCard({ title, description, artworkSrc, onPlay, index = 0 }) {
  const [imgError, setImgError] = useState(false);
  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];

  return (
    <motion.div
      className="mix-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 * index }}
      whileHover={{ y: -3, scale: 1.02 }}
      onClick={onPlay}
    >
      {/* Background artwork & gradient */}
      <div className="mix-card-bg-wrap">
        {artworkSrc && !imgError ? (
          <img
            src={artworkSrc}
            alt=""
            className="mix-card-bg-img"
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="mix-card-bg-fallback" style={{ background: gradient }} />
        )}
        <div className="mix-card-overlay" />
      </div>

      {/* Info */}
      <div className="mix-card-content">
        <h4 className="mix-card-title">{title}</h4>
        {description && (
          <p className="mix-card-desc">{description}</p>
        )}
      </div>

      {/* Play button on the right */}
      <button
        className="mix-card-play-btn"
        onClick={(e) => { e.stopPropagation(); onPlay?.(); }}
        aria-label={`Play ${title}`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
          <path d="M6 4l15 8-15 8V4z" />
        </svg>
      </button>
    </motion.div>
  );
}
