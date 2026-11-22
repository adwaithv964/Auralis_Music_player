import { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * FeaturedPlaylistHero — Cinematic banner for featured playlist.
 *
 * Props:
 *   playlist   — { name, description, songs }
 *   heroImage  — background image src string
 *   onPlay     — callback () => void
 *   onFollow   — callback () => void
 */
export function FeaturedPlaylistHero({ playlist, heroImage, onPlay, onFollow }) {
  const [currentDot, setCurrentDot] = useState(0);
  const DOT_COUNT = 4;

  const handlePrev = (e) => { e.stopPropagation(); setCurrentDot(d => (d - 1 + DOT_COUNT) % DOT_COUNT); };
  const handleNext = (e) => { e.stopPropagation(); setCurrentDot(d => (d + 1) % DOT_COUNT); };

  const title = playlist?.name ?? 'Malayalam Hits';
  const desc = playlist?.description ?? 'Timeless classics and the latest Malayalam hits in one place.';

  return (
    <motion.div
      className="featured-hero"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.15 }}
      onClick={onPlay}
    >
      {/* Background image */}
      {heroImage && (
        <img
          src={heroImage}
          alt={title}
          className="featured-hero-bg"
          draggable={false}
        />
      )}

      {/* Dark gradient overlay */}
      <div className="featured-hero-overlay" />

      {/* Content */}
      <div className="featured-hero-content">
        <span className="featured-hero-label">FEATURED PLAYLIST</span>
        <h2 className="featured-hero-title">{title}</h2>
        <p className="featured-hero-desc">{desc}</p>

        <div className="featured-hero-actions" onClick={e => e.stopPropagation()}>
          <button className="featured-hero-btn-play" onClick={onPlay}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M5 3l14 9-14 9V3z" />
            </svg>
            Play Now
          </button>
          <button className="featured-hero-btn-follow" onClick={onFollow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Follow
          </button>
        </div>
      </div>

      {/* Carousel dots in bottom center */}
      <div className="featured-hero-dots" onClick={e => e.stopPropagation()}>
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <button
            key={i}
            className={`featured-hero-dot${currentDot === i ? ' featured-hero-dot--active' : ''}`}
            onClick={() => setCurrentDot(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Prev / Next arrows */}
      <button className="featured-hero-prev" onClick={handlePrev} aria-label="Previous">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" width="18" height="18">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button className="featured-hero-next" onClick={handleNext} aria-label="Next">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" width="18" height="18">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </motion.div>
  );
}
