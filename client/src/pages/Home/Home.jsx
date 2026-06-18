import { useCallback, useRef, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp }    from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { api }       from '../../services/api';
import { trackHasAudio, isFullSong } from '../../utils/audioHelpers';
import { LANGUAGES, MOODS } from '../../utils/constants';

// New premium components
import { GreetingHero }       from '../../components/home/GreetingHero';
import { HomeSection }        from '../../components/home/HomeSection';
import { TrackCard }          from '../../components/home/TrackCard';
import { ArtistCard }         from '../../components/home/ArtistCard';
import { QuickAccessCard, MoodCard } from '../../components/home/QuickAccessCard';
import { SuggestionItem }     from '../../components/common/SuggestionItem';
import { LangTabs }           from '../../components/common/LangTabs';
import { TrendingCarousel }   from '../../components/home/TrendingCarousel';
import { useTrendingSongs }   from '../../hooks/useTrendingSongs';

// ── Mood discovery definitions ───────────────────────────────
const MOOD_CARDS = [
  { id: 'romantic', label: 'Romantic',   emoji: '💕', gradient: 'linear-gradient(135deg,#e91e63,#9c27b0)' },
  { id: 'party',    label: 'Party',      emoji: '🎉', gradient: 'linear-gradient(135deg,#ff9800,#f44336)' },
  { id: 'melody',   label: 'Melody',     emoji: '🎵', gradient: 'linear-gradient(135deg,#1db954,#087f3d)' },
  { id: 'sad',      label: 'Sad',        emoji: '🌧️', gradient: 'linear-gradient(135deg,#2196f3,#0d47a1)' },
  { id: 'folk',     label: 'Folk',       emoji: '🪕', gradient: 'linear-gradient(135deg,#795548,#3e2723)' },
  { id: 'devotional', label: 'Devotional', emoji: '🙏', gradient: 'linear-gradient(135deg,#ff7043,#bf360c)' },
];

/**
 * Home — Spotify-level redesigned home page
 *
 * Sections:
 *  1. Dynamic greeting
 *  2. Quick access grid (recently played)
 *  3. Continue Listening
 *  4. Mood discovery chips
 *  5. Trending Now
 *  6. New Releases  
 *  7. Made For You
 *  8. Popular Artists
 *  9. Based On Your Listening
 * 10. Load more / full grid
 */
