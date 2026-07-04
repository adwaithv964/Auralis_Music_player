/**
 * audio/PlaybackEvents.js
 *
 * Playback-layer event constants for the Phase 2 orchestration system.
 *
 * These complement the Phase 1 AudioEvent / EngineEvent constants in
 * AudioEvents.js and are used exclusively by the Phase 2 modules
 * (PlaybackEngine, QueueEngine, PrefetchSystem, StallRecovery, etc.)
 * for structured logging via audioLogger.
 *
 * Usage:
 *   import { PlaybackEvent } from './PlaybackEvents';
 *   audioLogger.info(PlaybackEvent.SONG_STARTED, 'Playback started', { song });
 */

// ─── Playback lifecycle events ────────────────────────────────────────────────
export const PlaybackEvent = Object.freeze({

  // ── Song lifecycle ──────────────────────────────────────────────────────────

  /** A new song has begun playing (after stream resolved + audio started) */
  SONG_STARTED: 'playback:song_started',

  /** Playback was paused by the user or system */
  SONG_PAUSED: 'playback:song_paused',

  /** Playback was resumed from a paused state */
  SONG_RESUMED: 'playback:song_resumed',

  /** Playback was stopped (position reset, current song cleared) */
  SONG_STOPPED: 'playback:song_stopped',

  /** A song reached its natural end */
  SONG_ENDED: 'playback:song_ended',

  /** A song was skipped forward */
  SONG_NEXT: 'playback:song_next',

  /** A song was skipped backward */
  SONG_PREVIOUS: 'playback:song_previous',

  // ── Queue events ────────────────────────────────────────────────────────────

  /** Queue contents changed (add, remove, replace) */
  QUEUE_UPDATED: 'playback:queue_updated',

  /** Queue items were reordered (move, shuffle) */
  QUEUE_REORDERED: 'playback:queue_reordered',

  /** Manual queue was cleared */
  QUEUE_CLEARED: 'playback:queue_cleared',

  /** Active (base) queue was replaced */
  ACTIVE_QUEUE_SET: 'playback:active_queue_set',

  // ── Stream resolution events ────────────────────────────────────────────────

  /** Stream URL resolution started */
  STREAM_RESOLVING: 'playback:stream_resolving',

  /** Stream URL was successfully resolved */
  STREAM_RESOLVED: 'playback:stream_resolved',

  /** Stream URL resolution failed after all retries */
  STREAM_FAILED: 'playback:stream_failed',

  /** Cached stream URL was returned (no network call) */
  STREAM_CACHE_HIT: 'playback:stream_cache_hit',

  /** A cached URL was invalidated (stale, stall recovery) */
  STREAM_CACHE_INVALIDATED: 'playback:stream_cache_invalidated',

  // ── Prefetch events ─────────────────────────────────────────────────────────

  /** Prefetch of the next song's stream URL started */
  PREFETCH_STARTED: 'playback:prefetch_started',

  /** Prefetch completed — next song is ready in secondary element */
  PREFETCH_COMPLETED: 'playback:prefetch_completed',

  /** Prefetch was cancelled (queue changed, song changed) */
  PREFETCH_CANCELLED: 'playback:prefetch_cancelled',

  /** Prefetch failed — next song will re-resolve on demand */
  PREFETCH_FAILED: 'playback:prefetch_failed',

  // ── Stall recovery events ───────────────────────────────────────────────────

  /** A stall was detected; recovery sequence initiated */
  RECOVERY_INITIATED: 'playback:recovery_initiated',

  /** Level 1 recovery: lightweight re-play attempt */
  RECOVERY_LEVEL1: 'playback:recovery_level1',

  /** Level 2 recovery: source reload + position restore */
  RECOVERY_LEVEL2: 'playback:recovery_level2',

  /** Level 3 recovery: stream URL invalidation + re-resolution */
  RECOVERY_LEVEL3: 'playback:recovery_level3',

  /** Recovery succeeded — playback restored */
  RECOVERY_SUCCEEDED: 'playback:recovery_succeeded',

  /** Recovery failed after all levels — playback cannot continue */
  RECOVERY_FAILED: 'playback:recovery_failed',

  // ── Session persistence events ──────────────────────────────────────────────

  /** Playback session was saved to localStorage */
  SESSION_SAVED: 'playback:session_saved',

  /** Playback session was restored from localStorage */
  SESSION_RESTORED: 'playback:session_restored',

  /** Session restore was skipped (expired or missing) */
  SESSION_SKIPPED: 'playback:session_skipped',

  /** Session data was cleared */
  SESSION_CLEARED: 'playback:session_cleared',
});
