/**
 * lyrics/LyricsProvider.js
 *
 * Provider abstraction layer for the Auralis Lyrics Engine.
 *
 * Architecture
 * ────────────
 * This module defines:
 *
 *   BaseLyricsProvider      — contract that all providers must implement
 *   LrcLibProvider          — default provider using lrclib.net (free, no API key)
 *   InstrumentalFallback    — terminal provider that always succeeds with an
 *                             instrumental marker so the engine never hangs
 *   LyricsProviderManager   — iterates the ordered provider chain, stopping at
 *                             the first successful result
 *
 * Adding a new provider
 * ─────────────────────
 * 1. Extend BaseLyricsProvider.
 * 2. Implement async resolve(song) → LyricsPayload | null.
 * 3. Register it via lyricsProviderManager.registerProvider(provider, priority).
 *    Lower priority numbers run first (e.g. 0 = offline cache, 10 = network).
 *
 * The LyricsEngine never imports a specific provider — it calls only
 * lyricsProviderManager.resolve(song).
 *
 * LyricsPayload shape:
 *   {
 *     raw:          string|null,  // raw LRC or plain text
 *     type:         'synchronized' | 'plain' | 'instrumental',
 *     provider:     string,       // human-readable provider name
 *     language:     string|null,  // BCP-47 language tag if known
 *   }
 */

import { audioLogger }          from '../audio/AudioLogger';
import { LyricsEvent }          from './LyricsEvents';
import {
  fetchFromLrcLib,
  searchLrcLib,
} from '../services/lyrics/lrclib';

// ─── Base class ────────────────────────────────────────────────────────────────

/**
 * Abstract base class for all lyric providers.
 *
 * Subclasses MUST implement `resolve(song)`.
 *
 * @abstract
 */
export class BaseLyricsProvider {
  /**
   * @param {string} name     - Human-readable provider identifier (e.g. 'LrcLib')
   * @param {number} priority - Lower numbers run first. Must be a non-negative integer.
   */
  constructor(name, priority = 50) {
    if (new.target === BaseLyricsProvider) {
      throw new TypeError('BaseLyricsProvider is abstract and cannot be instantiated directly');
    }
    this.name     = name;
    this.priority = priority;
  }

  /**
   * Attempt to resolve lyrics for the given song.
   *
   * MUST be overridden by subclasses.
   *
   * @param {Object} song - Song object from playerStore.currentSong
   * @returns {Promise<LyricsPayload|null>}
   *   Return a valid LyricsPayload on success, null if this provider cannot
   *   supply lyrics for the song (engine will try the next provider).
   */
  // eslint-disable-next-line no-unused-vars
  async resolve(song) {
    throw new Error(`${this.name}.resolve() is not implemented`);
  }
}

// ─── LrcLib provider ───────────────────────────────────────────────────────────

/**
 * Default lyrics provider using the lrclib.net public API.
 *
 * Strategy:
 *  1. Exact-match GET by title + artist (+ duration if known)
 *  2. If that returns null (404), fuzzy search as a fallback
 *  3. Prefer synced LRC over plain text
 */
export class LrcLibProvider extends BaseLyricsProvider {
  constructor() {
    super('LrcLib', 10);
  }

  /**
   * @param {Object} song
   * @returns {Promise<LyricsPayload|null>}
   */
  async resolve(song) {
    const title  = song?.title  || song?.name || '';
    const artist = song?.artist || song?.artistName || '';

    if (!title || !artist) return null;

    const query = {
      title,
      artist,
      album:       song?.album ?? undefined,
      durationSec: song?.duration ?? undefined,
    };

    // Stage 1: exact match
    let result = await fetchFromLrcLib(query);

    // Stage 2: fuzzy search fallback (if exact returned nothing)
    if (!result) {
      result = await searchLrcLib({ title, artist });
    }

    if (!result) return null;

    // Instrumental tracks explicitly flagged by the API
    if (result.instrumental && !result.syncedLyrics && !result.plainLyrics) {
      return { raw: null, type: 'instrumental', provider: this.name, language: null };
    }

    // Prefer synced (LRC) over plain text
    if (result.syncedLyrics) {
      return {
        raw:      result.syncedLyrics,
        type:     'synchronized',
        provider: this.name,
        language: null,
      };
    }

    if (result.plainLyrics) {
      return {
        raw:      result.plainLyrics,
        type:     'plain',
        provider: this.name,
        language: null,
      };
    }

    return null;
  }
}

