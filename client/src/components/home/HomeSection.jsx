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
              style={{ color: 'var(--muted, #75877C)' }}>
              {kicker}
            </p>
          )}
          <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--text, #F5F8F6)' }}>{title}</h2>
        </div>
        <button
          onClick={onShowAll || (() => {})}
          className="text-xs font-semibold transition-colors flex items-center gap-1"
          style={{ color: 'var(--muted, #A7B5AC)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text, #F5F8F6)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted, #A7B5AC)'; }}
        >
          See All &gt;
        </button>
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
