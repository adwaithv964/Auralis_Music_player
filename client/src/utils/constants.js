// ─── Language list ────────────────────────────────────────────
export const LANGUAGES = [
  { id: 'malayalam', label: 'Malayalam', flag: '🌴', desc: 'Mollywood hits',  hero: '/assets/hero_malayalam.png' },
  { id: 'tamil',     label: 'Tamil',     flag: '🎶', desc: 'Kollywood & more', hero: '/assets/hero_tamil.png' },
  { id: 'hindi',     label: 'Hindi',     flag: '🎬', desc: 'Bollywood',        hero: '/assets/hero_hindi.png' },
  { id: 'english',   label: 'English',   flag: '🌍', desc: 'Global hits',      hero: '/assets/hero_english.png' },
  { id: 'all',       label: 'All',       flag: '🇮🇳', desc: 'Mix of all',     hero: null },
];

// ─── Mood filter list ──────────────────────────────────────────
export const MOODS = [
  { id: '',           label: 'All moods' },
  { id: 'romantic',   label: '❤️ Romantic' },
  { id: 'party',      label: '🎉 Party' },
  { id: 'melody',     label: '🎵 Melody' },
  { id: 'sad',        label: '💙 Sad' },
  { id: 'folk',       label: '🌾 Folk' },
  { id: 'devotional', label: '🙏 Devotional' },
];

// ─── Bottom nav tab definitions ────────────────────────────────
export const NAV_TABS = [
  { id: 'home',    label: 'Home' },
  { id: 'search',  label: 'Search' },
  { id: 'library', label: 'Your Library' },
];

// ─── Default preferences ───────────────────────────────────────
export const DEFAULT_PREFS = {
  volume: 62,
  theme:  'dark',
  accent: '#1db954',
};
