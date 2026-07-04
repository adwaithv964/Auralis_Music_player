/**
 * audio/AudioContext.js
 *
 * Manages the application's single Web Audio API AudioContext instance.
 *
 * Key constraints this module solves:
 *   1. Browser autoplay policy — AudioContext must be created (or resumed)
 *      inside a user gesture handler. We create it lazily on first call to
 *      getContext() after the engine detects a user interaction.
 *   2. Duplicate prevention — multiple calls to getContext() always return
 *      the same instance. A second AudioContext is never created.
 *   3. iOS Safari "interrupted" state — after a page hide/show cycle the
 *      context may enter "interrupted" state. resumeContext() handles this.
 *   4. Browser compatibility — supports both AudioContext and the
 *      webkit-prefixed variant used by older Safari versions.
 *
 * Usage:
 *   import { getAudioContext, resumeAudioContext } from './AudioContext';
 *
 *   // Inside a click handler (user gesture):
 *   const ctx = getAudioContext();   // creates or returns existing
 *   await resumeAudioContext();      // no-op if already running
 */

import { audioLogger } from './AudioLogger';
import { EngineEvent }  from './AudioEvents';

// ─── Module-level singleton guard ─────────────────────────────────────────────
/** @type {AudioContext|null} */
let _context = null;

/** Tracks whether we attempted (and failed) to create a context */
let _creationFailed = false;

// ─── Browser compatibility helper ─────────────────────────────────────────────
/**
 * Returns the best available AudioContext constructor, or null if the
 * Web Audio API is not supported in this browser.
 * @returns {typeof AudioContext | null}
 */
function getAudioContextConstructor() {
  if (typeof window === 'undefined') return null;

  // Standard API (Chrome, Firefox, modern Safari)
  if (typeof window.AudioContext !== 'undefined') {
    return window.AudioContext;
  }

  // Webkit prefix — older Safari / iOS Safari < 14.5
  if (typeof window.webkitAudioContext !== 'undefined') {
    return window.webkitAudioContext;
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the shared AudioContext, creating it if it doesn't yet exist.
 *
 * MUST be called from within a user gesture on first invocation to comply
 * with browser autoplay policies. Subsequent calls are safe from anywhere.
 *
 * @returns {AudioContext | null} The shared context, or null if unsupported.
 */
export function getAudioContext() {
  // Return existing instance immediately (hot path)
  if (_context) return _context;

  // Don't retry if a previous attempt already failed
  if (_creationFailed) {
    audioLogger.warn('context', 'AudioContext creation previously failed — skipping');
    return null;
  }

  const Ctor = getAudioContextConstructor();

  if (!Ctor) {
    _creationFailed = true;
    audioLogger.error('context', 'Web Audio API not supported in this browser');
    return null;
  }

  try {
    _context = new Ctor({
      // Use a standard 44.1 kHz sample rate for broad device compatibility.
      // Mobile devices (especially Android) sometimes default to 48 kHz, but
      // resampling music from 44.1 kHz to 48 kHz causes quality loss.
      // The browser will pick the nearest supported rate if this is unavailable.
      latencyHint: 'playback',
      sampleRate:  44100,
    });

    audioLogger.info(EngineEvent.CONTEXT_CREATED, 'AudioContext created', {
      sampleRate: _context.sampleRate,
      state:      _context.state,
    });

    return _context;
  } catch (err) {
    _creationFailed = true;
    audioLogger.error(EngineEvent.CONTEXT_FAILED, 'Failed to create AudioContext', err);
    return null;
  }
}

/**
 * Attempt to resume the AudioContext if it is suspended or interrupted.
 *
 * Browsers may start the context in "suspended" state and require a resume()
 * call from a user gesture. iOS Safari may also suspend it on page hide.
 *
 * @returns {Promise<boolean>} Resolves to true if the context is now running.
 */
export async function resumeAudioContext() {
  if (!_context) {
    // Create on demand (called from within a user gesture)
    getAudioContext();
    if (!_context) return false;
  }

  if (_context.state === 'running') {
    return true; // Already running — no-op
  }

  if (_context.state === 'closed') {
    audioLogger.warn('context', 'AudioContext is closed and cannot be resumed');
    return false;
  }

  try {
    await _context.resume();
    audioLogger.info(EngineEvent.CONTEXT_RESUMED, 'AudioContext resumed', {
      state: _context.state,
    });
    return _context.state === 'running';
  } catch (err) {
    audioLogger.error('context', 'AudioContext.resume() failed', err);
    return false;
  }
}

/**
 * Return whether the Web Audio API is available in this browser.
 * Safe to call before any user interaction.
 * @returns {boolean}
 */
export function isWebAudioSupported() {
  return getAudioContextConstructor() !== null;
}

/**
 * Return the current AudioContext state without creating one.
 * Returns 'unavailable' if the context has not been created yet.
 * @returns {'suspended'|'running'|'closed'|'interrupted'|'unavailable'}
 */
export function getAudioContextState() {
  if (!_context) return 'unavailable';
  return _context.state;
}

/**
 * Expose the raw context directly for node wiring inside the audio engine.
 * Components and hooks should NOT use this — use getAudioContext() instead.
 * @returns {AudioContext | null}
 */
export function getRawAudioContext() {
  return _context;
}
