/**
 * audio/MediaSession.js
 *
 * Integrates the Web Media Session API so the OS / browser chrome shows
 * track info and exposes transport controls (lock-screen, notification bar,
 * headset buttons, etc.).
 *
 * Spec: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
 *
 * This module degrades gracefully — if the API is unavailable (older
 * browsers, SSR, Web Workers) all functions become no-ops.
 *
 * Usage:
 *   import { setMediaSessionMetadata, setMediaSessionHandlers,
 *            clearMediaSession } from './MediaSession';
 *
 *   // When a new track starts:
 *   setMediaSessionMetadata({
 *     title:    'Song Title',
 *     artist:   'Artist Name',
 *     album:    'Album Name',
 *     artworkUrl: 'https://…/cover.jpg',
 *   });
 *
 *   // Register transport button handlers:
 *   setMediaSessionHandlers({
 *     onPlay:  () => engine.play(),
 *     onPause: () => engine.pause(),
 *     onNext:  () => handleNext(),
 *     onPrev:  () => handlePrev(),
 *     onSeekTo: (details) => engine.seekToSeconds(details.seekTime),
 *   });
 *
 *   // When the engine is torn down:
 *   clearMediaSession();
 */

import { audioLogger } from './AudioLogger';

// ─── Support check ─────────────────────────────────────────────────────────────

/** @returns {boolean} */
function isSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'mediaSession' in navigator
  );
}

// ─── Metadata ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TrackMeta
 * @property {string}  title
 * @property {string}  [artist]
 * @property {string}  [album]
 * @property {string}  [artworkUrl]  - URL of the cover image
 */

/**
 * Update the OS / browser media session metadata.
 * @param {TrackMeta} meta
 */
export function setMediaSessionMetadata(meta) {
  if (!isSupported()) return;
  if (!meta?.title) return;

  try {
    /** @type {MediaImage[]} */
    const artwork = [];

    if (meta.artworkUrl) {
      // Provide multiple sizes so the OS can pick the most appropriate one
      artwork.push(
        { src: meta.artworkUrl, sizes: '96x96',   type: 'image/jpeg' },
        { src: meta.artworkUrl, sizes: '128x128',  type: 'image/jpeg' },
        { src: meta.artworkUrl, sizes: '256x256',  type: 'image/jpeg' },
        { src: meta.artworkUrl, sizes: '512x512',  type: 'image/jpeg' },
      );
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title:  meta.title,
      artist: meta.artist  || '',
      album:  meta.album   || '',
      artwork,
    });

    audioLogger.log('mediasession', `Metadata set: "${meta.title}" — ${meta.artist}`);
  } catch (err) {
    audioLogger.warn('mediasession', 'Failed to set MediaMetadata', err);
  }
}

/**
 * Clear the media session metadata and remove all action handlers.
 * Call this when the player is idle or destroyed.
 */
export function clearMediaSession() {
  if (!isSupported()) return;

  try {
    navigator.mediaSession.metadata = null;

    const actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'];
    actions.forEach(action => {
      try { navigator.mediaSession.setActionHandler(action, null); } catch { /* unsupported action — skip */ }
    });

    audioLogger.log('mediasession', 'Media session cleared');
  } catch (err) {
    audioLogger.warn('mediasession', 'clearMediaSession error', err);
  }
}

// ─── Playback state ────────────────────────────────────────────────────────────

/**
 * Update the OS media session playback state indicator.
 * @param {'none'|'paused'|'playing'} state
 */
export function setMediaSessionPlaybackState(state) {
  if (!isSupported()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch { /* unsupported — ignore */ }
}

// ─── Action handlers ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} MediaSessionHandlers
 * @property {Function}  [onPlay]      - Called when the OS play button is pressed
 * @property {Function}  [onPause]     - Called when the OS pause button is pressed
 * @property {Function}  [onNext]      - Called when the OS next-track button is pressed
 * @property {Function}  [onPrev]      - Called when the OS previous-track button is pressed
 * @property {Function}  [onStop]      - Called when the OS stop action is triggered
 * @property {Function}  [onSeekTo]    - Called with MediaSessionActionDetails when seekto fires
 * @property {Function}  [onSeekFwd]   - Called with details on seekforward
 * @property {Function}  [onSeekBwd]   - Called with details on seekbackward
 */

/**
 * Register OS/browser transport button handlers.
 * Only handlers that are provided will be registered; others are left as-is.
 *
 * @param {MediaSessionHandlers} handlers
 */
export function setMediaSessionHandlers(handlers) {
  if (!isSupported()) return;

  const actionMap = [
    ['play',           handlers.onPlay],
    ['pause',          handlers.onPause],
    ['nexttrack',      handlers.onNext],
    ['previoustrack',  handlers.onPrev],
    ['stop',           handlers.onStop],
    ['seekto',         handlers.onSeekTo],
    ['seekforward',    handlers.onSeekFwd],
    ['seekbackward',   handlers.onSeekBwd],
  ];

  actionMap.forEach(([action, handler]) => {
    if (typeof handler !== 'function') return;

    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Some browsers (notably older Safari) don't support all actions.
      // Silently ignore unsupported actions so the supported ones still work.
      audioLogger.log('mediasession', `Action "${action}" not supported — skipped`);
    }
  });

  audioLogger.log('mediasession', 'Action handlers registered');
}

/**
 * Update the position state (for progress indicator on lock screen).
 * @param {{ duration: number, playbackRate: number, position: number }} state
 */
export function setMediaSessionPositionState(state) {
  if (!isSupported()) return;

  // setPositionState is not available everywhere
  if (typeof navigator.mediaSession.setPositionState !== 'function') return;

  try {
    // Validate before calling — some browsers throw on invalid values
    const { duration, playbackRate, position } = state;

    if (
      typeof duration     !== 'number' || isNaN(duration)     || duration     <= 0 ||
      typeof playbackRate !== 'number' || isNaN(playbackRate) || playbackRate <= 0 ||
      typeof position     !== 'number' || isNaN(position)     || position      < 0 ||
      position > duration
    ) return;

    navigator.mediaSession.setPositionState({ duration, playbackRate, position });
  } catch { /* Ignore failures silently */ }
}
