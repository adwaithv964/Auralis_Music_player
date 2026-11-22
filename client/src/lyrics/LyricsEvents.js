/**
 * lyrics/LyricsEvents.js
 *
 * Phase 4 event constants for the Lyrics Engine.
 *
 * These complement the Phase 1 EngineEvent, Phase 2 PlaybackEvent, and Phase 3
 * EQEvent constants. All lyrics subsystems use these tags with the shared
 * audioLogger singleton for structured, searchable logging.
 *
 * Usage:
 *   import { LyricsEvent } from './LyricsEvents';
 *   audioLogger.info(LyricsEvent.LYRICS_LOADED, 'Lyrics loaded', { provider });
 */

// ─── Lyrics lifecycle events ───────────────────────────────────────────────────
export const LyricsEvent = Object.freeze({

  // ── Loading ────────────────────────────────────────────────────────────────

  /** Lyric resolution pipeline started for a new song */
  LOAD_STARTED: 'lyrics:load_started',

  /** Lyrics were successfully loaded from any source */
  LYRICS_LOADED: 'lyrics:loaded',

  /** No lyrics could be found from any provider */
  LYRICS_NOT_FOUND: 'lyrics:not_found',

  /** Lyrics were cleared (song change, explicit clear) */
  LYRICS_CLEARED: 'lyrics:cleared',

  // ── Parsing ────────────────────────────────────────────────────────────────

  /** LRC or plain text content was parsed into normalized lines */
  LYRICS_PARSED: 'lyrics:parsed',

  /** Parser encountered a malformed or unrecognisable lyric entry (non-fatal) */
  PARSE_WARNING: 'lyrics:parse_warning',

  /** Parser failed entirely — fell back to plain text or instrumental */
  PARSE_ERROR: 'lyrics:parse_error',

  // ── Provider ───────────────────────────────────────────────────────────────

  /** A specific provider was selected and is being queried */
  PROVIDER_SELECTED: 'lyrics:provider_selected',

  /** A provider returned a valid result */
  PROVIDER_SUCCESS: 'lyrics:provider_success',

  /** A provider returned no lyrics (not an error — try next provider) */
  PROVIDER_MISS: 'lyrics:provider_miss',

  /** A provider threw an error — will fall through to next provider */
  PROVIDER_FAILURE: 'lyrics:provider_failure',

  /** All providers exhausted without a result */
  PROVIDER_EXHAUSTED: 'lyrics:provider_exhausted',

  // ── Cache ──────────────────────────────────────────────────────────────────

  /** In-memory cache returned a hit for this song */
  CACHE_HIT: 'lyrics:cache_hit',

  /** In-memory cache did not contain lyrics for this song */
  CACHE_MISS: 'lyrics:cache_miss',

  /** Lyrics were written to the in-memory cache */
  CACHE_STORED: 'lyrics:cache_stored',

  /** An in-memory cache entry was evicted (LRU or TTL) */
  CACHE_EVICTED: 'lyrics:cache_evicted',

  // ── Offline storage ────────────────────────────────────────────────────────

  /** IndexedDB returned a hit for this song */
  STORAGE_HIT: 'lyrics:storage_hit',

  /** IndexedDB did not contain lyrics for this song */
  STORAGE_MISS: 'lyrics:storage_miss',

  /** Lyrics were successfully persisted to IndexedDB */
  STORAGE_SAVED: 'lyrics:storage_saved',

  /** An IndexedDB read or write failed — treated as a cache miss */
  STORAGE_ERROR: 'lyrics:storage_error',

  /** Stored lyrics blob failed version or schema validation — discarded */
  STORAGE_CORRUPTED: 'lyrics:storage_corrupted',

  // ── Synchronization ────────────────────────────────────────────────────────

  /** Sync loop started (song loaded, playback begins) */
  SYNC_STARTED: 'lyrics:sync_started',

  /** Sync loop stopped (paused, track ended, destroyed) */
  SYNC_STOPPED: 'lyrics:sync_stopped',

  /** Active lyric line changed (normal progression or seek) */
  SYNC_LINE_CHANGED: 'lyrics:sync_line_changed',

  /** Seek caused an immediate jump to a different lyric line */
  SYNC_SEEKED: 'lyrics:sync_seeked',

  /** Sync loop tried to start but a loop was already active — guarded */
  SYNC_DUPLICATE_GUARD: 'lyrics:sync_duplicate_guard',

  // ── Language layers ────────────────────────────────────────────────────────

  /** Translation data was loaded or updated */
  TRANSLATION_LOADED: 'lyrics:translation_loaded',

  /** Romanized lyrics were loaded or updated */
  ROMANIZED_LOADED: 'lyrics:romanized_loaded',

  /** A requested language layer was unavailable for this track */
  LAYER_UNAVAILABLE: 'lyrics:layer_unavailable',

  // ── Instrumental ──────────────────────────────────────────────────────────

  /** Track was identified as instrumental — sync skipped */
  INSTRUMENTAL_DETECTED: 'lyrics:instrumental_detected',
});
