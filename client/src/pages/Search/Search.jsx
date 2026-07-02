import { useApp }    from '../../context/AppContext';
import { usePlayer }  from '../../context/PlayerContext';
import { TrackCard }  from '../../components/MusicCard/TrackCard';
import { trackHasAudio, isFullSong } from '../../utils/audioHelpers';

/**
 * Search page
 *
 * Shows results when a query is active, or all external tracks
 * when browsing without a query. Includes an "Search online" action.
 */
export function Search() {
  const {
    searchQuery,
    localTracks, externalTracks,
    isLoadingExt, language, mood,
    doLoadExternal,
  } = useApp();
  const { currentTrack, isPlaying, setActiveQueueAndPlay } = usePlayer();

  const playable     = [...localTracks.filter(trackHasAudio), ...externalTracks.filter(trackHasAudio)];
  const extPlayable  = externalTracks.filter(trackHasAudio);
  const searchResults = searchQuery
    ? playable.filter(t => `${t.title} ${t.artist} ${t.genre}`.toLowerCase().includes(searchQuery.toLowerCase()))
    : extPlayable;

  return (
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
          <TrackCard
            key={t.id || i}
            track={t}
            index={i}
            isActive={currentTrack?.id === t.id}
            isPlaying={isPlaying}
            onPlay={(track) => setActiveQueueAndPlay(searchResults, track)}
          />
        ))}
        {!isLoadingExt && searchResults.length === 0 && (
          <p className="empty-msg">No results found. Try "Search online" ↑</p>
        )}
      </div>
    </section>
  );
}
