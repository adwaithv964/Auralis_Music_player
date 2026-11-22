import { motion } from 'framer-motion';

/**
 * QuickAccessRow — 5 horizontal shortcut cards.
 *
 * Props:
 *   navigateTo          — (view: string) => void
 *   setActiveQueueAndPlay — (queue, track) => void
 *   allPlayable         — full playable track array
 *   playHistory         — recently played tracks
 *   favorites           — array of favorite track IDs
 */

const CARDS = [
  {
    id: 'all',
    title: 'All Songs',
    mobileTitle: 'All Songs',
    desc: 'Your full collection',
    view: 'library',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
    accent: '#39E89A',
    isPlayCard: true,
  },
  {
    id: 'liked',
    title: 'Liked Songs',
    mobileTitle: 'Liked',
    desc: 'Songs you love',
    view: 'library',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    accent: '#ffffff',
  },
  {
    id: 'recent',
    title: 'Recently Played',
    mobileTitle: 'Recent',
    desc: 'Continue listening',
    view: null,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    accent: '#ffffff',
  },
  {
    id: 'radio',
    title: 'Radio',
    mobileTitle: 'Radio',
    desc: 'Curated stations',
    view: 'search',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
        <path d="M4.93 19.07A10 10 0 0 1 4.93 4.93M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48M12 12h.01" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    accent: '#ffffff',
  },
  {
    id: 'browse',
    title: 'Browse',
    mobileTitle: 'Browse',
    desc: 'Genres & moods',
    view: 'search',
    hideOnMobile: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    accent: '#ffffff',
  },
];

export function QuickAccessRow({
  navigateTo,
  setActiveQueueAndPlay,
  allPlayable,
  playHistory,
  favorites,
}) {
  const handleClick = (card) => {
    if (card.id === 'all' && allPlayable?.length > 0) {
      setActiveQueueAndPlay?.(allPlayable, allPlayable[0]);
      return;
    }
    if (card.id === 'recent' && playHistory?.length > 0) {
      setActiveQueueAndPlay?.(playHistory, playHistory[0]);
      return;
    }
    if (card.view) {
      navigateTo?.(card.view);
    }
  };

  return (
    <motion.div
      className="quick-row"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
    >
      {CARDS.map((card, i) => (
        <motion.button
          key={card.id}
          className={`quick-access-card${card.hideOnMobile ? ' quick-access-card--hide-mobile' : ''}${card.isPlayCard ? ' quick-access-card--play' : ''}`}
          onClick={() => handleClick(card)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 * i }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <span className={`quick-access-card__icon${card.isPlayCard ? ' quick-access-card__icon--play' : ''}`}>
            {card.icon}
          </span>
          <span className="quick-access-card__text">
            <span className="quick-access-card__title desktop-only">{card.title}</span>
            <span className="quick-access-card__title mobile-only">{card.mobileTitle}</span>
            <span className="quick-access-card__desc desktop-only">{card.desc}</span>
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}
