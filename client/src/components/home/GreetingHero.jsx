import { useMemo } from 'react';
import { motion } from 'framer-motion';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  if (h < 21) return { text: 'Good evening', emoji: '🌆' };
  return { text: 'Good night', emoji: '🌙' };
}

/**
 * GreetingHero — Dynamic greeting with animated gradient background
 * Shows the time-based greeting + subtitle based on currently playing or language
 */
export function GreetingHero({ currentTrack, language, mood }) {
  const { text, emoji } = useMemo(getGreeting, []);

  const langLabel = {
    malayalam: 'Malayalam', tamil: 'Tamil',
    hindi: 'Hindi', english: 'English', all: 'All Languages',
  }[language] || 'Music';

  const moodLabel = mood
    ? { romantic:'Romantic', party:'Party', melody:'Melody',
        sad:'Sad', folk:'Folk', devotional:'Devotional' }[mood] || mood
    : null;

  const subtitle = currentTrack
    ? `Now playing: ${currentTrack.title} · ${currentTrack.artist}`
    : moodLabel
      ? `${moodLabel} · ${langLabel}`
      : `${langLabel} hits, discoveries & more`;

  return (
    <motion.div
      className="greeting-hero"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h1
        className="greeting-text"
        key={text}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {emoji} {text}
      </motion.h1>
      <p className="greeting-sub">{subtitle}</p>
    </motion.div>
  );
}