// ─── Instrumental fallback ────────────────────────────────────────────────────

/**
 * Terminal provider that always succeeds.
 * Placed at the END of the provider chain so the engine never remains
 * indefinitely in a loading state when no lyrics source is available.
 */
export class InstrumentalFallback extends BaseLyricsProvider {
  constructor() {
    super('InstrumentalFallback', 9999);
  }

  // eslint-disable-next-line no-unused-vars
  async resolve(song) {
    return { raw: null, type: 'instrumental', provider: this.name, language: null };
  }
}

// ─── Provider Manager ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} LyricsPayload
 * @property {string|null} raw       - Raw LRC or plain text content
 * @property {'synchronized'|'plain'|'instrumental'} type
 * @property {string}      provider  - Name of the provider that resolved
 * @property {string|null} language  - BCP-47 language tag, or null
 */

class LyricsProviderManager {
  constructor() {
    /**
     * Ordered list of providers.
     * Always sorted ascending by priority before resolution.
     * @type {BaseLyricsProvider[]}
     */
    this._providers = [];

    // Register built-in defaults
    this.registerProvider(new LrcLibProvider());
    this.registerProvider(new InstrumentalFallback());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a new provider.
   * The manager re-sorts after every registration so priority order is maintained.
   *
   * @param {BaseLyricsProvider} provider
   */
  registerProvider(provider) {
    if (!(provider instanceof BaseLyricsProvider)) {
      throw new TypeError('provider must be an instance of BaseLyricsProvider');
    }
    // Prevent duplicates by name
    this._providers = this._providers.filter(p => p.name !== provider.name);
    this._providers.push(provider);
    this._providers.sort((a, b) => a.priority - b.priority);
    audioLogger.log(LyricsEvent.PROVIDER_SELECTED, `Provider registered: ${provider.name} (priority ${provider.priority})`);
  }

  /**
   * Remove a provider by name.
   * @param {string} name
   */
  unregisterProvider(name) {
    this._providers = this._providers.filter(p => p.name !== name);
  }

  /**
   * Return a copy of the current provider list (ascending priority order).
   * @returns {BaseLyricsProvider[]}
   */
  getProviders() {
    return [...this._providers];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Resolution
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Iterate the provider chain until one returns a non-null LyricsPayload.
   *
   * Each provider is tried in ascending priority order.
   * Provider errors are caught individually — a failing provider causes
   * a fallthrough to the next rather than aborting the chain.
   *
   * @param {Object} song
   * @returns {Promise<LyricsPayload>} Always resolves — InstrumentalFallback guarantees a result
   */
  async resolve(song) {
    audioLogger.info(LyricsEvent.LOAD_STARTED, `Resolving lyrics for: "${song?.title}" by "${song?.artist}"`);

    for (const provider of this._providers) {
      audioLogger.log(LyricsEvent.PROVIDER_SELECTED, `Trying provider: ${provider.name}`);

      try {
        const payload = await provider.resolve(song);

        if (payload) {
          audioLogger.info(LyricsEvent.PROVIDER_SUCCESS, `Provider "${provider.name}" succeeded`, {
            type: payload.type,
          });
          return payload;
        }

        audioLogger.log(LyricsEvent.PROVIDER_MISS, `Provider "${provider.name}" returned no lyrics`);
      } catch (err) {
        audioLogger.error(LyricsEvent.PROVIDER_FAILURE, `Provider "${provider.name}" threw`, err);
        // Fall through to next provider
      }
    }

    // Should never reach here because InstrumentalFallback always succeeds
    audioLogger.warn(LyricsEvent.PROVIDER_EXHAUSTED, 'All providers exhausted — no lyrics available');
    return { raw: null, type: 'instrumental', provider: 'none', language: null };
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const lyricsProviderManager = new LyricsProviderManager();
