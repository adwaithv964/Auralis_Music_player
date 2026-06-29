import { useState } from 'react';
import { motion } from 'framer-motion';
import { artProxy } from '../../utils/audioHelpers';

const COLORS = [
  '#7c3aed','#1db954','#ec4899','#f59e0b','#06b6d4','#ef4444','#10b981','#8b5cf6',
];

/**
 * ArtistCard — Round artist card (Spotify-style)
 */
export function ArtistCard({ name, artworkUrl, index = 0, onClick }) {
  const [imgError, setImgError] = useState(false);
  const color = COLORS[index % COLORS.length];
  const src = artworkUrl && !imgError
    ? artProxy(artworkUrl)
    : null;

  return (
    <motion.button
      className="artist-card"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
      whileHover={{ y: -4 }}
    >
      <div
        className="artist-card-avatar"
        style={!src ? { background: `radial-gradient(circle at 30% 30%, ${color}88, ${color}22)` } : {}}
      >
        {src ? (
          <img src={src} alt={name} onError={() => setImgError(true)} />
        ) : (
          <span style={{ fontSize: '2rem', fontWeight: 900, color }}>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <p className="artist-card-name">{name}</p>
      <p className="artist-card-type">Artist</p>
    </motion.button>
  );
}
