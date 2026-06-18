import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { artProxy } from '../../utils/audioHelpers';
import './PlaylistModal.css';

/**
 * PlaylistModal — Spotify-exact design
 * All hooks are declared before any conditional return (Rules of Hooks).
 */
export function PlaylistModal() {
  const {
    playlists,
    playlistModal,
    closePlaylistModal,
    createPlaylist,
    addToPlaylist,
  } = useApp();

  // ── ALL hooks declared here, BEFORE any conditional return ────
  const [phase,   setPhase]   = useState('list');   // 'list' | 'create'
  const [query,   setQuery]   = useState('');
  const [newName, setNewName] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [added,   setAdded]   = useState({});        // { [playlistId]: true }

  const nameRef   = useRef(null);
  const searchRef = useRef(null);

  const { open, track } = playlistModal;

  // Auto-focus search when modal opens / reset state on close
  useEffect(() => {
    if (open) {
      setPhase('list');
      setQuery('');
      setNewName('');
      setAdded({});
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open]);

  // Auto-focus name input when switching to create phase
  useEffect(() => {
    if (phase === 'create') setTimeout(() => nameRef.current?.focus(), 60);
  }, [phase]);

  // ── Handlers (must also be before the early return) ──────────
  const handleAdd = useCallback(async (pl) => {
    if (!track || added[pl.id]) return;
    try {
      await addToPlaylist(pl.id, track);
      setAdded(prev => ({ ...prev, [pl.id]: true }));
    } catch (e) {
      console.error('add to playlist', e);
    }
  }, [track, added, addToPlaylist]);

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const pl = await createPlaylist({ name: newName.trim(), color: '#1db954' });
      if (track) {
        await addToPlaylist(pl.id, track);
        setAdded(prev => ({ ...prev, [pl.id]: true }));
      }
      setPhase('list');
      setNewName('');
    } catch (err) {
      console.error('create playlist', err);
    } finally {
      setSaving(false);
    }
  }, [newName, track, createPlaylist, addToPlaylist]);

  // ── Derived ───────────────────────────────────────────────────
  const filtered = playlists.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  // ── Early return (AFTER all hooks) ────────────────────────────
  if (!open) return null;

  // ── Mosaic cover ──────────────────────────────────────────────
  const MosaicCover = ({ playlist, size = 48 }) => {
    const imgs = (playlist.tracks || [])
      .filter(t => t.artworkUrl)
      .slice(0, 4)
      .map(t => artProxy(t.artworkUrl));

    if (imgs.length === 0) {
      return (
        <div className="spm-cover spm-cover--empty"
          style={{ width: size, height: size,
            background: `linear-gradient(135deg,${playlist.color || '#1db954'},#111)` }}>
          <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"
            width={size * 0.45} height={size * 0.45}>
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
          </svg>
        </div>
      );
    }
    if (imgs.length < 4) {
      return (
        <div className="spm-cover" style={{ width: size, height: size }}>
          <img src={imgs[0]} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      );
    }
    return (
      <div className="spm-cover spm-cover--mosaic" style={{ width: size, height: size }}>
        {imgs.map((src, i) => (
          <img key={i} src={src} alt=""
            style={{ width: '50%', height: '50%', objectFit: 'cover', display: 'block' }} />
        ))}
      </div>
    );
  };

  // ── Close / X icon ────────────────────────────────────────────
  const XIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div className="spm-backdrop" onClick={closePlaylistModal} />

      {/* Sheet */}
      <div className="spm-sheet" role="dialog" aria-modal="true"
        aria-label={phase === 'create' ? 'Create playlist' : 'Add to playlist'}>

        {/* Drag handle */}
        <div className="spm-handle" />

        {/* ══════════════ LIST phase ══════════════ */}
        {phase === 'list' && (
          <>
            {/* Header */}
            <div className="spm-header">
              <h2 className="spm-title">Add to playlist</h2>
              <button className="spm-x-btn" onClick={closePlaylistModal} aria-label="Close">
                <XIcon />
              </button>
            </div>

            {/* Search */}
            <div className="spm-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" width="16" height="16" className="spm-search-icon">
                <circle cx="11" cy="11" r="7"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <input ref={searchRef} className="spm-search" type="search"
                placeholder="Find a playlist" value={query}
                onChange={e => setQuery(e.target.value)} />
            </div>

            {/* "Create playlist" row */}
            <button className="spm-row spm-row--create" onClick={() => setPhase('create')}>
              <div className="spm-create-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" width="22" height="22">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5"  y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <span className="spm-row-name">Create playlist</span>
            </button>

            {/* Playlist scroll list */}
            <div className="spm-list">
              {filtered.length === 0 && (
                <p className="spm-empty">No playlists found</p>
              )}
              {filtered.map(pl => {
                const isAdded    = !!added[pl.id];
                const alreadyHas = track && (pl.tracks || []).some(t => t.id === track.id);
                const done       = isAdded || alreadyHas;
                return (
                  <button key={pl.id}
                    className={`spm-row${done ? ' spm-row--added' : ''}`}
                    onClick={() => !done && handleAdd(pl)}>
                    <MosaicCover playlist={pl} size={48} />
                    <div className="spm-row-meta">
                      <span className="spm-row-name">{pl.name}</span>
                      <span className="spm-row-sub">
                        Playlist · {pl.tracks?.length ?? 0} songs
                      </span>
                    </div>
                    {done && (
                      <svg className="spm-check" viewBox="0 0 24 24" fill="none"
                        stroke="var(--accent)" strokeWidth="2.5" width="20" height="20">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ══════════════ CREATE phase ══════════════ */}
        {phase === 'create' && (
          <div className="spm-create-phase">
            {/* Header with back arrow */}
            <div className="spm-header">
              <button className="spm-back-btn" onClick={() => setPhase('list')}
                aria-label="Back">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
              </button>
              <h2 className="spm-title">Create playlist</h2>
              <button className="spm-x-btn" onClick={closePlaylistModal} aria-label="Close">
                <XIcon />
              </button>
            </div>

            {/* Track artwork preview */}
            <div className="spm-create-art-wrap">
              {track?.artworkUrl ? (
                <img src={artProxy(track.artworkUrl)} alt={track?.title}
                  className="spm-create-art" />
              ) : (
                <div className="spm-create-art spm-create-art--empty">
                  <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)"
                    width="48" height="48">
                    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                  </svg>
                </div>
              )}
            </div>

            {/* Form */}
            <form className="spm-create-form" onSubmit={handleCreate}>
              <input ref={nameRef} className="spm-name-input" type="text"
                placeholder="My playlist #1"
                value={newName} onChange={e => setNewName(e.target.value)}
                maxLength={60} />
              {track && (
                <p className="spm-create-hint">
                  Adding: <em>{track.title}</em>
                </p>
              )}
              <button type="submit" className="spm-save-btn"
                disabled={!newName.trim() || saving}>
                {saving ? 'Creating…' : 'Create'}
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
