import { isFullSong } from '../../utils/audioHelpers';

/**
 * SourceBadge
 * Shows a small pill indicating track source: YouTube or Full.
 * iTunes-unresolved tracks get no badge.
 */
export function SourceBadge({ track, small }) {
  if (!track) return null;
  if (track.ytResolved)
    return <span className={`badge badge--youtube${small ? ' badge--sm' : ''}`}>▶ YouTube</span>;
  if (isFullSong(track))
    return <span className={`badge badge--full${small ? ' badge--sm' : ''}`}>▶ Full</span>;
  return null;
}
