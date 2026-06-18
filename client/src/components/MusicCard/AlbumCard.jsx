import { artProxy, trackHasAudio, isFullSong } from '../../utils/audioHelpers';

/**
 * AlbumCard
 * Grid card for the Home page song grid.
 * Shows artwork, play overlay, resolving spinner, title and artist.
 */
export function AlbumCard({ track, isActive, isResolving, onPlay }) {
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