export function Home() {
  const {
    language, setLanguage, setMood, mood,
    setMobileNavOpen, setView,
    externalTracks, isLoadingExt, extPage,
    doLoadExternal,
    searchQuery, setSearchQuery,
    suggestions, setSuggestions,
    showSuggestions, setShowSuggestions,
    localTracks,
    playHistory,
    favorites,
  } = useApp();

  const {
    handlePlay, currentTrack, resolvingId,
  } = usePlayer();

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

  // ── Seeded shuffle — deterministic per seed, random on refresh ──
  // Fisher-Yates with LCG PRNG so every section gets different unique tracks
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

  // Reversed pool — feels completely different from forward pool
  const reversedPool = useMemo(() => [...stablePool].reverse(), [stablePool]);

  // Favorite IDs set for fast lookup
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);

  // ── Non-overlapping section allocations (10 tracks each) ─────
  const CHUNK = 10;

  const continueListening = useMemo(
    () => playHistory.slice(0, 10),
    [playHistory]
  );

  // Section 1: Trending — first chunk from stable pool
  const trendingNow = useMemo(
    () => stablePool.slice(0, CHUNK),
    [stablePool]
  );

  // Section 2: New Releases — reversed pool chunk (feels fresh / different)
  const newReleases = useMemo(
    () => reversedPool.slice(0, CHUNK),
    [reversedPool]
  );

  // Section 3: Made For You — favorited tracks + pool[20..30] fallback
  const madeForYou = useMemo(() => {
    const fav     = allPlayable.filter(t => favoriteIds.has(t.id));
    const nonFav  = stablePool.filter(t => !favoriteIds.has(t.id));
    // Fill remainder from pool chunk 2 (indices 20–29 of sorted non-fav)
    const fill    = nonFav.slice(CHUNK * 2, CHUNK * 3);
    return [...fav, ...fill].slice(0, CHUNK);
  }, [stablePool, allPlayable, favoriteIds]);

  // Section 4: Based On Your Listening — artist-filtered or pool chunk 3
  const { basedOnListening, basedOnArtist } = useMemo(() => {
    if (playHistory.length > 0) {
      const topArtist = playHistory[0]?.artist?.split(/[,&]/)[0]?.trim() || '';
      if (topArtist) {
        // Find songs from same artist NOT already in trending/new releases
        const trendingIds  = new Set(trendingNow.map(t => t.id));
        const newRelIds    = new Set(newReleases.map(t => t.id));
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
    // Fallback: chunk 3 from stable pool (indices 30–39)
    return {
      basedOnListening: stablePool.slice(CHUNK * 3, CHUNK * 4),
      basedOnArtist: null,
    };
  }, [playHistory, stablePool, trendingNow, newReleases]);

  // Section 5: Daily Mix — chunk 4, further diversified
  const dailyMix = useMemo(
    () => reversedPool.slice(CHUNK, CHUNK * 2),
    [reversedPool]
  );

  // Popular artists — unique artist names (not from song lists above)
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

  // Quick access (uses play history — separate from discovery pools)
  const quickAccess = useMemo(() => {
    const histIds = new Set(playHistory.map(t => t.id));
    const favTracks = allPlayable.filter(t => favoriteIds.has(t.id) && !histIds.has(t.id));
    return [...playHistory.slice(0, 4), ...favTracks.slice(0, 2)].slice(0, 6);
  }, [playHistory, allPlayable, favoriteIds]);

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
        const combined = [...local, ...(ext.tracks || []).filter(trackHasAudio).slice(0, 5)];
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
    setView('search');
    setShowSuggestions(false);
    handlePlay(track);
    doLoadExternal(language, mood, 0, track.title);
  }, [language, mood, handlePlay, doLoadExternal, setSearchQuery, setView, setShowSuggestions]);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    setView('search');
    setShowSuggestions(false);
    doLoadExternal(language, mood, 0, searchQuery);
  }, [language, mood, searchQuery, setView, setShowSuggestions, doLoadExternal]);

  // ── Loading skeleton ─────────────────────────────────────────
  const isFirstLoad = isLoadingExt && extPlayable.length === 0;

  return (
    <div className="home-v2">
      {/* ── Topbar ── */}
      <header className="topbar">
        <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="22" height="22">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <form className="search-box" onSubmit={handleSearchSubmit}>
          <svg aria-hidden="true"><use href="#i-search" /></svg>
          <input
            type="search"
            autoComplete="off"
            placeholder={`Search ${currentLang?.label || ''} songs, artists…`}
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

        <div className="topbar-actions">
          <motion.button
            className="ghost-button"
            onClick={async () => {
              setIsShuffling(true);
              setShuffleSeed(Date.now()); // instantly re-shuffles all sections
              await doLoadExternal(language, mood, extPage, ''); // also fetch fresh page
              setIsShuffling(false);
            }}
            animate={isShuffling ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            <span>Shuffle</span>
          </motion.button>
        </div>
      </header>

      {/* ── Language tabs ── */}
      <LangTabs language={language} onChange={lang => { setLanguage(lang); setMood(''); }} />

      {/* ══════════════════════════════════════════════════════
          GREETING HERO
      ════════════════════════════════════════════════════════ */}
      <div className="home-v2-inner">
        <GreetingHero
          currentTrack={currentTrack}
          language={language}
          mood={mood}
        />

        {/* ── Quick Access 2×3 Grid (Spotify top grid) ── */}
        {quickAccess.length > 0 && (
          <motion.div
            className="quick-access-grid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {quickAccess.map((t, i) => (
              <QuickAccessCard
                key={t.id}
                track={t}
                isActive={currentTrack?.id === t.id}
                onPlay={handlePlay}
                index={i}
              />
            ))}
          </motion.div>
        )}

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
            LOADING SKELETON
        ════════════════════════════════════════════════════════ */}
        {isFirstLoad && (
          <div className="home-skeleton">
            {[1,2,3].map(s => (
              <div key={s} className="skeleton-section">
                <div className="skeleton-title" />
                <div className="skeleton-row">
                  {[1,2,3,4,5].map(c => (
                    <div key={c} className="skeleton-card" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 1: Continue Listening
        ════════════════════════════════════════════════════════ */}
        {continueListening.length > 0 && (
          <HomeSection title="Continue Listening" kicker="🕒 Recently played" delay={0.1}>
            {continueListening.map((t, i) => (
              <TrackCard
                key={t.id}
                track={t}
                index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 2: Real Trending Charts (Last.fm + iTunes + JioSaavn)
        ════════════════════════════════════════════════════════ */}
        <TrendingCarousel language={language} />

        {/* ══════════════════════════════════════════════════════
            SECTION 3: Mood Discovery Grid
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
            SECTION 4: New Releases  [reversedPool 0–9]
        ════════════════════════════════════════════════════════ */}
        {newReleases.length > 0 && (
          <HomeSection title="New Releases" kicker="🆕 Fresh drops" delay={0.25}>
            {newReleases.map((t, i) => (
              <TrackCard
                key={t.id} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 5: Made For You  [favorites + pool 20–29]
        ════════════════════════════════════════════════════════ */}
        {madeForYou.length > 0 && (
          <HomeSection title="Made For You" kicker="✨ Personalized picks" delay={0.3}>
            {madeForYou.map((t, i) => (
              <TrackCard
                key={t.id} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 6: Popular Artists
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
            SECTION 7: Because You Liked [Artist]  [pool 30–39]
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
                key={t.id} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 8: Daily Mix  [reversedPool 10–19]
        ════════════════════════════════════════════════════════ */}
        {dailyMix.length > 0 && (
          <HomeSection
            title={`Daily Mix · ${currentLang?.label || ''}`}
            kicker="🎧 Your everyday playlist"
            delay={0.42}
          >
            {dailyMix.map((t, i) => (
              <TrackCard
                key={t.id} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 9: Full Songs (Audius)
        ════════════════════════════════════════════════════════ */}
        {fullSongsSection.length > 0 && (
          <HomeSection
            title="Free Full Songs"
            kicker="🆓 Complete tracks · Audius"
            delay={0.45}
          >
            {fullSongsSection.map((t, i) => (
              <TrackCard
                key={t.id} track={t} index={i}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </HomeSection>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 9: All Songs Grid (full browse)
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
                  key={t.id} track={t} index={i}
                  isActive={currentTrack?.id === t.id}
                  isResolving={resolvingId === t.id}
                  onPlay={handlePlay}
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

      </div>{/* end home-v2-inner */}
    </div>
  );
}
