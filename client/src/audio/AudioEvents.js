/**
 * audio/AudioEvents.js
 *
 * Centralised registry of every event name used by the AudioEngine.
 * Covers:
 *   - Native HTMLAudioElement events (subset we care about)
 *   - Internal engine lifecycle events
 *
 * Usage:
 *   import { AudioEvent } from './AudioEvents';
 *   audio.addEventListener(AudioEvent.TIME_UPDATE, handler);
 */

// ─── HTMLAudioElement native events ───────────────────────────────────────────
export const AudioEvent = Object.freeze({
  /** Playback has started or resumed */
  PLAY: 'play',

  /** Playback has been paused */
  PAUSE: 'pause',

  /** Playback reached the end of the track */
  ENDED: 'ended',

  /** The current playback position changed */
  TIME_UPDATE: 'timeupdate',

  /** The duration of the media has been determined */
  DURATION_CHANGE: 'durationchange',

  /** The browser is downloading media data */
  PROGRESS: 'progress',

  /** The user agent can play the media but may need to buffer */
  CAN_PLAY: 'canplay',

  /** The user agent can play the entire media without stopping to buffer */
  CAN_PLAY_THROUGH: 'canplaythrough',

  /** Playback is ready to start after being paused/delayed */
  PLAYING: 'playing',

  /** Playback has stopped because the next frame is not yet available */
  WAITING: 'waiting',

  /** The browser is trying to fetch media data but it is unavailable */
  STALLED: 'stalled',

  /** The fetching of media data has been suspended */
  SUSPEND: 'suspend',

  /** Seeking is in progress */
  SEEKING: 'seeking',

  /** Seeking has completed */
  SEEKED: 'seeked',

  /** The volume has changed */
  VOLUME_CHANGE: 'volumechange',

  /** The playback rate has changed */
  RATE_CHANGE: 'ratechange',

  /** An error occurred while fetching or decoding the media */
  ERROR: 'error',

  /** The load process has been aborted */
  ABORT: 'abort',

  /** New media has been loaded (src changed) */
  LOAD_START: 'loadstart',

  /** Media metadata has been loaded (duration available) */
  LOADED_METADATA: 'loadedmetadata',

  /** Media data has been loaded */
  LOADED_DATA: 'loadeddata',

  /** The media is now empty (src cleared) */
  EMPTIED: 'emptied',
});

// ─── Internal engine lifecycle events (dispatched via AudioLogger only) ───────
export const EngineEvent = Object.freeze({
  /** Engine singleton was initialised for the first time */
  INIT: 'engine:init',

  /** Web Audio API AudioContext was created */
  CONTEXT_CREATED: 'engine:context_created',

  /** AudioContext.resume() succeeded */
  CONTEXT_RESUMED: 'engine:context_resumed',

  /** AudioContext could not be created */
  CONTEXT_FAILED: 'engine:context_failed',

  /** A new track source was loaded into the primary element */
  TRACK_LOADED: 'engine:track_loaded',

  /** Primary audio element began playing */
  PLAYBACK_START: 'engine:playback_start',

  /** Primary audio element was paused */
  PLAYBACK_PAUSE: 'engine:playback_pause',

  /** Playback was seeked to a new position */
  SEEK: 'engine:seek',

  /** Buffering / waiting state entered */
  BUFFERING: 'engine:buffering',

  /** Buffering resolved; playback resumed */
  BUFFERING_END: 'engine:buffering_end',

  /** A network stall was detected */
  STALL: 'engine:stall',

  /** A media error occurred */
  ERROR: 'engine:error',

  /** Engine event listeners were registered */
  LISTENERS_BOUND: 'engine:listeners_bound',

  /** Engine event listeners were removed */
  LISTENERS_REMOVED: 'engine:listeners_removed',

  /** Engine.destroy() was called */
  DESTROYED: 'engine:destroyed',
});
