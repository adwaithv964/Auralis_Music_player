import { useApp }   from '../../context/AppContext';
import { usePlayer } from '../../context/PlayerContext';
import { artProxy, fmt } from '../../utils/audioHelpers';

/**
 * PlayerBar
 * Desktop-only bottom footer with:
 *  - Left:   mini artwork + title + artist + heart
 *  - Centre: transport buttons + seekable progress bar
 *  - Right:  volume slider
 */
export function PlayerBar() {
  const { prefs, setPrefs, setMobileNowOpen, openPlaylistModal } = useApp();
  const {
    currentTrack,
    isPlaying,
    seek,
    progress, displayElapsed, displayDuration,
    shuffle, setShuffle,
    repeat,  setRepeat,
    resolvingId,
    isFav,
    togglePlay, handlePrev, handleNext, toggleFavorite,
  } = usePlayer();

  const coverBgInline = currentTrack?.artworkUrl
    ? `url(${artProxy(currentTrack.artworkUrl)}) center/cover`
    : currentTrack
      ? `linear-gradient(135deg,${currentTrack.color?.[0]||'#1db954'},${currentTrack.color?.[1]||'#191414'})`
      : 'none';

  return (
    <footer className="player glass-panel">

      {/* ── Left: mini track info ── */}
      <div className="mini-now" onClick={() => setMobileNowOpen(true)} style={{ cursor: 'pointer' }}>
        {currentTrack && (
          <>
            <div className="mini-cover" style={{ background: coverBgInline }}>
              {currentTrack.artworkUrl && (
                <img src={artProxy(currentTrack.artworkUrl)} alt=""
                  style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'inherit' }} />
              )}
            </div>
            <div className="mini-copy">
              <strong>{currentTrack.title}</strong>
              <span>{currentTrack.artist}</span>
            </div>
            <button
              className={`icon-button${isFav ? ' favorited' : ''}`}
              onClick={e => { e.stopPropagation(); toggleFavorite(currentTrack.id); }}
              style={{ marginLeft: 4, flexShrink: 0 }}
              title="Like"
            >
              <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <button
              className="icon-button"
              onClick={e => { e.stopPropagation(); openPlaylistModal(currentTrack); }}
              style={{ marginLeft: 2, flexShrink: 0 }}
              title="Add to playlist"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.35"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8"  y1="12" x2="16" y2="12"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* ── Centre: transport + progress ── */}
      <div className="transport">
        <div className="transport-buttons">
          <button className={`icon-button${shuffle ? ' active' : ''}`} onClick={() => setShuffle(s => !s)}>
            <svg><use href="#i-shuffle" /></svg>
          </button>
          <button className="icon-button" onClick={handlePrev}>
            <svg><use href="#i-prev" /></svg>
          </button>
          <button className="play-button" onClick={togglePlay}>
            <svg><use href={isPlaying ? '#i-pause' : '#i-play'} /></svg>
          </button>
          <button className="icon-button" onClick={handleNext}>
            <svg><use href="#i-next" /></svg>
          </button>
          <button className={`icon-button${repeat ? ' active' : ''}`} onClick={() => setRepeat(r => !r)}>
            <svg><use href="#i-repeat" /></svg>
          </button>
        </div>

        {/* Progress bar with shimmer overlay when loading */}
        <div className={`progress-line${resolvingId ? ' progress-line--loading' : ''}`}>
          <span>{fmt(displayElapsed)}</span>
          <div className="progress-wrap">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
            {resolvingId && <div className="progress-shimmer-bar" />}
            <input type="range" className="progress-seek" min="0" max="1000"
              value={Math.round(progress * 10)}
              onChange={e => seek(e.target.value / 10)}
              aria-label="Seek" />
          </div>
          <span>{fmt(displayDuration)}</span>
        </div>
      </div>

      {/* ── Right: volume ── */}
      <div className="volume-zone">
        <svg aria-hidden="true"><use href="#i-volume" /></svg>
        <input type="range" min="0" max="100" value={prefs.volume}
          onChange={e => setPrefs(p => ({ ...p, volume: Number(e.target.value) }))} />
      </div>

    </footer>
  );
}
