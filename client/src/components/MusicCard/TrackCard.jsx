import { artProxy, trackHasAudio, fmt } from '../../utils/audioHelpers';

/**
 * TrackCard
 * A single row in a track list (Search / Library views).
 * Shows index/playing-bars, artwork, title, artist, album, duration.
 */
export function TrackCard({ track, isActive, isPlaying, index, onPlay }) {
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
