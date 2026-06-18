import { artProxy } from '../../utils/audioHelpers';

/**
 * SuggestionItem
 * Single row inside the search autocomplete dropdown.
 * Uses onMouseDown (not onClick) so the input blur fires after selection.
 */
export function SuggestionItem({ track, onPick }) {
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
