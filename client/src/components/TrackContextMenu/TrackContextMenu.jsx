import { useEffect, useRef } from 'react';
import './TrackContextMenu.css';

/**
 * TrackContextMenu
 *
 * Spotify-exact 3-dot context menu for tracks inside a playlist.
 * Props:
 *   track         — the track object
 *   playlistId    — id of the current playlist (null = not in a playlist)
 *   position      — { x, y } page coordinates where menu opens
 *   isFav         — boolean, is track in liked songs
 *   onClose       — close callback
 *   onRemoveFromPlaylist  — fn(track)
 *   onRemoveFromLiked     — fn(track)
 *   onAddToQueue          — fn(track)
 *   onExclude             — fn(track)
 */
export function TrackContextMenu({
  track,
  playlistId,
  position,
  isFav,
  onClose,
  onRemoveFromPlaylist,
  onRemoveFromLiked,
  onAddToQueue,
  onExclude,
}) {
  const menuRef = useRef(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handle = (e) => {
      if (!menuRef.current?.contains(e.target)) onClose();
    };
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp menu to viewport
  const style = {
    top:  Math.min(position.y, window.innerHeight - 260),
    left: Math.min(position.x, window.innerWidth  - 240),
  };

  const Item = ({ icon, label, onClick, danger }) => (
    <button
      className={`tcm-item${danger ? ' tcm-item--danger' : ''}`}
      onClick={() => { onClick(); onClose(); }}
    >
      <span className="tcm-icon">{icon}</span>
      <span className="tcm-label">{label}</span>
    </button>
  );

  return (
    <div className="tcm-overlay" onMouseDown={e => e.stopPropagation()}>
      <div className="tcm-menu" ref={menuRef} style={style} role="menu">
        {/* Remove from this playlist — only shown inside a playlist */}
        {playlistId && (
          <Item
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            }
            label="Remove from this playlist"
            onClick={() => onRemoveFromPlaylist(track)}
            danger
          />
        )}

        {/* Remove from / Add to Liked Songs */}
        <Item
          icon={
            <svg viewBox="0 0 24 24"
              fill={isFav ? 'var(--accent)' : 'none'}
              stroke={isFav ? 'var(--accent)' : 'currentColor'}
              strokeWidth="2" width="16" height="16">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          }
          label={isFav ? 'Remove from your Liked Songs' : 'Add to your Liked Songs'}
          onClick={() => onRemoveFromLiked(track)}
        />

        {/* Divider */}
        <div className="tcm-divider" />

        {/* Add to queue */}
        <Item
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6"  x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          }
          label="Add to queue"
          onClick={() => onAddToQueue(track)}
        />

        {/* Divider */}
        <div className="tcm-divider" />

        {/* Exclude from taste profile */}
        <Item
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          }
          label="Exclude from your taste profile"
          onClick={() => onExclude(track)}
        />
      </div>
    </div>
  );
}
