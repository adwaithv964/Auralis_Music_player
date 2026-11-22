import './search.css';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { artProxy, trackHasAudio, fmt } from '../../utils/audioHelpers';

// ── GENRE DATA (10 Independent Clean Artwork Assets) ───────────────
const GENRES = [
  { id: 'malayalam', name: 'Malayalam', image: '/assets/auralis/search/genres/malayalam.webp' },
  { id: 'tamil',     name: 'Tamil',     image: '/assets/auralis/search/genres/tamil.webp' },
  { id: 'hindi',     name: 'Hindi',     image: '/assets/auralis/search/genres/hindi.webp' },
  { id: 'english',   name: 'English',   image: '/assets/auralis/search/genres/english.webp' },
  { id: 'pop',       name: 'Pop',       image: '/assets/auralis/search/genres/pop.webp' },
  { id: 'rock',      name: 'Rock',      image: '/assets/auralis/search/genres/rock.webp' },
  { id: 'lofi',      name: 'Lo-Fi',     image: '/assets/auralis/search/genres/lofi.webp' },
  { id: 'chill',     name: 'Chill',     image: '/assets/auralis/search/genres/chill.webp' },
  { id: 'workout',   name: 'Workout',   image: '/assets/auralis/search/genres/workout.webp' },
  { id: 'romantic',  name: 'Romantic',  image: '/assets/auralis/search/genres/romantic.webp' },
];

// ── TRENDING SEARCH CHIPS ─────────────────────────────────────────
const TRENDING_SEARCHES = [
  'Rathinamo',
  'Asalayavale',
  'Jakes Bejoy',
  'Malayalam Hits',
  'The War Cry',
];

// ── POPULAR ARTISTS REFERENCE ─────────────────────────────────────
const POPULAR_ARTISTS = [
  { name: 'Jakes Bejoy' },
  { name: 'Saurav Srisan' },
  { name: 'Govind Vasantha' },
  { name: 'Hanan Shah' },
  { name: 'Vishnu Vijay' },
  { name: 'A.R. Rahman' },
];

// ── CATEGORIES ────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'All',       label: 'All' },
  { id: 'Songs',     label: 'Songs',     icon: 'music' },
  { id: 'Artists',   label: 'Artists',   icon: 'user' },
  { id: 'Albums',    label: 'Albums',    icon: 'disc' },
  { id: 'Playlists', label: 'Playlists', icon: 'list' },
  { id: 'Genres',    label: 'Genres',    icon: 'grid' },
  { id: 'Radio',     label: 'Radio',     icon: 'radio' },
];

