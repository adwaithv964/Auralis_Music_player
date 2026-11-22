/**
 * services/lyrics/lrclib.js
 *
 * Thin HTTP client for the lrclib.net public REST API.
 *
 * lrclib.net provides free, crowd-sourced synchronized (LRC) and plain-text
 * lyrics with no API key required. This module is intentionally kept minimal —
 * it only handles the network layer and light response normalization.
 * All parsing is delegated to LyricsParser.
 *
 * API endpoint used:
 *   GET https://lrclib.net/api/get
 *   Query params: artist_name, track_name, album_name (optional), duration (optional)
 *
 * Response shape (abridged):
 *   {
 *     id:           number,
 *     trackName:    string,
 *     artistName:   string,
 *     albumName:    string,
 *     duration:     number,   // seconds
 *     syncedLyrics: string|null,   // LRC format
 *     plainLyrics:  string|null,
 *     instrumental: boolean,
 *   }
 *
 * Usage (internal — called by LyricsProvider, not directly by app code):
 *   import { fetchFromLrcLib } from '../../services/lyrics/lrclib';
 *   const result = await fetchFromLrcLib({ title, artist, album, durationSec });
 */

// ─── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL     = 'https://lrclib.net/api';
const TIMEOUT_MS   = 8000;
const USER_AGENT   = 'Auralis Music Player (https://github.com/auralis)';

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LrcLibQuery
 * @property {string}  title
 * @property {string}  artist
 * @property {string}  [album]
 * @property {number}  [durationSec]
 */

/**
 * @typedef {Object} LrcLibResult
 * @property {string|null} syncedLyrics - Raw LRC string, or null
 * @property {string|null} plainLyrics  - Raw plain-text lyrics, or null
 * @property {boolean}     instrumental - True if the track is instrumental
 * @property {string}      source       - Always 'lrclib'
 */

// ─── Internal fetch with timeout ───────────────────────────────────────────────

/**
 * Fetch a URL with an AbortController-based timeout.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch lyrics from lrclib.net for a given track.
 *
 * Returns null if the track was not found, the request timed out, or any
 * network / parse error occurs. Never throws — all failures are silent.
 *
 * Priority: synced LRC > plain text > instrumental flag.
 *
 * @param {LrcLibQuery} query
 * @returns {Promise<LrcLibResult|null>}
 */
export async function fetchFromLrcLib({ title, artist, album, durationSec } = {}) {
  if (!title || !artist) return null;

  const params = new URLSearchParams({
    track_name:  title.trim(),
    artist_name: artist.trim(),
  });
  if (album)       params.set('album_name', album.trim());
  if (durationSec) params.set('duration',   String(Math.round(durationSec)));

  const url = `${BASE_URL}/get?${params}`;

  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);

    // 404 → track not in database; not an error worth logging loudly
    if (res.status === 404) return null;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    /** @type {Record<string, *>} */
    const data = await res.json();

    return {
      syncedLyrics: data.syncedLyrics ?? null,
      plainLyrics:  data.plainLyrics  ?? null,
      instrumental: !!(data.instrumental),
      source:       'lrclib',
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      // Timeout — not an exceptional condition; provider will fall through
      return null;
    }
    // Unexpected error — caller will log it through the provider layer
    throw err;
  }
}

/**
 * Search lrclib.net for tracks matching a query (fuzzy match).
 * Useful as a fallback when the exact-match GET returns 404.
 *
 * @param {LrcLibQuery} query
 * @returns {Promise<LrcLibResult|null>} Best match, or null if none found
 */
export async function searchLrcLib({ title, artist } = {}) {
  if (!title || !artist) return null;

  const params = new URLSearchParams({
    track_name:  title.trim(),
    artist_name: artist.trim(),
  });

  const url = `${BASE_URL}/search?${params}`;

  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);
    if (!res.ok) return null;

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    // Prefer first result with synced lyrics, otherwise first with plain lyrics
    const synced = results.find(r => r.syncedLyrics);
    const plain  = results.find(r => r.plainLyrics);
    const best   = synced ?? plain ?? results[0];

    return {
      syncedLyrics: best.syncedLyrics ?? null,
      plainLyrics:  best.plainLyrics  ?? null,
      instrumental: !!(best.instrumental),
      source:       'lrclib',
    };
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}
