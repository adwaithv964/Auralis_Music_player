import { useState, useEffect, useCallback, useRef } from 'react';
import { SvgSprite } from './components/Icons';
import { api } from './api';
import { useAudioEngine } from './hooks/useAudioEngine';
import { Preferences } from './Preferences';
import './index.css';

/* ─── Helpers ─────────────────────────────────────────────── */
function fmt(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
function artProxy(url) {
  if (!url) return '';
  if (url.startsWith('/api/')) return url;
  return `/api/artwork?url=${encodeURIComponent(url)}`;
}
const trackHasAudio = t => !!(t?.previewUrl);
const isFullSong    = t => t?.isFull === true || t?.sourceType === 'audius';

/* ─── Constants ───────────────────────────────────────────── */
const LANGUAGES = [
  { id: 'malayalam', label: 'Malayalam', flag: '🌴', desc: 'Mollywood hits',  hero: '/assets/hero_malayalam.png' },
  { id: 'tamil',     label: 'Tamil',     flag: '🎶', desc: 'Kollywood & more', hero: '/assets/hero_tamil.png' },
  { id: 'hindi',     label: 'Hindi',     flag: '🎬', desc: 'Bollywood',       hero: '/assets/hero_hindi.png' },
  { id: 'english',   label: 'English',   flag: '🌍', desc: 'Global hits',     hero: '/assets/hero_english.png' },
  { id: 'all',       label: 'All',       flag: '🇮🇳', desc: 'Mix of all',    hero: null },
];


const MOODS = [
  { id: '',          label: 'All moods' },
  { id: 'romantic',  label: '❤️ Romantic' },
  { id: 'party',     label: '🎉 Party' },
  { id: 'melody',    label: '🎵 Melody' },
  { id: 'sad',       label: '💙 Sad' },
  { id: 'folk',      label: '🌾 Folk' },
  { id: 'devotional',label: '🙏 Devotional' },
];

/* ─── Sub-components ──────────────────────────────────────── */
function SourceBadge({ track, small }) {
  if (!track) return null;
  if (track.ytResolved)
    return <span className={`badge badge--youtube${small ? ' badge--sm' : ''}`}>▶ YouTube</span>;
  if (isFullSong(track))
    return <span className={`badge badge--full${small ? ' badge--sm' : ''}`}>▶ Full</span>;
  return null; // unresolved iTunes tracks get no badge
}


function AlbumCard({ track, isActive, isResolving, onPlay }) {
  const hasArt   = !!track.artworkUrl;
  const hasAudio = trackHasAudio(track);
  const full     = isFullSong(track) || track.ytResolved;
  const initials = track.title?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '♪';
  const bg = hasArt
    ? `url(${artProxy(track.artworkUrl)}) center/cover no-repeat`
    : `linear-gradient(135deg, ${track.color?.[0] || '#1db954'}, ${track.color?.[1] || '#191414'})`;

  return (
    <button
      className={`album-card${isActive ? ' album-card--active' : ''}${!hasAudio ? ' album-card--disabled' : ''}`}
      onClick={() => hasAudio && onPlay(track)}
      title={track.title}
    >
      <div className="album-card-art" style={{ background: bg }}>
        {!hasArt && <span className="album-card-initials">{initials}</span>}
        {isResolving ? (
          <div className="album-card-resolving">
            <div className="spinner" />
            <span>Loading full track…</span>
          </div>
        ) : hasAudio && (
          <div className="album-card-play-btn">
            <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
          </div>
        )}
      </div>
      <p className="album-card-title">{track.title}</p>
      <p className="album-card-artist">{track.artist}</p>
    </button>
  );
}

function TrackCard({ track, isActive, isPlaying, index, onPlay }) {
  const hasAudio = trackHasAudio(track);
  const bg = track.artworkUrl
    ? `url(${artProxy(track.artworkUrl)}) center/cover`
    : `linear-gradient(135deg, ${track.color?.[0] || '#1db954'}, ${track.color?.[1] || '#191414'})`;
  return (
    <button
      className={`track-row${isActive ? ' active' : ''}${!hasAudio ? ' track-row--disabled' : ''}`}
      onClick={() => hasAudio && onPlay(track)}
    >
      <div className="track-number">
        {isActive && isPlaying
          ? <div className="playing-bars"><span /><span /><span /></div>
          : index + 1}
      </div>
      <div className="track-cover" style={{ background: bg }} />
      <div className="track-info">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">{track.artist}</span>
      </div>
      <div className="track-album">{track.album}</div>
      <div className="track-duration">{fmt(track.duration)}</div>
    </button>
  );
}

function SuggestionItem({ track, onPick }) {
  const bg = track.artworkUrl
    ? `url(${artProxy(track.artworkUrl)}) center/cover`
    : `linear-gradient(135deg, ${track.color?.[0] || '#1db954'}, #191414)`;
  return (
    <button className="suggestion-item" onMouseDown={() => onPick(track)}>
      <div className="suggestion-art" style={{ background: bg }} />
      <div className="suggestion-info">
        <span className="suggestion-title">{track.title}</span>
        <span className="suggestion-artist">{track.artist}</span>
      </div>
    </button>
  );
}

/* ─── Language Tab Bar ────────────────────────────────────── */
function LangTabs({ language, onChange }) {
  return (
    <div className="lang-tabs" role="tablist" aria-label="Language filter">
      {LANGUAGES.map(l => (
        <button
          key={l.id}
          role="tab"
          aria-selected={language === l.id}
          className={`lang-tab${language === l.id ? ' lang-tab--active' : ''}`}
          onClick={() => onChange(l.id)}
        >
          <span className="lang-tab-flag">{l.flag}</span>
          <span className="lang-tab-label">{l.label}</span>
          <span className="lang-tab-desc">{l.desc}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Mood Chip Bar ───────────────────────────────────────── */
function MoodBar({ mood, onChange }) {
  return (
    <div className="mood-bar" role="group" aria-label="Mood filter">
      {MOODS.map(m => (
        <button
          key={m.id}
          className={`mood-chip${mood === m.id ? ' mood-chip--active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Main App ────────────────────────────────────────────── */
export default function App() {
  const [view,           setView]           = useState('home');
  const [mobileNavOpen,  setMobileNavOpen]  = useState(false); // sidebar drawer on mobile
  const [mobileNowOpen,  setMobileNowOpen]  = useState(false); // now-playing sheet on mobile
  const [prefs, setPrefs]             = useState({ volume: 62, theme: 'dark', accent: '#1db954' });
  const [localTracks, setLocalTracks] = useState([]);
  const [externalTracks, setExternalTracks] = useState([]);
  const [playlists, setPlaylists]     = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [shuffle, setShuffle]         = useState(false);
  const [repeat, setRepeat]           = useState(false);
  const [showPrefs, setShowPrefs]     = useState(false);
  const [language, setLanguage]       = useState('malayalam'); // Malayalam first!
  const [mood, setMood]               = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingExt, setIsLoadingExt] = useState(false);
  const [extPage, setExtPage]             = useState(0);
  const [favorites, setFavorites]         = useState([]);
  const [resolvingId, setResolvingId]     = useState(null); // YouTube resolve loading
  const debounceRef   = useRef(null);
  const resolvedCache = useRef(new Map()); // id → resolved track

  const { isPlaying, play, pause, seek, progress, elapsed, duration, audioRef } =
    useAudioEngine(currentTrack, prefs);

  const playableTracks = [
    ...localTracks.filter(trackHasAudio),
    ...externalTracks.filter(trackHasAudio),
  ];

  /* Bootstrap */
  useEffect(() => {
    api.fetchBootstrap().then(data => {
      setLocalTracks(data.tracks || []);
      setPlaylists(data.playlists || []);
      setFavorites(data.favorites || []);
      if (data.preferences) setPrefs(p => ({ ...p, ...data.preferences }));
    }).catch(console.error);
  }, []);

  /* Theme */
  useEffect(() => {
    document.body.setAttribute('data-theme', prefs.theme || 'dark');
    document.body.style.setProperty('--accent', prefs.accent || '#1db954');
  }, [prefs.theme, prefs.accent]);

  /* Reload when language or mood changes */
  useEffect(() => {
    setExtPage(0);
    setExternalTracks([]);
    doLoadExternal(language, mood, 0, '');
  }, [language, mood]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doLoadExternal(lang, moodVal, page, term) {
    setIsLoadingExt(true);
    try {
      const data = await api.searchExternal(term, lang, page, moodVal);
      const incoming = (data.tracks || []).filter(trackHasAudio);
      if (page === 0) setExternalTracks(incoming);
      else setExternalTracks(prev => {
        const ids = new Set(prev.map(t => t.id));
        return [...prev, ...incoming.filter(t => !ids.has(t.id))];
      });
      setExtPage(page + 1);
      if (!currentTrack && incoming.length) {
        // Auto-select first Indian song
        setCurrentTrack(incoming[0]);
      }
    } catch (e) {
      console.error('loadExternal:', e);
    } finally {
      setIsLoadingExt(false);
    }
  }

  /* Search suggestions */
  const handleSearchChange = useCallback((e) => {
    const q = e.target.value;
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const local = playableTracks
        .filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 3);
      try {
        const ext = await api.searchExternal(q, language, 0, mood);
        const combined = [...local, ...(ext.tracks || []).filter(trackHasAudio).slice(0, 5)];
        setSuggestions(combined.slice(0, 7));
        setShowSuggestions(combined.length > 0);
      } catch (_) {
        setSuggestions(local);
        setShowSuggestions(local.length > 0);
      }
    }, 350);
  }, [playableTracks, language, mood]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlay = useCallback(async (track) => {
    if (!trackHasAudio(track)) return;

    // Already resolved → instant play
    if (resolvedCache.current.has(track.id)) {
      const resolved = resolvedCache.current.get(track.id);
      setCurrentTrack(resolved);
      setTimeout(() => play(), 30);
      api.saveHistory({ id: track.id, title: track.title, artist: track.artist }).catch(() => {});
      return;
    }

    // Audius (already full) → direct play
    if (track.sourceType !== 'itunes') {
      setCurrentTrack(track);
      setTimeout(() => play(), 30);
      api.saveHistory({ id: track.id, title: track.title, artist: track.artist }).catch(() => {});
      return;
    }

    // iTunes track → show loading state, resolve YouTube URL, THEN play
    pause(); // stop anything currently playing
    // Show track metadata in UI (cover, title, artist) but with no audio yet
    setCurrentTrack({ ...track, previewUrl: '', ytLoading: true });
    setResolvingId(track.id);

    try {
      const yt = await api.resolveYouTube(track.title, track.artist);
      if (yt?.streamUrl) {
        const fullTrack = {
          ...track,
          previewUrl: yt.streamUrl,
          isFull:     true,
          ytResolved: true,
          videoId:    yt.videoId,
          lyrics:     ['Full track via YouTube', track.artist, track.album],
        };
        resolvedCache.current.set(track.id, fullTrack);
        setCurrentTrack(fullTrack);
        setTimeout(() => play(), 80); // small delay for audio element to update src
      }
    } catch (e) {
      console.warn('[YouTube resolve failed]', e.message);
      setCurrentTrack(null); // clear loading state on error
    } finally {
      setResolvingId(null);
    }

    api.saveHistory({ id: track.id, title: track.title, artist: track.artist }).catch(() => {});
  }, [play, pause]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuggestionPick = useCallback((track) => {
    setSearchQuery(track.title);
    setView('search');
    setShowSuggestions(false);
    handlePlay(track);
    doLoadExternal(language, mood, 0, track.title);
  }, [language, mood, handlePlay]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    setView('search');
    setShowSuggestions(false);
    doLoadExternal(language, mood, 0, searchQuery);
  }, [language, mood, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(() => { isPlaying ? pause() : play(); }, [isPlaying, play, pause]);

  const handlePrev = useCallback(() => {
    if (!playableTracks.length) return;
    const idx = playableTracks.findIndex(t => t.id === currentTrack?.id);
    handlePlay(playableTracks[(idx - 1 + playableTracks.length) % playableTracks.length]);
  }, [playableTracks, currentTrack, handlePlay]);

  const handleNext = useCallback(() => {
    if (!playableTracks.length) return;
    if (shuffle) { handlePlay(playableTracks[Math.floor(Math.random() * playableTracks.length)]); return; }
    const idx = playableTracks.findIndex(t => t.id === currentTrack?.id);
    handlePlay(playableTracks[repeat ? idx : (idx + 1) % playableTracks.length]);
  }, [playableTracks, currentTrack, shuffle, repeat, handlePlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => handleNext();
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [audioRef, handleNext]);

  const toggleFavorite = useCallback(async (id) => {
    const isFav = favorites.includes(id);
    try {
      const data = await api.toggleFavorite(id, isFav);
      setFavorites(data.favorites || []);
    } catch (e) { console.error(e); }
  }, [favorites]);

  /* Derived */
  const extPlayable   = externalTracks.filter(trackHasAudio);
  const indianSongs   = extPlayable.filter(t => !isFullSong(t));
  const fullSongs     = extPlayable.filter(isFullSong);
  const libraryTracks = playableTracks.filter(t => favorites.includes(t.id));
  const searchResults = searchQuery
    ? playableTracks.filter(t => `${t.title} ${t.artist} ${t.genre}`.toLowerCase().includes(searchQuery.toLowerCase()))
    : extPlayable;

  const displayElapsed  = elapsed  || 0;
  const displayDuration = duration || currentTrack?.duration || 0;
  const isFav = favorites.includes(currentTrack?.id);

  const coverBg = t => t?.artworkUrl
    ? `url(${artProxy(t.artworkUrl)}) center/cover`
    : t ? `linear-gradient(135deg,${t.color?.[0]||'#1db954'},${t.color?.[1]||'#191414'})` : 'none';

  const currentLang = LANGUAGES.find(l => l.id === language);

  return (
    <>
      <SvgSprite />
      <div className="ambient-layer" aria-hidden="true" />
      <div className="app-shell">

        {/* ═══ SIDEBAR ════════════════════════════════════════ */}
        {/* Mobile overlay backdrop */}
        {mobileNavOpen && (
          <div className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} />
        )}
        <aside className={`sidebar glass-panel${mobileNavOpen ? ' sidebar--mobile-open' : ''}`} aria-label="Navigation">
          {/* Mobile sidebar close button */}
          <div className="sidebar-mobile-header">
            <div className="brand">
              <span className="brand-mark" />
              <span className="brand-name">Auralis</span>
            </div>
            <button className="sidebar-close-btn" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="sidebar-actions">
            <button className="action-row" onClick={() => setShowPrefs(true)}>
              <svg><use href="#i-settings" /></svg>
              <span>Preferences</span>
            </button>
          </div>
          {/* Sidebar quick-language shortcuts */}
          <div className="sidebar-lang-strip">
            <p className="section-kicker" style={{ marginBottom: 8 }}>Languages</p>
            {LANGUAGES.map(l => (
              <button
                key={l.id}
                className={`sidebar-lang-btn${language === l.id ? ' active' : ''}`}
                onClick={() => { setLanguage(l.id); setMood(''); setView('home'); setMobileNavOpen(false); }}
              >
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
          <section className="playlist-strip">
            <p className="section-kicker">Playlists</p>
            {playlists.map(p => (
              <button key={p.id} className="playlist-item">
                <div className="playlist-icon" style={{ backgroundColor: prefs.accent }} />
                <div className="playlist-meta">
                  <span className="playlist-name">{p.name}</span>
                  <span className="playlist-count">{p.count} songs</span>
                </div>
              </button>
            ))}
          </section>
        </aside>

        {/* ═══ MAIN ════════════════════════════════════════════ */}
        <main className="main-area">
          {/* Search bar */}
          <header className="topbar">
            {/* Mobile: hamburger menu */}
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

          {/* ══ Language Tab Bar ══ */}
          <LangTabs language={language} onChange={lang => { setLanguage(lang); setMood(''); }} />

          {/* ══ Mood Chip Bar ══ */}
          <MoodBar mood={mood} onChange={m => setMood(m)} />

          {/* ── HOME ── */}
          {view === 'home' && (
            <>
              {/* Hero */}
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

              {/* Indian songs grid (priority) */}
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
                        onPlay={handlePlay} />
                    ))}
                  </div>
                </section>
              )}

              {/* Full songs section */}
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
                        onPlay={handlePlay} />
                    ))}
                  </div>
                </section>
              )}

              {isLoadingExt && extPlayable.length === 0 && (
                <div className="loading-msg">⟳ Loading {currentLang?.label} songs…</div>
              )}

              <button
                className="load-more-btn"
                onClick={() => doLoadExternal(language, mood, extPage, '')}
                disabled={isLoadingExt}
              >
                {isLoadingExt ? '⟳ Loading…' : `+ Load more ${currentLang?.label} songs`}
              </button>
            </>
          )}

          {/* ── SEARCH ── */}
          {view === 'search' && (
            <section className="content-section track-section">
              <div className="section-header">
                <div>
                  <p className="section-kicker">Results</p>
                  <h2>{searchQuery || 'Browse all'}</h2>
                </div>
                {searchQuery && (
                  <button className="text-button" onClick={() => doLoadExternal(language, mood, 0, searchQuery)}>
                    Search online ↗
                  </button>
                )}
              </div>
              {isLoadingExt && <div className="loading-msg">⟳ Searching…</div>}
              <div className="track-list">
                {searchResults.map((t, i) => (
                  <TrackCard key={t.id || i} track={t} index={i}
                    isActive={currentTrack?.id === t.id} isPlaying={isPlaying} onPlay={handlePlay} />
                ))}
                {!isLoadingExt && searchResults.length === 0 && (
                  <p className="empty-msg">No results found. Try "Search online" ↑</p>
                )}
              </div>
            </section>
          )}

          {/* ── LIBRARY ── */}
          {view === 'library' && (
            <section className="content-section track-section">
              <div className="section-header">
                <div><p className="section-kicker">Saved tracks</p><h2>Your Library</h2></div>
              </div>
              {libraryTracks.length > 0 ? (
                <div className="track-list">
                  {libraryTracks.map((t, i) => (
                    <TrackCard key={t.id || i} track={t} index={i}
                      isActive={currentTrack?.id === t.id} isPlaying={isPlaying} onPlay={handlePlay} />
                  ))}
                </div>
              ) : (
                <div className="empty-library">
                  <svg viewBox="0 0 24 24" width="48" height="48" style={{ fill:'none', stroke:'var(--muted)', strokeWidth:1.5 }}>
                    <path d="M20.3 5.8a5 5 0 0 0-7.1 0L12 7l-1.2-1.2a5 5 0 0 0-7.1 7.1L12 21l8.3-8.1a5 5 0 0 0 0-7.1Z" />
                  </svg>
                  <p>Your library is empty</p>
                  <span>Heart a song to save it here</span>
                </div>
              )}
            </section>
          )}
        </main>

        {/* ═══ NOW PLAYING PANEL ══════════════════════════════ */}
        <aside className={`now-panel glass-panel${mobileNowOpen ? ' now-panel--mobile-open' : ''}`}
          aria-label="Now playing">
          {/* Mobile drag handle */}
          <div className="now-panel-mobile-handle" onClick={() => setMobileNowOpen(false)} />

          {currentTrack ? (
            <div className="spotify-now">

              {/* ─ Header: down arrow + context */}
              <div className="spotify-now-header">
                <button className="spotify-down-btn" onClick={() => setMobileNowOpen(false)}
                  aria-label="Close Now Playing">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="24" height="24">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div className="spotify-now-context">
                  <span className="spotify-now-context-label">NOW PLAYING</span>
                  {currentTrack.album && <span className="spotify-now-context-val">{currentTrack.album}</span>}
                </div>
                <button className="spotify-down-btn" title="More options">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <circle cx="12" cy="5" r="1.5"/>
                    <circle cx="12" cy="12" r="1.5"/>
                    <circle cx="12" cy="19" r="1.5"/>
                  </svg>
                </button>
              </div>

              {/* ─ Album artwork */}
              <div className="spotify-now-art">
                {currentTrack.artworkUrl ? (
                  <img
                    src={artProxy(currentTrack.artworkUrl)}
                    alt={currentTrack.title}
                    className="spotify-now-art-img"
                    key={currentTrack.artworkUrl}
                  />
                ) : (
                  <div className="spotify-now-art-fallback"
                    style={{ background: `linear-gradient(135deg, #${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')}44, #1a1a2e)` }} />
                )}
                {/* Loading overlay on artwork */}
                {resolvingId && (
                  <div className="spotify-now-art-loading">
                    <div className="spotify-spinner" />
                    <span>Loading full track…</span>
                  </div>
                )}
              </div>

              {/* ─ Track info + heart */}
              <div className="spotify-now-info">
                <div className="spotify-now-text">
                  <strong className="spotify-now-title">{currentTrack.title}</strong>
                  <span className="spotify-now-artist">{currentTrack.artist}</span>
                  {currentTrack.album && <span className="spotify-now-album">{currentTrack.album}</span>}
                </div>
                <button
                  className={`spotify-heart-btn${isFav ? ' spotify-heart-btn--active' : ''}`}
                  onClick={() => toggleFavorite(currentTrack.id)}
                  title={isFav ? 'Remove from saved' : 'Save to library'}
                >
                  <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="22" height="22">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </div>

              {/* ─ Progress bar + loading shimmer */}
              <div className="spotify-now-progress">
                <div className={`spotify-progress-track${resolvingId ? ' spotify-progress-track--loading' : ''}`}>
                  <div
                    className="spotify-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                  {resolvingId && <div className="spotify-progress-shimmer" />}
                </div>
                <div className="spotify-progress-times">
                  <span>{fmt(displayElapsed)}</span>
                  <span>{fmt(displayDuration)}</span>
                </div>
                {/* Hidden seek input overlaid */}
                <input type="range" className="spotify-seek-input" min="0" max="1000"
                  value={Math.round(progress * 10)}
                  onChange={e => seek(e.target.value / 10)}
                  aria-label="Seek" />
              </div>

              {/* ─ Transport controls + Add to Playlist */}
              <div className="spotify-now-controls">
                <button className={`spotify-ctrl-btn${shuffle ? ' spotify-ctrl-btn--active' : ''}`}
                  onClick={() => setShuffle(s => !s)} title="Shuffle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <path d="M16 3h5v5M4 20l16-16M21 16v5h-5M15 15l6 6M4 4l5 5" />
                  </svg>
                </button>
                <button className="spotify-ctrl-btn spotify-ctrl-btn--lg" onClick={handlePrev} title="Previous">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                  </svg>
                </button>
                <button className="spotify-play-btn" onClick={togglePlay} disabled={!!resolvingId}>
                  {resolvingId ? (
                    <div className="spotify-play-spinner" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                      {isPlaying
                        ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                        : <path d="M8 5.5v13l11-6.5-11-6.5Z"/>}
                    </svg>
                  )}
                </button>
                <button className="spotify-ctrl-btn spotify-ctrl-btn--lg" onClick={handleNext} title="Next">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                    <path d="M6 18l8.5-6L6 6v12zm2-6 8.5 6V6l-8.5 6zm8.5-6h2v12h-2z" />
                  </svg>
                </button>
                <button className={`spotify-ctrl-btn${repeat ? ' spotify-ctrl-btn--active' : ''}`}
                  onClick={() => setRepeat(r => !r)} title="Repeat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </button>
              </div>

              {/* ─ Secondary action row */}
              <div className="spotify-now-actions">
                <button className="spotify-action-btn" title="Add to Playlist">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  <span>Add to playlist</span>
                </button>
                <button className="spotify-action-btn" title="Share">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <span>Share</span>
                </button>
                <button className="spotify-action-btn" title="Queue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="15" y2="18"/>
                  </svg>
                  <span>Queue</span>
                </button>
              </div>

              {/* ─ Volume */}
              <div className="spotify-now-volume">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                <input type="range" min="0" max="100"
                  value={prefs.volume ?? 62}
                  className="spotify-volume-slider"
                  onChange={e => setPrefs(p => ({ ...p, volume: Number(e.target.value) }))} />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </div>

              {/* ─ Source / meta */}
              <div className="spotify-now-meta">
                <SourceBadge track={currentTrack} />
                {currentTrack.genre && <span className="spotify-now-tag">{currentTrack.genre}</span>}
                {currentTrack.year  && <span className="spotify-now-tag">{currentTrack.year}</span>}
              </div>

            </div>
          ) : (
            <div className="empty-now">
              <svg viewBox="0 0 24 24" width="48" height="48" style={{ fill:'none', stroke:'var(--muted)', strokeWidth:1.2 }}>
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="12" y1="2" x2="12" y2="9"/>
                <line x1="12" y1="15" x2="12" y2="22"/>
              </svg>
              <p>Nothing playing</p>
              <span>Pick a song to start listening</span>
            </div>
          )}
        </aside>

        {/* ═══ PLAYER ═══════════════════════════════════════════ */}
        <footer className="player glass-panel">
          {/* Left: mini track info */}
          <div className="mini-now" onClick={() => setMobileNowOpen(true)} style={{ cursor: 'pointer' }}>
            {currentTrack && (
              <>
                {/* Mini artwork */}
                <div className="mini-cover" style={{ background: coverBg(currentTrack) }}>
                  {currentTrack.artworkUrl && (
                    <img src={artProxy(currentTrack.artworkUrl)} alt=""
                      style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'inherit' }} />
                  )}
                </div>
                <div className="mini-copy">
                  <strong>{currentTrack.title}</strong>
                  <span>{currentTrack.artist}</span>
                </div>
                <button className={`icon-button${isFav ? ' favorited' : ''}`}
                  onClick={e => { e.stopPropagation(); toggleFavorite(currentTrack.id); }}
                  style={{ marginLeft:4, flexShrink:0 }}>
                  <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Center: transport + progress */}
          <div className="transport">
            <div className="transport-buttons">
              <button className={`icon-button${shuffle ? ' active' : ''}`} onClick={() => setShuffle(s => !s)}>
                <svg><use href="#i-shuffle" /></svg>
              </button>
              <button className="icon-button" onClick={handlePrev}><svg><use href="#i-prev" /></svg></button>
              <button className="play-button" onClick={togglePlay}>
                <svg><use href={isPlaying ? '#i-pause' : '#i-play'} /></svg>
              </button>
              <button className="icon-button" onClick={handleNext}><svg><use href="#i-next" /></svg></button>
              <button className={`icon-button${repeat ? ' active' : ''}`} onClick={() => setRepeat(r => !r)}>
                <svg><use href="#i-repeat" /></svg>
              </button>
            </div>

            {/* Progress bar — shimmer when loading */}
            <div className={`progress-line${resolvingId ? ' progress-line--loading' : ''}`}>
              <span>{fmt(displayElapsed)}</span>
              <div className="progress-wrap">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
                {resolvingId && <div className="progress-shimmer-bar" />}
                <input type="range" className="progress-seek" min="0" max="1000"
                  value={Math.round(progress * 10)}
                  onChange={e => seek(e.target.value / 10)}
                  aria-label="Seek" />
              </div>
              <span>{fmt(displayDuration)}</span>
            </div>
          </div>

          {/* Right: volume */}
          <div className="volume-zone">
            <svg aria-hidden="true"><use href="#i-volume" /></svg>
            <input type="range" min="0" max="100" value={prefs.volume}
              onChange={e => setPrefs(p => ({ ...p, volume: Number(e.target.value) }))} />
          </div>
        </footer>

        {/* ═══ BOTTOM NAV (always visible, Spotify-style) ═══════ */}
        <nav className="bottom-nav" aria-label="Main navigation">
          {/* Compact mini-player strip — tap to open full Now Playing */}
          {currentTrack && (
            <div className="bmp-strip" onClick={() => setMobileNowOpen(true)}>
              {/* Thin progress line at very top */}
              <div className="bmp-strip-progress">
                <div className="bmp-strip-fill" style={{ width: `${progress}%` }} />
                {resolvingId && <div className="bmp-strip-shimmer" />}
              </div>
              <div className="bmp-strip-inner">
                {/* Album art */}
                <div className="bmp-strip-art" style={{ background: coverBg(currentTrack) }}>
                  {currentTrack.artworkUrl && (
                    <img src={artProxy(currentTrack.artworkUrl)} alt=""
                      style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'inherit' }} />
                  )}
                </div>
                {/* Text */}
                <div className="bmp-strip-text">
                  <strong>{currentTrack.title}</strong>
                  <span>{currentTrack.artist}</span>
                </div>
                {/* Controls: heart + play */}
                <div className="bmp-strip-btns">
                  <button className={`bmp-icon-btn${isFav ? ' bmp-icon-btn--active' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleFavorite(currentTrack.id); }}
                    title={isFav ? 'Saved' : 'Save'}>
                    <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="22" height="22">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                  <button className="bmp-icon-btn bmp-play"
                    onClick={e => { e.stopPropagation(); togglePlay(); }}
                    title={isPlaying ? 'Pause' : 'Play'}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
                      {isPlaying
                        ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                        : <path d="M8 5.5v13l11-6.5-11-6.5Z"/>}
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab bar — 3 tabs only, no Premium */}
          <div className="bottom-nav-tabs">
            {[
              { id: 'home',    label: 'Home',         icon: <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> },
              { id: 'search',  label: 'Search',       icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="26" height="26"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg> },
              { id: 'library', label: 'Your Library', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M3 6h2v12H3zm4-2h2v16H7zm4 4h2v12h-2zm4-6h2v18h-2zm4 2h2v14h-2z"/></svg> },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                className={`bottom-nav-tab${view === id ? ' bottom-nav-tab--active' : ''}`}
                onClick={() => setView(id)}
              >
                <span className="bottom-nav-icon">{icon}</span>
                <span className="bottom-nav-label">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* Preferences panel */}
      {showPrefs && (
        <Preferences prefs={prefs} setPrefs={setPrefs} onClose={() => setShowPrefs(false)} />
      )}
    </>
  );
}
