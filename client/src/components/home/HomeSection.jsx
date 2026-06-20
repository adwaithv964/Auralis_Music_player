import { motion } from 'framer-motion';

/**
 * HomeSection — Spotify-style horizontal scroll section
 * Title + optional "Show all" + horizontal scrollable card row
 */
export function HomeSection({
  title,
  kicker,
  children,
  onShowAll,
  className = '',
  delay = 0,
}) {
  return (
    <motion.section
      className={`home-section ${className}`}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay }}
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          {kicker && (
            <p className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: 'var(--muted)' }}>
              {kicker}
            </p>
          )}
          <h2 className="text-xl font-bold text-white leading-tight">{title}</h2>
        </div>
        {onShowAll && (
          <button
            onClick={onShowAll}
            className="text-xs font-semibold uppercase tracking-widest transition-colors hover:text-white"
            style={{ color: 'var(--muted)' }}
          >
            Show all
          </button>
        )}
      </div>

      {/* Horizontally scrollable row (becomes grid on mobile) */}
      <div
        className="home-section-row flex gap-4 overflow-x-auto pb-3"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </motion.section>
  );
}
