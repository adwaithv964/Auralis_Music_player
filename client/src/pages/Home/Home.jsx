import './home.css';
import { useCallback, useRef, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp }    from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { useAuth }   from '../../context/AuthContext';
import { api }       from '../../services/api';
import { trackHasAudio, isFullSong } from '../../utils/audioHelpers';
import { LANGUAGES, MOODS } from '../../utils/constants';

// Existing components
import { HomeSection }        from '../../components/home/HomeSection';
import { TrackCard }          from '../../components/home/TrackCard';
import { ArtistCard }         from '../../components/home/ArtistCard';
import { QuickAccessCard, MoodCard } from '../../components/home/QuickAccessCard';
import { SuggestionItem }     from '../../components/common/SuggestionItem';
import { LangTabs }           from '../../components/common/LangTabs';
import { TrendingCarousel }   from '../../components/home/TrendingCarousel';
import { SkeletonHomePage }   from '../../components/Skeleton/Skeleton';

// New v3 components
import { FeaturedPlaylistHero } from '../../components/home/FeaturedPlaylistHero';
import { QuickAccessRow }       from '../../components/home/QuickAccessRow';
import { MixCard }              from '../../components/home/MixCard';

// ── Mood discovery definitions ───────────────────────────────
const MOOD_CARDS = [
  { id: 'romantic', label: 'Romantic',   emoji: '💕', gradient: 'linear-gradient(135deg,#e91e63,#9c27b0)' },
  { id: 'party',    label: 'Party',      emoji: '🎉', gradient: 'linear-gradient(135deg,#ff9800,#f44336)' },
  { id: 'melody',   label: 'Melody',     emoji: '🎵', gradient: 'linear-gradient(135deg,#1db954,#087f3d)' },
  { id: 'sad',      label: 'Sad',        emoji: '🌧️', gradient: 'linear-gradient(135deg,#2196f3,#0d47a1)' },
  { id: 'folk',     label: 'Folk',       emoji: '🪕', gradient: 'linear-gradient(135deg,#795548,#3e2723)' },
  { id: 'devotional', label: 'Devotional', emoji: '🙏', gradient: 'linear-gradient(135deg,#ff7043,#bf360c)' },
];

// Made For You mix definitions
const MADE_FOR_YOU_MIXES = [
  {
    id: 'daily-mix-1',
    title: 'Daily Mix 1',
    description: 'Your top picks, freshly curated',
    artworkSrc: '/assets/auralis/home/daily-mix-1.webp',
  },
  {
    id: 'daily-mix-2',
    title: 'Daily Mix 2',
    description: 'Chill vibes for every mood',
    artworkSrc: '/assets/auralis/home/daily-mix-2.webp',
  },
  {
    id: 'malayalam-mix',
    title: 'Malayalam Mix',
    description: "Best of Kerala's melodies",
    artworkSrc: '/assets/auralis/home/malayalam-mix.webp',
  },
  {
    id: 'focus-mix',
    title: 'Focus Mix',
    description: 'Deep focus, zero distractions',
    artworkSrc: '/assets/auralis/home/focus-mix.webp',
  },
];

// ── Greeting helper ──────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

/**
 * Home — Auralis v3 Emerald Midnight home page
 */
