/**
 * audio/EQEvents.js
 *
 * Phase 3 event constants for the Equalizer & Audio Quality Engine.
 *
 * These complement the Phase 1 EngineEvent and Phase 2 PlaybackEvent constants
 * and are used exclusively by the Phase 3 modules (EQEngine, AudioQualityManager,
 * LoudnessNormalizer, AudioSettingsPersistence) for structured logging via
 * audioLogger.
 *
 * Usage:
 *   import { EQEvent } from './EQEvents';
 *   audioLogger.info(EQEvent.PRESET_CHANGED, 'EQ preset applied', { preset });
 */

// ─── Phase 3 equalizer & audio quality events ─────────────────────────────────
export const EQEvent = Object.freeze({

  // ── Equalizer ───────────────────────────────────────────────────────────────

  /** An EQ preset was applied (Flat, Bass Boost, Vocal, etc.) */
  PRESET_CHANGED: 'eq:preset_changed',

  /** A single EQ band was manually adjusted */
  BAND_ADJUSTED: 'eq:band_adjusted',

  /** All EQ bands were reset to 0 dB (Flat) */
  EQ_RESET: 'eq:reset',

  /** EQ settings were restored from persistent storage */
  SETTINGS_RESTORED: 'eq:settings_restored',

  /** EQ settings were persisted to storage */
  SETTINGS_SAVED: 'eq:settings_saved',

  /** Stored EQ settings were invalid — reset to defaults */
  SETTINGS_CORRUPTED: 'eq:settings_corrupted',

  // ── Playback speed ──────────────────────────────────────────────────────────

  /** Playback speed was changed */
  SPEED_CHANGED: 'eq:speed_changed',

  // ── Audio quality ───────────────────────────────────────────────────────────

  /** Stream quality preference was changed */
  QUALITY_CHANGED: 'eq:quality_changed',

  // ── Loudness normalization ──────────────────────────────────────────────────

  /** Loudness normalization was enabled or disabled */
  NORMALIZATION_TOGGLED: 'eq:normalization_toggled',

  /** Loudness normalization gain was applied to a track */
  NORMALIZATION_APPLIED: 'eq:normalization_applied',

  /** Loudness normalization skipped — no metadata available */
  NORMALIZATION_SKIPPED: 'eq:normalization_skipped',

  // ── Media Session ───────────────────────────────────────────────────────────

  /** Media Session metadata was updated for a new track */
  MEDIA_SESSION_UPDATED: 'eq:media_session_updated',

  /** Media Session update failed (non-fatal) */
  MEDIA_SESSION_ERROR: 'eq:media_session_error',

  // ── Processing errors ───────────────────────────────────────────────────────

  /** An invalid EQ value was rejected (out-of-range, NaN) */
  INVALID_EQ_VALUE: 'eq:invalid_value',

  /** AudioContext or pipeline node was unavailable during an operation */
  PIPELINE_UNAVAILABLE: 'eq:pipeline_unavailable',

  /** An unsupported browser API was accessed gracefully */
  UNSUPPORTED_API: 'eq:unsupported_api',
});
