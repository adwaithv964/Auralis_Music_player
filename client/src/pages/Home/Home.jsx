import { useCallback, useRef } from 'react';
import { useApp }    from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { LangTabs }  from '../../components/common/LangTabs';
import { MoodBar }   from '../../components/common/MoodBar';
import { SuggestionItem } from '../../components/common/SuggestionItem';
import { AlbumCard }  from '../../components/MusicCard/AlbumCard';
import { api }        from '../../services/api';
import { trackHasAudio, isFullSong } from '../../utils/audioHelpers';
import { LANGUAGES, MOODS } from '../../utils/constants';

/**
 * Home page
 *
 * Contains:
 *  - Topbar (hamburger, search, refresh)
 *  - Language tab strip
 *  - Mood chip strip
 *  - Hero band (language artwork + text)
 *  - "Popular songs" album grid (Indian / YouTube-resolved tracks)
 *  - "Full songs" album grid (Audius / English)
 *  - Load more button
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
  } = useApp();
  const { handlePlay, currentTrack, resolvingId } = usePlayer();
  const debounceRef = useRef(null);

  const extPlayable  = externalTracks.filter(trackHasAudio);
  const indianSongs  = extPlayable.filter(t => !isFullSong(t));
  const fullSongs    = extPlayable.filter(isFullSong);
  const currentLang  = LANGUAGES.find(l => l.id === language);
  const playable     = [
    ...localTracks.filter(trackHasAudio),
    ...extPlayable,
  ];

  // ── Search ──────────────────────────────────────────────────
  const handleSearchChange = useCallback((e) => {
    const q = e.target.value;
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const local = playable
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
  }, [playable, language, mood, setSuggestions, setShowSuggestions, setSearchQuery]);

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

  return (
    <>
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
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestion-popover glass-panel">
              {suggestions.map((t, i) => (
                <SuggestionItem key={t.id || i} track={t} onPick={handleSuggestionPick} />
              ))}
            </div>
          )}
        </form>

        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => doLoadExternal(language, mood, 0, '')}>
            <svg><use href="#i-spark" /></svg>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* ── Language tabs ── */}
      <LangTabs language={language} onChange={lang => { setLanguage(lang); setMood(''); }} />

      {/* ── Mood chips ── */}
      <MoodBar mood={mood} onChange={m => setMood(m)} />

      {/* ── Hero band ── */}
      <section className="hero-band">
        <div className="hero-copy">
          <p className="section-kicker">{currentLang?.flag} {currentLang?.desc}</p>
          <h1>{currentLang?.label} music</h1>
          <p>
            {mood
              ? `${MOODS.find(m => m.id === mood)?.label || ''} songs`
              : 'Latest hits, classics, and more'}
          </p>
        </div>
        <div className="hero-art">
          {currentLang?.hero ? (
            <img
              key={currentLang.hero}
              src={currentLang.hero}
              alt={`${currentLang.label} music`}
              className="hero-art-img"
            />
          ) : (
            <div className="hero-art-fallback" />
          )}
        </div>
      </section>

      {/* ── Indian / YouTube-resolved songs ── */}
      {indianSongs.length > 0 && (
        <section className="content-section">
          <div className="section-header">
            <div>
              <p className="section-kicker">{currentLang?.flag} {currentLang?.label} · Full tracks via YouTube</p>
              <h2>{mood ? `${MOODS.find(m => m.id === mood)?.label} songs` : 'Popular songs'}</h2>
            </div>
            <span className="badge badge--full" style={{ background:'rgba(255,0,0,0.15)', color:'#ff4444', border:'1px solid rgba(255,0,0,0.3)' }}>
              ▶ YouTube
            </span>
          </div>
          <div className="album-grid">
            {indianSongs.map(t => (
              <AlbumCard key={t.id} track={t}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Full / Audius songs ── */}
      {fullSongs.length > 0 && (
        <section className="content-section">
          <div className="section-header">
            <div>
              <p className="section-kicker">Free &amp; full length</p>
              <h2>Full songs — Audius &amp; English</h2>
            </div>
            <span className="badge badge--full">Complete tracks</span>
          </div>
          <div className="album-grid">
            {fullSongs.map(t => (
              <AlbumCard key={t.id} track={t}
                isActive={currentTrack?.id === t.id}
                isResolving={resolvingId === t.id}
                onPlay={handlePlay}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Loading state ── */}
      {isLoadingExt && extPlayable.length === 0 && (
        <div className="loading-msg">⟳ Loading {currentLang?.label} songs…</div>
      )}

      {/* ── Load more ── */}
      <button
        className="load-more-btn"
        onClick={() => doLoadExternal(language, mood, extPage, '')}
        disabled={isLoadingExt}
      >
        {isLoadingExt ? '⟳ Loading…' : `+ Load more ${currentLang?.label} songs`}
      </button>
    </>
  );
}