export function Search() {
  const {
    searchQuery, setSearchQuery,
    localTracks, externalTracks,
    playlists,
    isLoadingExt, doLoadExternal,
    language, mood,
    setMobileNavOpen,
    openPlaylistModal,
  } = useApp();

  const { currentUser } = useAuth();
  const { currentTrack, isPlaying, setActiveQueueAndPlay } = usePlayer();

  const [activeCategory, setActiveCategory] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [apiResults, setApiResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);

  // Combine playable local/cached pool
  const allPlayable = useMemo(() => {
    return [...localTracks.filter(trackHasAudio), ...externalTracks.filter(trackHasAudio)];
  }, [localTracks, externalTracks]);

  // Debounced API search when query changes
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setApiResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchExternal(q, language, 0, mood);
        setApiResults((data.tracks || []).filter(trackHasAudio));
      } catch (err) {
        console.warn('Search query failed:', err.message);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, language, mood]);

  // Fallback track for display when no track is currently playing (reference: Rathinamo)
  const referenceTrack = useMemo(() => ({
    id: 'ref-rathinamo',
    title: 'Rathinamo',
    artist: 'Saurav Srisan',
    album: 'Rathinamo - Single',
    duration: 177,
    artworkUrl: externalTracks.find(t => t.title?.toLowerCase().includes('rathinamo'))?.artworkUrl
      || 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/41/9f/72/419f72f2-4779-b12e-a533-9794926db299/196874622896.jpg/600x600bb.jpg',
  }), [externalTracks]);

  const activeTrack = currentTrack || referenceTrack;

  // Filtered search results: Prioritize live JioSaavn/API results; merge local playable matches
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    if (apiResults.length > 0) return apiResults;
    const q = searchQuery.toLowerCase().trim();
    return allPlayable.filter(t =>
      `${t.title} ${t.artist} ${t.album || ''} ${t.genre || ''}`.toLowerCase().includes(q)
    );
  }, [searchQuery, apiResults, allPlayable]);

  // Top result card
  const topResult = useMemo(() => {
    if (searchResults.length > 0) return searchResults[0];
    if (searchQuery.trim()) {
      return {
        id: 'top-' + searchQuery,
        title: searchQuery,
        artist: 'Top Result',
        artworkUrl: activeTrack.artworkUrl,
        duration: 177,
      };
    }
    return null;
  }, [searchResults, searchQuery, activeTrack]);

  // Matching artists
  const matchingArtists = useMemo(() => {
    const seen = new Set();
    const list = [];
    const pool = searchResults.length > 0 ? searchResults : allPlayable;
    pool.forEach(t => {
      const a = t.artist?.split(/[,&]/)[0]?.trim();
      if (a && !seen.has(a.toLowerCase())) {
        seen.add(a.toLowerCase());
        list.push({ name: a, artworkUrl: t.artworkUrl });
      }
    });
    // Add reference artists
    POPULAR_ARTISTS.forEach(pa => {
      if (!seen.has(pa.name.toLowerCase())) {
        seen.add(pa.name.toLowerCase());
        const match = allPlayable.find(t => t.artist?.toLowerCase().includes(pa.name.toLowerCase()));
        list.push({ name: pa.name, artworkUrl: match?.artworkUrl || null });
      }
    });
    return list.slice(0, 8);
  }, [searchResults, allPlayable]);

  // Matching albums
  const matchingAlbums = useMemo(() => {
    const map = new Map();
    searchResults.forEach(t => {
      const alb = t.album || 'Single';
      if (!map.has(alb.toLowerCase())) {
        map.set(alb.toLowerCase(), {
          title: alb,
          artist: t.artist,
          artworkUrl: t.artworkUrl,
          trackCount: 1,
        });
      } else {
        map.get(alb.toLowerCase()).trackCount++;
      }
    });
    return Array.from(map.values());
  }, [searchResults]);

  // Matching playlists
  const matchingPlaylists = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return playlists || [];
    return (playlists || []).filter(p => p.name?.toLowerCase().includes(q));
  }, [searchQuery, playlists]);

  // Matching genres
  const matchingGenres = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return GENRES;
    return GENRES.filter(g => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q));
  }, [searchQuery]);

  // ── Actions ─────────────────────────────────────────────────────
  const handleQueryChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleClear = () => {
    setSearchQuery('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleChipClick = (term) => {
    setSearchQuery(term);
    doLoadExternal(language, mood, 0, term);
  };

  const handleGenreClick = (genre) => {
    setSearchQuery(genre.name);
    doLoadExternal(genre.id, '', 0, '');
  };

  const handleArtistClick = (artistName) => {
    setSearchQuery(artistName);
    doLoadExternal(language, mood, 0, artistName);
  };

  const handlePlayTrack = (track) => {
    const queue = searchResults.length > 0 ? searchResults : [track];
    setActiveQueueAndPlay(queue, track);
  };

  const hasQuery = searchQuery.trim().length > 0;

  // Category Icon Renderer
  const renderCategoryIcon = (icon) => {
    switch (icon) {
      case 'music':
        return (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        );
      case 'user':
        return (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      case 'disc':
        return (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        );
      case 'list':
        return (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        );
      case 'grid':
        return (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        );
      case 'radio':
        return (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="search-v3">
      {/* ── DESKTOP TOPBAR ─────────────────────────────────── */}
      <header className="search-topbar-desktop">
        <div className="topbar-nav">
          <button className="topbar-nav-btn" onClick={() => window.history.back()} aria-label="Go back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" />
            </svg>
          </button>
          <button className="topbar-nav-btn" onClick={() => window.history.forward()} aria-label="Go forward">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
              <path d="M9 18l6-6-6-6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="topbar-actions">
          <button className="topbar-icon-btn" aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="notif-dot" />
          </button>

          <div className="window-controls">
            <button className="window-btn" aria-label="Minimize">─</button>
            <button className="window-btn" aria-label="Maximize">□</button>
            <button className="window-btn" aria-label="Close">✕</button>
          </div>
        </div>
      </header>

      {/* ── MOBILE TOPBAR (Discovery state) ────────────────── */}
      {!hasQuery && (
        <header className="search-topbar-mobile">
          <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>

          <div className="mobile-brand">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M12 3v18M8 6v12M4 9v6M16 6v12M20 9v6" stroke="var(--em-accent, #39E89A)" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <span className="mobile-brand-title">Auralis</span>
          </div>

          <div className="mobile-actions">
            <button className="topbar-icon-btn" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="notif-dot" />
            </button>

            <div className="mobile-user-avatar" onClick={() => setMobileNavOpen(true)}>
              {(currentUser?.username?.[0] || 'C').toUpperCase()}
            </div>
          </div>
        </header>
      )}

      {/* ── MOBILE RESULTS HEADER (with Back button) ───────── */}
      {hasQuery && (
        <header className="search-topbar-mobile-results">
          <button className="back-btn" onClick={handleClear} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="search-bar-wrap" style={{ height: 42 }}>
            <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="search-bar-input"
              value={searchQuery}
              onChange={handleQueryChange}
              placeholder="Search..."
              autoFocus
            />
            <button className="search-bar-clear" onClick={handleClear} aria-label="Clear search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>
      )}

      {/* ── MAIN CONTENT AREA ──────────────────────────────── */}
      <div className="search-content">
        {/* Search Heading (Discovery view) */}
        {!hasQuery && (
          <div className="search-heading-block">
            <h1 className="search-page-title">Search</h1>
            <p className="search-page-subtitle">Find your favorite songs, artists, albums and playlists</p>
          </div>
        )}

        {/* Primary Search Input:
            - On Desktop: ALWAYS visible so user can search and clear anytime
            - On Mobile: visible during Discovery; mobile results header replaces it on results */}
        <div className={`search-input-container ${hasQuery ? 'desktop-only-input' : ''}`}>
          <div className="search-bar-wrap">
            <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="search-bar-input"
              placeholder="Search for songs, artists, albums, playlists..."
              value={searchQuery}
              onChange={handleQueryChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  doLoadExternal(language, mood, 0, searchQuery);
                }
              }}
            />
            {searchQuery && (
              <button className="search-bar-clear" onClick={handleClear} aria-label="Clear search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          <button
            className={`search-filter-toggle ${filterOpen ? 'active' : ''}`}
            onClick={() => setFilterOpen(!filterOpen)}
            aria-label="Filter search"
            title="Filter"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Category Filter Pills Bar */}
        <div className="search-categories-bar">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`category-pill ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.icon && renderCategoryIcon(cat.icon)}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* ═════════════════════════════════════════════════════════
            DISCOVERY STATE (No Query)
            ═════════════════════════════════════════════════════════ */}
        {!hasQuery && (
          <>
            {/* 1. Browse by Genre */}
            <section className="search-section">
              <div className="search-section-header">
                <h2 className="search-section-title">Browse by Genre</h2>
                <button className="search-see-all-btn">
                  See All <span>›</span>
                </button>
              </div>

              <div className="genre-grid">
                {GENRES.map((g) => (
                  <button
                    key={g.id}
                    className="genre-card"
                    onClick={() => handleGenreClick(g)}
                  >
                    <img
                      src={g.image}
                      alt={g.name}
                      className="genre-card-bg"
                      loading="lazy"
                    />
                    <div className="genre-card-overlay" />
                    <h3 className="genre-card-title">{g.name}</h3>
                  </button>
                ))}
              </div>
            </section>

            {/* 2. Trending Searches */}
            <section className="search-section">
              <div className="search-section-header">
                <h2 className="search-section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--em-accent, #39E89A)" strokeWidth="2.5">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="17 6 23 6 23 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Trending Searches
                </h2>
              </div>

              <div className="trending-chips-wrap">
                {TRENDING_SEARCHES.map(term => (
                  <button
                    key={term}
                    className="trending-chip"
                    onClick={() => handleChipClick(term)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <span>{term}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 3. Popular Artists */}
            <section className="search-section">
              <div className="search-section-header">
                <h2 className="search-section-title">Popular Artists</h2>
                <button className="search-see-all-btn">
                  See All <span>›</span>
                </button>
              </div>

              <div className="artists-row">
                {POPULAR_ARTISTS.map((artist) => {
                  const match = allPlayable.find(t => t.artist?.toLowerCase().includes(artist.name.toLowerCase()));
                  const artSrc = match?.artworkUrl ? artProxy(match.artworkUrl) : null;

                  return (
                    <button
                      key={artist.name}
                      className="popular-artist-card"
                      onClick={() => handleArtistClick(artist.name)}
                    >
                      <div className="artist-avatar-wrap">
                        {artSrc ? (
                          <img src={artSrc} alt={artist.name} className="artist-avatar-img" />
                        ) : (
                          <div className="artist-avatar-fallback">
                            {artist.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className="artist-card-name">{artist.name}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ═════════════════════════════════════════════════════════
            RESULTS STATE (With Query)
            ═════════════════════════════════════════════════════════ */}
        {hasQuery && (
          <>
            {/* Top Result Card */}
            {(activeCategory === 'All' || activeCategory === 'Songs') && topResult && (
              <section className="search-section">
                <div className="search-section-header">
                  <h2 className="search-section-title">Top Result</h2>
                </div>

                <div
                  className="top-result-card"
                  onClick={() => handlePlayTrack(topResult)}
                >
                  <div className="top-result-left">
                    <div className="top-result-art-wrap">
                      <img
                        src={topResult.artworkUrl ? artProxy(topResult.artworkUrl) : '/assets/auralis/home/malayalam-mix.webp'}
                        alt={topResult.title}
                        className="top-result-art"
                      />
                      <div className={`top-result-play-overlay ${currentTrack?.id === topResult.id && isPlaying ? 'always-show' : ''}`}>
                        <button className="top-result-play-btn" aria-label="Play">
                          {currentTrack?.id === topResult.id && isPlaying ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                              <rect x="6" y="4" width="4" height="16" rx="1" />
                              <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ marginLeft: 2 }}>
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="top-result-info">
                      <h3 className="top-result-title">{topResult.title}</h3>
                      <p className="top-result-subtitle">Song • {topResult.artist}</p>
                    </div>
                  </div>

                  <div className="top-result-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="more-options-btn"
                      onClick={() => openPlaylistModal(topResult)}
                      aria-label="More options"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <circle cx="12" cy="6" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="18" r="2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Songs Section */}
            {(activeCategory === 'All' || activeCategory === 'Songs') && (
              <section className="search-section">
                <div className="search-section-header">
                  <h2 className="search-section-title">Songs</h2>
                  <button className="search-see-all-btn">
                    See All <span>›</span>
                  </button>
                </div>

                <div className="search-songs-list">
                  {searchResults.slice(0, activeCategory === 'Songs' ? 30 : 6).map((track, idx) => {
                    const isCurrent = currentTrack?.id === track.id;
                    const art = track.artworkUrl ? artProxy(track.artworkUrl) : '/assets/auralis/home/malayalam-mix.webp';

                    return (
                      <div
                        key={track.id || idx}
                        className={`search-song-row ${isCurrent ? 'active' : ''}`}
                        onClick={() => handlePlayTrack(track)}
                      >
                        <div className="search-song-left">
                          <img src={art} alt={track.title} className="search-song-art" />
                          <div className="search-song-meta">
                            <p className="search-song-title">{track.title}</p>
                            <p className="search-song-artist">
                              {track.artist} {track.duration ? `• ${fmt(track.duration)}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="search-song-right" onClick={(e) => e.stopPropagation()}>
                          {isCurrent && isPlaying ? (
                            <div className="eq-bars">
                              <span /><span /><span /><span />
                            </div>
                          ) : (
                            <span className="search-song-duration">{fmt(track.duration || 180)}</span>
                          )}

                          <button
                            className="more-options-btn"
                            onClick={() => openPlaylistModal(track)}
                            aria-label="More options"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Artists Section */}
            {(activeCategory === 'All' || activeCategory === 'Artists') && matchingArtists.length > 0 && (
              <section className="search-section">
                <div className="search-section-header">
                  <h2 className="search-section-title">Artists</h2>
                  <button className="search-see-all-btn">
                    See All <span>›</span>
                  </button>
                </div>

                <div className="artists-row">
                  {matchingArtists.map((artist) => (
                    <button
                      key={artist.name}
                      className="popular-artist-card"
                      onClick={() => handleArtistClick(artist.name)}
                    >
                      <div className="artist-avatar-wrap">
                        {artist.artworkUrl ? (
                          <img src={artProxy(artist.artworkUrl)} alt={artist.name} className="artist-avatar-img" />
                        ) : (
                          <div className="artist-avatar-fallback">
                            {artist.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className="artist-card-name">{artist.name}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Albums Section */}
            {(activeCategory === 'All' || activeCategory === 'Albums') && matchingAlbums.length > 0 && (
              <section className="search-section">
                <div className="search-section-header">
                  <h2 className="search-section-title">Albums</h2>
                </div>

                <div className="artists-row">
                  {matchingAlbums.slice(0, activeCategory === 'Albums' ? 24 : 6).map((album) => (
                    <button
                      key={album.title}
                      className="popular-artist-card"
                      style={{ borderRadius: 12 }}
                      onClick={() => setSearchQuery(album.title)}
                    >
                      <div className="artist-avatar-wrap" style={{ borderRadius: 10 }}>
                        {album.artworkUrl ? (
                          <img src={artProxy(album.artworkUrl)} alt={album.title} className="artist-avatar-img" style={{ borderRadius: 10 }} />
                        ) : (
                          <div className="artist-avatar-fallback" style={{ borderRadius: 10 }}>
                            {album.title.charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className="artist-card-name" style={{ textAlign: 'center', marginTop: 6, fontWeight: 600 }}>{album.title}</p>
                      <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{album.artist}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Playlists Section */}
            {(activeCategory === 'All' || activeCategory === 'Playlists') && matchingPlaylists.length > 0 && (
              <section className="search-section">
                <div className="search-section-header">
                  <h2 className="search-section-title">Playlists</h2>
                </div>

                <div className="artists-row">
                  {matchingPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      className="popular-artist-card"
                      style={{ borderRadius: 12 }}
                      onClick={() => {
                        if (pl.tracks?.length) {
                          setActiveQueueAndPlay(pl.tracks, pl.tracks[0]);
                        }
                      }}
                    >
                      <div className="artist-avatar-wrap" style={{ borderRadius: 10, background: pl.color || 'var(--em-accent, #39E89A)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.2" width="28" height="28">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                      <p className="artist-card-name" style={{ textAlign: 'center', marginTop: 6, fontWeight: 600 }}>{pl.name}</p>
                      <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{pl.tracks?.length || 0} songs</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Genres Section */}
            {(activeCategory === 'All' || activeCategory === 'Genres') && (
              <section className="search-section">
                <div className="search-section-header">
                  <h2 className="search-section-title">Genres</h2>
                </div>

                <div className="genre-grid">
                  {matchingGenres.map((g) => (
                    <button
                      key={g.id}
                      className="genre-card"
                      onClick={() => handleGenreClick(g)}
                    >
                      <img src={g.image} alt={g.name} className="genre-card-bg" loading="lazy" />
                      <div className="genre-card-overlay" />
                      <h3 className="genre-card-title">{g.name}</h3>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Empty State */}
            {!isLoadingExt && !isSearching && searchResults.length === 0 && (
              <div className="search-empty-state">
                <div className="search-empty-icon">🔍</div>
                <h3 className="search-empty-title">No results found</h3>
                <p className="search-empty-sub">Try another song, artist, album or playlist.</p>
                <button
                  className="search-online-btn"
                  onClick={() => doLoadExternal(language, mood, 0, searchQuery)}
                >
                  Search online ↗
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
