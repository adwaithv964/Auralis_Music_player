import { useState, useCallback } from 'react';
import { useApp }    from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { trackHasAudio, artProxy } from '../../utils/audioHelpers';
import { TrackContextMenu } from '../../components/TrackContextMenu/TrackContextMenu';
import { api } from '../../services/api';

/**
 * Library page
 *
 * Shows:
 *  1. User-created playlists grid → Spotify-exact detail view
 *  2. Liked Songs track list
 *
 * Playlist detail includes:
 *  - Cover art / gradient header
 *  - Track rows with #, artwork, title/artist, duration
 *  - 3-dot context menu per track: Remove from playlist, Remove/Add liked, Add to queue, Exclude
 */
export function Library() {
  const {
    localTracks, externalTracks, favorites, setFavorites,
    likedSongs,
    playlists, deletePlaylist, removeFromPlaylist, openPlaylistModal,
  } = useApp();
  const { currentTrack, isPlaying, handlePlay, toggleFavorite, addToQueue, setActiveQueueAndPlay } = usePlayer();

  const [activePlaylist, setActivePlaylist] = useState(null);
  const [confirmDelete,  setConfirmDelete]  = useState(null);
  const [contextMenu,    setContextMenu]    = useState(null); // { track, x, y }
  const [toastMsg,       setToastMsg]       = useState('');

  const playableTracks = [
    ...localTracks.filter(trackHasAudio),
    ...externalTracks.filter(trackHasAudio),
  ];
  // Use the persisted snapshot array — never filtered from externalTracks.
  // This is the fix: liked songs show regardless of which external tracks
  // are currently loaded in the session.
  const likedTracks = likedSongs;

  // ── Toast helper ─────────────────────────────────────────────
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2800);
  }, []);

  // ── Delete playlist ──────────────────────────────────────────
  const handleDelete = async (id) => {
    await deletePlaylist(id);
    setConfirmDelete(null);
    if (activePlaylist?.id === id) setActivePlaylist(null);
  };

  // ── Open 3-dot context menu ──────────────────────────────────
  const openCtx = useCallback((e, track) => {
    e.stopPropagation();
    e.preventDefault();
    setContextMenu({ track, x: e.clientX, y: e.clientY });
  }, []);

  // ── Context menu actions ─────────────────────────────────────
  const handleRemoveFromPlaylist = useCallback(async (track) => {
    if (!activePlaylist) return;
    try {
      await removeFromPlaylist(activePlaylist.id, track.id);
      // Refresh local activePlaylist state from updated playlists
      setActivePlaylist(prev =>
        prev ? { ...prev, tracks: (prev.tracks || []).filter(t => t.id !== track.id) } : prev
      );
      toast('Removed from playlist');
    } catch (e) {
      console.error(e);
    }
  }, [activePlaylist, removeFromPlaylist, toast]);

  const handleToggleLiked = useCallback(async (track) => {
    await toggleFavorite(track.id);
    const wasFav = favorites.includes(track.id);
    toast(wasFav ? 'Removed from Liked Songs' : 'Added to Liked Songs');
  }, [toggleFavorite, favorites, toast]);

  const handleAddToQueue = useCallback((track) => {
    addToQueue(track);
    toast(`Added "${track.title}" to queue`);
  }, [addToQueue, toast]);

  const handleExclude = useCallback(async (track) => {
    try {
      await api.excludeTrack(track.id);
      toast('Excluded from your taste profile');
    } catch (e) {
      console.error(e);
    }
  }, [toast]);

  // ── Format seconds → m:ss ────────────────────────────────────
  const fmt = (s) => {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  };

  // ══════════════════════════════════════════════════════════════
  //  Playlist Detail View
  // ══════════════════════════════════════════════════════════════
  if (activePlaylist) {
    const tracks = activePlaylist.tracks || [];
    const totalDuration = tracks.reduce((a, t) => a + (t.duration || 0), 0);
    const totalMins = Math.round(totalDuration / 60);

    return (
      <section className="content-section pl-detail">

        {/* ── Detail header ── */}
        <div className="pl-detail-hero">
          {/* Cover art */}
          <div className="pl-detail-cover" style={{
            background: activePlaylist.coverUrl
              ? `url(${artProxy(activePlaylist.coverUrl)}) center/cover`
              : `linear-gradient(135deg,${activePlaylist.color || '#1db954'},#191414)`,
          }}>
            {!activePlaylist.coverUrl && (
              <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)" width="52" height="52">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
              </svg>
            )}
          </div>

          {/* Metadata */}
          <div className="pl-detail-meta">
            <p className="pl-detail-type">Playlist</p>
            <h1 className="pl-detail-name">{activePlaylist.name}</h1>
            <p className="pl-detail-stats">
              {tracks.length} songs{totalMins > 0 ? `, about ${totalMins} min` : ''}
            </p>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="pl-detail-actions">
          {tracks.length > 0 && (
            <button className="pl-play-btn"
              onClick={() => setActiveQueueAndPlay(tracks, tracks[0])}
              aria-label="Play playlist">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          )}
          <button className="pl-action-btn" onClick={() => setConfirmDelete(activePlaylist.id)}
            title="Delete playlist">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
          <button className="pl-action-btn text-button" onClick={() => setActivePlaylist(null)}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              width="16" height="16">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back
          </button>
        </div>

        {/* ── Track list ── */}
        {tracks.length > 0 ? (
          <div className="pl-track-list">
            {/* Column header */}
            <div className="pl-track-header">
              <span className="pl-col-num">#</span>
              <span className="pl-col-title">Title</span>
              <span className="pl-col-dur">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" width="14" height="14">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </span>
              <span className="pl-col-menu" />
            </div>

            {tracks.map((t, i) => {
              const active = currentTrack?.id === t.id;
              const fav    = favorites.includes(t.id);
              return (
                <div key={t.id || i}
                  className={`pl-track-row${active ? ' pl-track-row--active' : ''}`}
                  onDoubleClick={() => setActiveQueueAndPlay(tracks, t)}>

                  {/* # / playing indicator */}
                  <div className="pl-col-num pl-track-num">
                    {active && isPlaying ? (
                      <span className="pl-eq">
                        <span/><span/><span/>
                      </span>
                    ) : (
                      <>
                        <span className="pl-row-idx">{i + 1}</span>
                        <button className="pl-row-play" onClick={() => setActiveQueueAndPlay(tracks, t)}
                          aria-label={`Play ${t.title}`}>
                          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Artwork + title/artist */}
                  <div className="pl-col-title pl-track-info">
                    {t.artworkUrl ? (
                      <img
                        src={artProxy(t.artworkUrl)}
                        alt={t.title}
                        className="pl-track-art"
                      />
                    ) : (
                      <div className="pl-track-art pl-track-art--empty">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                        </svg>
                      </div>
                    )}
                    <div className="pl-track-text">
                      <span className={`pl-track-title${active ? ' pl-track-title--active' : ''}`}>
                        {t.title}
                      </span>
                      <span className="pl-track-artist">{t.artist}</span>
                    </div>
                    {fav && (
                      <svg viewBox="0 0 24 24" fill="var(--accent)" width="14" height="14"
                        className="pl-fav-dot" title="In Liked Songs">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    )}
                  </div>

                  {/* Duration */}
                  <span className="pl-col-dur pl-track-dur">{fmt(t.duration)}</span>

                  {/* 3-dot menu */}
                  <div className="pl-col-menu">
                    <button className="pl-dots-btn" aria-label="More options"
                      onClick={(e) => openCtx(e, t)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <circle cx="5"  cy="12" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="19" cy="12" r="1.5"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-library">
            <svg viewBox="0 0 24 24" width="48" height="48"
              style={{ fill: 'none', stroke: 'var(--muted)', strokeWidth: 1.5 }}>
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
            </svg>
            <p>This playlist is empty</p>
            <span>Play a song and tap + to add it here</span>
          </div>
        )}

        {/* ── Context menu ── */}
        {contextMenu && (
          <TrackContextMenu
            track={contextMenu.track}
            playlistId={activePlaylist.id}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            isFav={favorites.includes(contextMenu.track?.id)}
            onClose={() => setContextMenu(null)}
            onRemoveFromPlaylist={handleRemoveFromPlaylist}
            onRemoveFromLiked={handleToggleLiked}
            onAddToQueue={handleAddToQueue}
            onExclude={handleExclude}
          />
        )}

        {/* ── Confirm delete dialog ── */}
        {confirmDelete && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 1200,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => setConfirmDelete(null)} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)', zIndex: 1201,
              width: 'min(320px,90vw)', background: '#1a1a2e', borderRadius: 16,
              padding: 24, border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Delete playlist?</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 20px' }}>
                This will permanently delete "{activePlaylist.name}".
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="pm-cancel-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="pm-save-btn" style={{ background: '#e53935', color: '#fff' }}
                  onClick={() => handleDelete(confirmDelete)}>Delete</button>
              </div>
            </div>
          </>
        )}

        {/* ── Toast ── */}
        {toastMsg && <div className="pl-toast">{toastMsg}</div>}
      </section>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  Main Library view (playlist grid + liked songs)
  // ══════════════════════════════════════════════════════════════
  return (
    <section className="content-section">

      {/* ── Playlists section ── */}
      <div className="section-header" style={{ marginBottom: 16 }}>
        <div>
          <p className="section-kicker">Your collection</p>
          <h2 style={{ margin: 0 }}>Your Library</h2>
        </div>
        <button className="ghost-button" onClick={() => openPlaylistModal(null)}
          title="Create playlist" style={{ gap: 6 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            width="18" height="18">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5"  y1="12" x2="19" y2="12"/>
          </svg>
          <span>New playlist</span>
        </button>
      </div>

      {playlists.length > 0 ? (
        <div className="lib-playlist-grid">
          {playlists.map(pl => (
            <button key={pl.id} className="lib-playlist-card"
              onClick={() => setActivePlaylist(pl)}>
              <div className="lib-playlist-cover" style={{
                background: pl.coverUrl
                  ? `url(${artProxy(pl.coverUrl)}) center/cover`
                  : `linear-gradient(135deg,${pl.color || '#1db954'},#191414)`,
              }}>
                {!pl.coverUrl && (
                  <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.35)" width="32" height="32">
                    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                  </svg>
                )}
              </div>
              <p className="lib-playlist-name">{pl.name}</p>
              <p className="lib-playlist-count">{pl.tracks?.length ?? 0} songs</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-library" style={{ marginBottom: 24 }}>
          <svg viewBox="0 0 24 24" width="40" height="40"
            style={{ fill: 'none', stroke: 'var(--muted)', strokeWidth: 1.5 }}>
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
          </svg>
          <p style={{ margin: '8px 0 2px' }}>No playlists yet</p>
          <span style={{ fontSize: '0.82rem' }}>Tap "+ New playlist" to create one</span>
        </div>
      )}

      {/* ── Liked songs ── */}
      <div className="section-header" style={{ marginTop: 28, marginBottom: 12 }}>
        <div>
          <p className="section-kicker">Saved tracks</p>
          <h3 style={{ margin: 0 }}>Liked Songs</h3>
        </div>
        <span className="badge badge--full">{likedTracks.length} songs</span>
      </div>

      {likedTracks.length > 0 ? (
        <div className="pl-track-list">
          {likedTracks.map((t, i) => {
            const active = currentTrack?.id === t.id;
            return (
              <div key={t.id || i}
                className={`pl-track-row${active ? ' pl-track-row--active' : ''}`}
                onDoubleClick={() => setActiveQueueAndPlay(likedTracks, t)}>
                <div className="pl-col-num pl-track-num">
                  {active && isPlaying ? (
                    <span className="pl-eq"><span/><span/><span/></span>
                  ) : (
                    <>
                      <span className="pl-row-idx">{i + 1}</span>
                      <button className="pl-row-play" onClick={() => setActiveQueueAndPlay(likedTracks, t)}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                <div className="pl-col-title pl-track-info">
                  {t.artworkUrl ? (
                    <img src={artProxy(t.artworkUrl)}
                      alt={t.title} className="pl-track-art"/>
                  ) : (
                    <div className="pl-track-art pl-track-art--empty">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                      </svg>
                    </div>
                  )}
                  <div className="pl-track-text">
                    <span className={`pl-track-title${active ? ' pl-track-title--active' : ''}`}>
                      {t.title}
                    </span>
                    <span className="pl-track-artist">{t.artist}</span>
                  </div>
                </div>
                <span className="pl-col-dur pl-track-dur">{fmt(t.duration)}</span>
                <div className="pl-col-menu">
                  <button className="pl-dots-btn" aria-label="More options"
                    onClick={(e) => openCtx(e, t)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <circle cx="5"  cy="12" r="1.5"/>
                      <circle cx="12" cy="12" r="1.5"/>
                      <circle cx="19" cy="12" r="1.5"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-library">
          <svg viewBox="0 0 24 24" width="40" height="40"
            style={{ fill: 'none', stroke: 'var(--muted)', strokeWidth: 1.5 }}>
            <path d="M20.3 5.8a5 5 0 0 0-7.1 0L12 7l-1.2-1.2a5 5 0 0 0-7.1 7.1L12 21l8.3-8.1a5 5 0 0 0 0-7.1Z"/>
          </svg>
          <p>Your library is empty</p>
          <span>Heart a song to save it here</span>
        </div>
      )}

      {/* Context menu for liked songs list */}
      {contextMenu && (
        <TrackContextMenu
          track={contextMenu.track}
          playlistId={null}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          isFav={favorites.includes(contextMenu.track?.id)}
          onClose={() => setContextMenu(null)}
          onRemoveFromPlaylist={() => {}}
          onRemoveFromLiked={handleToggleLiked}
          onAddToQueue={handleAddToQueue}
          onExclude={handleExclude}
        />
      )}

      {toastMsg && <div className="pl-toast">{toastMsg}</div>}
    </section>
  );
}