export function Home() {
  const {
    language, setLanguage, setMood, mood,
    setMobileNavOpen, setView, navigateTo,
    externalTracks, isLoadingExt, extPage,
    doLoadExternal,
    searchQuery, setSearchQuery,
    suggestions, setSuggestions,
    showSuggestions, setShowSuggestions,
    localTracks,
    playHistory,
    favorites,
    playlists,
  } = useApp();

  const {
    handlePlay, currentTrack, resolvingId, setActiveQueueAndPlay,
  } = usePlayer();

  const { currentUser } = useAuth() || {};

  const debounceRef  = useRef(null);
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now());
  const [isShuffling, setIsShuffling] = useState(false);

  // ── Derived track lists ──────────────────────────────────────
  const extPlayable  = useMemo(() => externalTracks.filter(trackHasAudio), [externalTracks]);
  const indianSongs  = useMemo(() => extPlayable.filter(t => !isFullSong(t)), [extPlayable]);
  const fullSongs    = useMemo(() => extPlayable.filter(isFullSong),          [extPlayable]);
  const allPlayable  = useMemo(() => [
    ...localTracks.filter(trackHasAudio), ...extPlayable
  ], [localTracks, extPlayable]);

  const currentLang  = LANGUAGES.find(l => l.id === language);

  // ── Seeded shuffle ───────────────────────────────────────────
  const stablePool = useMemo(() => {
    function seededShuffle(arr, seed) {
      const a = [...arr];
      let s = seed >>> 0;
      for (let i = a.length - 1; i > 0; i--) {
        s = Math.imul(s, 1664525) + 1013904223 >>> 0;
        const j = s % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    return seededShuffle(indianSongs, shuffleSeed);
  }, [indianSongs, shuffleSeed]);

  const reversedPool = useMemo(() => [...stablePool].reverse(), [stablePool]);

  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);

  // ── Non-overlapping section allocations (10 tracks each) ─────
  const CHUNK = 10;

  const continueListening = useMemo(() => {
    if (playHistory.length >= 5) return playHistory.slice(0, 10);
    const histIds = new Set(playHistory.map(t => t.id));
    const remainder = allPlayable.filter(t => !histIds.has(t.id));
    return [...playHistory, ...remainder].slice(0, 10);
  }, [playHistory, allPlayable]);

  const trendingNow = useMemo(() => stablePool.slice(0, CHUNK), [stablePool]);

  const newReleases = useMemo(() => reversedPool.slice(0, CHUNK), [reversedPool]);

  const madeForYou = useMemo(() => {
    const fav    = allPlayable.filter(t => favoriteIds.has(t.id));
    const nonFav = stablePool.filter(t => !favoriteIds.has(t.id));
    const fill   = nonFav.slice(CHUNK * 2, CHUNK * 3);
    return [...fav, ...fill].slice(0, CHUNK);
  }, [stablePool, allPlayable, favoriteIds]);

  const { basedOnListening, basedOnArtist } = useMemo(() => {
    if (playHistory.length > 0) {
      const topArtist = playHistory[0]?.artist?.split(/[,&]/)[0]?.trim() || '';
      if (topArtist) {
        const trendingIds = new Set(trendingNow.map(t => t.id));
        const newRelIds   = new Set(newReleases.map(t => t.id));
        const artistTracks = stablePool.filter(t =>
          !trendingIds.has(t.id) &&
          !newRelIds.has(t.id) &&
          t.artist.toLowerCase().includes(topArtist.toLowerCase())
        );
        if (artistTracks.length >= 4) {
          return { basedOnListening: artistTracks.slice(0, CHUNK), basedOnArtist: topArtist };
        }
      }
    }
    return {
      basedOnListening: stablePool.slice(CHUNK * 3, CHUNK * 4),
      basedOnArtist: null,
    };
  }, [playHistory, stablePool, trendingNow, newReleases]);

  const dailyMix = useMemo(
    () => reversedPool.slice(CHUNK, CHUNK * 2),
    [reversedPool]
  );

  const popularArtists = useMemo(() => {
    const seen = new Set();
    return indianSongs
      .filter(t => {
        const a = t.artist?.split(/[,&]/)[0]?.trim();
        if (!a || seen.has(a)) return false;
        seen.add(a);
        return true;
      })
      .slice(0, 10)
      .map(t => ({
        name: t.artist?.split(/[,&]/)[0]?.trim(),
        artworkUrl: t.artworkUrl,
      }));
  }, [indianSongs]);

  const fullSongsSection = useMemo(() => fullSongs.slice(0, CHUNK), [fullSongs]);

  const quickAccess = useMemo(() => {
    const histIds   = new Set(playHistory.map(t => t.id));
    const favTracks = allPlayable.filter(t => favoriteIds.has(t.id) && !histIds.has(t.id));
    return [...playHistory.slice(0, 4), ...favTracks.slice(0, 2)].slice(0, 6);
  }, [playHistory, allPlayable, favoriteIds]);

  // ── Featured playlist — first playlist or static fallback ────
  const featuredPlaylist = useMemo(() => {
    if (playlists && playlists.length > 0) return playlists[0];
    return {
      name: 'Malayalam Hits',
      description: "The best of Kerala's evergreen melodies",
      songs: [],
    };
  }, [playlists]);

  // ── Search handlers ──────────────────────────────────────────
  const handleSearchChange = useCallback((e) => {
    const q = e.target.value;
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const local = allPlayable
        .filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 3);
      try {
        const ext = await api.searchExternal(q, language, 0, mood);
        const seen = new Set();
        const combined = [...local, ...(ext.tracks || []).filter(trackHasAudio).slice(0, 5)]
          .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
        setSuggestions(combined.slice(0, 7));
        setShowSuggestions(combined.length > 0);
      } catch {
        setSuggestions(local);
        setShowSuggestions(local.length > 0);
      }
    }, 350);
  }, [allPlayable, language, mood, setSuggestions, setShowSuggestions, setSearchQuery]);

  const handleSuggestionPick = useCallback((track) => {
    setSearchQuery(track.title);
    navigateTo('search');
    setShowSuggestions(false);
    handlePlay(track);
    doLoadExternal(language, mood, 0, track.title);
  }, [language, mood, handlePlay, doLoadExternal, setSearchQuery, navigateTo, setShowSuggestions]);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    navigateTo('search');
    setShowSuggestions(false);
    doLoadExternal(language, mood, 0, searchQuery);
  }, [language, mood, searchQuery, navigateTo, setShowSuggestions, doLoadExternal]);

  // ── Loading skeleton ─────────────────────────────────────────
  const isFirstLoad = isLoadingExt && extPlayable.length === 0;

  // ── Greeting ─────────────────────────────────────────────────
  const greeting = 'Good evening';

  return (
    <div className="home-v3">
      {/* ══════════════════════════════════════════════════════
          MOBILE TOPBAR
      ════════════════════════════════════════════════════════ */}
      <header className="topbar-v3 mobile-topbar-v3" role="banner">
        {/* Mobile hamburger */}
        <button className="mobile-menu-btn-v3" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>

        {/* Brand */}
        <div className="mobile-logo-v3" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
            <path d="M12 3v18M8 6v12M4 9v6M16 6v12M20 9v6" stroke="var(--em-accent, #39E89A)" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#F5F8F6', letterSpacing: '-0.02em' }}>Auralis</span>
        </div>

        {/* Right actions: notification + avatar */}
        <div className="mobile-topbar-actions-v3">
          <button
            className="topbar-icon-btn-v3"
            aria-label="Notifications"
            style={{ position: 'relative', background: 'none', border: 'none', color: 'var(--em-text-sub, #A7B5AC)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: 'var(--em-accent, #39E89A)' }} />
          </button>

          <div
            className="mobile-user-avatar"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--em-accent, #39E89A)',
              color: '#06100D', fontWeight: 700, fontSize: '0.82rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setMobileNavOpen(true)}
          >
            {(currentUser?.username?.[0] || 'C').toUpperCase()}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          DESKTOP TOPBAR
      ════════════════════════════════════════════════════════ */}
      <header className="topbar-v3 desktop-topbar-v3" role="banner">
        {/* Back / Forward — desktop nav helpers */}
        <div className="topbar-v3__nav hidden-mobile">
          <button className="topbar-v3__nav-btn" aria-label="Go back" onClick={() => window.history.back()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button className="topbar-v3__nav-btn" aria-label="Go forward" onClick={() => window.history.forward()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <form className="search-box search-box-v3" onSubmit={handleSearchSubmit}>
          <svg aria-hidden="true"><use href="#i-search" /></svg>
          <input
            type="search"
            autoComplete="off"
            placeholder="Search for songs, artists, albums, playlists…"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => suggestions.length && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
          />
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                className="suggestion-popover glass-panel"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                {suggestions.map((t, i) => (
                  <SuggestionItem key={t.id || i} track={t} onPick={handleSuggestionPick} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {/* Desktop window / notification controls */}
        <div className="topbar-v3__actions" style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
          <button
            className="topbar-icon-btn-v3 topbar-icon-btn-v3--notif"
            aria-label="Notifications"
            style={{
              position: 'relative',
              background: 'transparent',
              border: 'none',
              color: 'var(--em-text-sub, #A7B5AC)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="19" height="19">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--em-accent, #39E89A)',
              }}
            />
          </button>

          <div
            className="window-controls-v3"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              color: 'var(--em-text-muted, #75877C)',
              marginLeft: 6,
            }}
          >
            <button
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}
              aria-label="Minimize"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><rect y="11" width="24" height="2" /></svg>
            </button>
            <button
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}
              aria-label="Maximize"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
            </button>
            <button
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          INNER CONTENT
      ════════════════════════════════════════════════════════ */}
      <div className="home-v3-inner">

        {/* ── Greeting section ── */}
        <motion.div
          className="greeting-section"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          <h1 className="greeting-section__title">{greeting}</h1>
          <p className="greeting-section__sub">Discover, play and feel the music.</p>
        </motion.div>

        {/* ── Quick Access Row (5 cards) ── */}
        <QuickAccessRow
          navigateTo={navigateTo}
          setActiveQueueAndPlay={setActiveQueueAndPlay}
          allPlayable={allPlayable}
          playHistory={playHistory}
          favorites={favorites}
        />

        {/* ── Featured Playlist Hero ── */}
        <FeaturedPlaylistHero
          playlist={featuredPlaylist}
          heroImage="/assets/auralis/home/auralis-hero-malayalam.webp"
          onPlay={() => {
            const songs = featuredPlaylist?.songs || allPlayable.slice(0, 20);
            if (songs.length > 0) setActiveQueueAndPlay(songs, songs[0]);
          }}
          onFollow={() => {
            // placeholder — could dispatch a follow action
          }}
        />

        {/* ══════════════════════════════════════════════════════
            SECTION 1: Continue Listening
        ════════════════════════════════════════════════════════ */}
        {continueListening.length > 0 && (
          <HomeSection title="Continue Listening" kicker="🕒 Recently played" delay={0.1}>
            {continueListening.map((t, i) => (
              <TrackCard
                key={`cl-${t.id}`}
                track={t}
                index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={(track) => setActiveQueueAndPlay(continueListening, track)}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 2: Made for You Mixes (MixCard × 4)
        ════════════════════════════════════════════════════════ */}
        <motion.section
          className="home-section-v3"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45, delay: 0.12 }}
        >
          <div className="home-section-v3-header">
            <div>
              <h2 className="home-section-v3-title">Made for You</h2>
            </div>
            <button
              onClick={() => {}}
              className="home-section-v3-seeall"
            >
              See All &gt;
            </button>
          </div>
          <div className="mix-cards-row">
            {MADE_FOR_YOU_MIXES.map((mix, i) => (
              <MixCard
                key={mix.id}
                title={mix.title}
                description={mix.description}
                artworkSrc={mix.artworkSrc}
                index={i}
                onPlay={() => {
                  const pool = stablePool.slice(i * CHUNK, (i + 1) * CHUNK);
                  if (pool.length > 0) setActiveQueueAndPlay(pool, pool[0]);
                }}
              />
            ))}
          </div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            SKELETON
        ════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {isFirstLoad && (
            <motion.div
              key="home-skeleton"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <SkeletonHomePage />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Mood Discovery Chips ── */}
        <motion.div
          className="mood-chips-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <button
            className={`mood-chip${!mood ? ' mood-chip--active' : ''}`}
            onClick={() => setMood('')}
          >
            All
          </button>
          {MOODS.map(m => (
            <button
              key={m.id}
              className={`mood-chip${mood === m.id ? ' mood-chip--active' : ''}`}
              onClick={() => setMood(m.id === mood ? '' : m.id)}
            >
              {m.label}
            </button>
          ))}
        </motion.div>

        {/* ══════════════════════════════════════════════════════
            SECTION: Real Trending Charts
        ════════════════════════════════════════════════════════ */}
        <TrendingCarousel language={language} />

        {/* ══════════════════════════════════════════════════════
            SECTION: Browse by Mood
        ════════════════════════════════════════════════════════ */}
        <HomeSection title="Browse by Mood" kicker="🎨 Music for every moment" delay={0.2}>
          {MOOD_CARDS.map((mc, i) => (
            <MoodCard
              key={mc.id}
              label={mc.label}
              emoji={mc.emoji}
              gradient={mc.gradient}
              index={i}
              onClick={() => setMood(mc.id === mood ? '' : mc.id)}
            />
          ))}
        </HomeSection>

        {/* ══════════════════════════════════════════════════════
            SECTION: New Releases
        ════════════════════════════════════════════════════════ */}
        {newReleases.length > 0 && (
          <HomeSection title="New Releases" kicker="🆕 Fresh drops" delay={0.25}>
            {newReleases.map((t, i) => (
              <TrackCard
                key={`nr-${t.id}`} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={(track) => setActiveQueueAndPlay(newReleases, track)}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION: Made For You (Tracks)
        ════════════════════════════════════════════════════════ */}
        {madeForYou.length > 0 && (
          <HomeSection title="Made For You" kicker="✨ Personalized picks" delay={0.3}>
            {madeForYou.map((t, i) => (
              <TrackCard
                key={`mfy-${t.id}`} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={(track) => setActiveQueueAndPlay(madeForYou, track)}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION: Popular Artists
        ════════════════════════════════════════════════════════ */}
        {popularArtists.length > 0 && (
          <HomeSection title="Popular Artists" kicker="🎤 Top talent" delay={0.35}>
            {popularArtists.map((a, i) => (
              <ArtistCard
                key={a.name}
                name={a.name}
                artworkUrl={a.artworkUrl}
                index={i}
                onClick={() => doLoadExternal(language, mood, 0, a.name)}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION: Because You Liked
        ════════════════════════════════════════════════════════ */}
        {basedOnListening.length > 0 && (
          <HomeSection
            title={basedOnArtist
              ? `Because You Liked ${basedOnArtist}`
              : 'Recommended For You'}
            kicker="💡 Based on your listening"
            delay={0.4}
          >
            {basedOnListening.map((t, i) => (
              <TrackCard
                key={`bol-${t.id}`} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={(track) => setActiveQueueAndPlay(basedOnListening, track)}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION: Daily Mix
        ════════════════════════════════════════════════════════ */}
        {dailyMix.length > 0 && (
          <HomeSection
            title={`Daily Mix · ${currentLang?.label || ''}`}
            kicker="🎧 Your everyday playlist"
            delay={0.42}
          >
            {dailyMix.map((t, i) => (
              <TrackCard
                key={`dm-${t.id}`} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={(track) => setActiveQueueAndPlay(dailyMix, track)}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION: Free Full Songs (Audius)
        ════════════════════════════════════════════════════════ */}
        {fullSongsSection.length > 0 && (
          <HomeSection
            title="Free Full Songs"
            kicker="🆓 Complete tracks · Audius"
            delay={0.45}
          >
            {fullSongsSection.map((t, i) => (
              <TrackCard
                key={`fs-${t.id}`} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={(track) => setActiveQueueAndPlay(fullSongsSection, track)}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION: All Songs Full Grid
        ════════════════════════════════════════════════════════ */}
        {stablePool.length > 0 && (
          <motion.section
            className="home-section"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4 px-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1"
                  style={{ color: 'var(--muted)' }}>
                  {currentLang?.flag} {currentLang?.label}
                </p>
                <h2 className="text-xl font-bold text-white">
                  {mood
                    ? `${MOODS.find(m => m.id === mood)?.label} songs`
                    : `All ${currentLang?.label || ''} songs`}
                </h2>
              </div>
              <span className="home-yt-badge">▶ YouTube</span>
            </div>

            <div className="home-album-grid">
              {stablePool.map((t, i) => (
                <TrackCard
                  key={`grid-${t.id}`} track={t} index={i}
                  isActive={currentTrack?.id === t.id}
                  isResolving={resolvingId === t.id}
                  onPlay={(track) => setActiveQueueAndPlay(stablePool, track)}
                />
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Load more ── */}
        <div className="home-load-more">
          <motion.button
            className="load-more-btn"
            onClick={() => doLoadExternal(language, mood, extPage, '')}
            disabled={isLoadingExt}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLoadingExt ? (
              <span className="flex items-center gap-2">
                <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" width="16" height="16">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Loading…
              </span>
            ) : `Discover more ${currentLang?.label || ''} music`}
          </motion.button>
        </div>

      </div>{/* end home-v3-inner */}
    </div>
  );
}
