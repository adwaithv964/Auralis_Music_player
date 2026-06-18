import { useApp }   from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { TrackCard } from '../../components/MusicCard/TrackCard';
import { trackHasAudio } from '../../utils/audioHelpers';

/**
 * Library page
 *
 * Shows the user's saved / favorited tracks.
 * Empty state with a heart icon when no tracks are saved.
 */
export function Library() {
  const { localTracks, externalTracks, favorites } = useApp();
  const { currentTrack, isPlaying, handlePlay } = usePlayer();

  const playableTracks = [
    ...localTracks.filter(trackHasAudio),
    ...externalTracks.filter(trackHasAudio),
  ];
  const libraryTracks = playableTracks.filter(t => favorites.includes(t.id));

  return (
    <section className="content-section track-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Saved tracks</p>
          <h2>Your Library</h2>
        </div>
      </div>

      {libraryTracks.length > 0 ? (
        <div className="track-list">
          {libraryTracks.map((t, i) => (
            <TrackCard
              key={t.id || i}
              track={t}
              index={i}
              isActive={currentTrack?.id === t.id}
              isPlaying={isPlaying}
              onPlay={handlePlay}
            />
          ))}
        </div>
      ) : (
        <div className="empty-library">
          <svg viewBox="0 0 24 24" width="48" height="48"
            style={{ fill:'none', stroke:'var(--muted)', strokeWidth:1.5 }}>
            <path d="M20.3 5.8a5 5 0 0 0-7.1 0L12 7l-1.2-1.2a5 5 0 0 0-7.1 7.1L12 21l8.3-8.1a5 5 0 0 0 0-7.1Z" />
          </svg>
          <p>Your library is empty</p>
          <span>Heart a song to save it here</span>
        </div>
      )}
    </section>
  );
}
