/**
 * lyrics/LyricsParser.js
 *
 * Pure-function LRC and plain-text lyric parser for the Auralis Lyrics Engine.
 *
 * Design goals:
 *   - Zero side effects — no network calls, no module-level state
 *   - Deterministic: same input always produces identical output
 *   - Tolerant: malformed lines are skipped, never thrown
 *   - Unicode-safe: handles UTF-8, CJK, Arabic, Devanagari, etc.
 *   - Fast: single-pass parsing then a single sort
 *
 * Supported LRC features:
 *   - Standard timestamps:   [01:23.45]  (mm:ss.xx)
 *   - Extended timestamps:   [01:23.456] (mm:ss.xxx)
 *   - Short timestamps:      [01:23]     (no centiseconds)
 *   - Multiple timestamps per line (duplicated translations)
 *   - Metadata tags:  [ar:], [ti:], [al:], [offset:], [by:], [length:]
 *   - Global offset:  positive (delay) or negative (advance) in ms
 *
 * Output format (ParsedLyrics):
 *   {
 *     type:     'synchronized' | 'plain' | 'instrumental',
 *     lines:    LyricLine[],     // sorted by .time ascending
 *     metadata: LyricsMetadata,
 *     raw:      string,          // original content, preserved for caching
 *   }
 *
 * LyricLine:
 *   {
 *     time:         number,   // playback position in seconds (float)
 *     text:         string,   // display text (trimmed)
 *     translation?: string,   // optional — injected by LyricsEngine later
 *     romanized?:   string,   // optional — injected by LyricsEngine later
 *   }
 *
 * Usage:
 *   import { lyricsParser } from './LyricsParser';
 *   const parsed = lyricsParser.parseLRC(rawLrcString);
 *   const parsed = lyricsParser.parsePlain(rawTextString);
 */

import { audioLogger } from '../audio/AudioLogger';
import { LyricsEvent }  from './LyricsEvents';

// ─── Regex patterns ────────────────────────────────────────────────────────────

/**
 * Matches a single LRC timestamp: [mm:ss.xx], [mm:ss.xxx], or [mm:ss]
 * Capture groups: 1=minutes, 2=seconds, 3=fractional (optional)
 */
const TIMESTAMP_RE = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

/**
 * Matches a metadata-only tag at the start of a line: [key:value]
 * e.g. [ar:The Beatles], [offset:-200]
 * Must occupy the whole "tag" portion — text after is the lyric.
 */
const METADATA_TAG_RE = /^\[([a-zA-Z#]+):(.+?)\]$/;

/** Known metadata keys that should never be treated as lyric lines */
const METADATA_KEYS = new Set(['ar', 'ti', 'al', 'offset', 'by', 'length', 're', 've', 'tool']);

// ─── Helper ────────────────────────────────────────────────────────────────────

/**
 * Convert parsed timestamp parts to fractional seconds.
 * @param {string} mm  - Minutes string
 * @param {string} ss  - Seconds string
 * @param {string} frac - Fractional seconds string (1–3 digits), may be empty
 * @returns {number} Time in seconds (float)
 */
function partsToSeconds(mm, ss, frac) {
  const minutes  = parseInt(mm, 10);
  const seconds  = parseInt(ss, 10);
  // Normalise fractional component to milliseconds regardless of digit count
  let ms = 0;
  if (frac) {
    // Pad or truncate to exactly 3 digits for consistent ms parsing
    const padded = frac.padEnd(3, '0').slice(0, 3);
    ms = parseInt(padded, 10);
  }
  return minutes * 60 + seconds + ms / 1000;
}

// ─── LyricsParser class ────────────────────────────────────────────────────────

class LyricsParser {

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Parse an LRC-formatted string into a normalized ParsedLyrics object.
   *
   * @param {string} raw - Raw LRC content (may include BOM, CRLF, etc.)
   * @returns {import('./LyricsEngine').ParsedLyrics}
   */
  parseLRC(raw) {
    if (!raw || typeof raw !== 'string') {
      return this._emptyResult('instrumental', raw);
    }

    // Normalise line endings and strip BOM
    const content = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const inputLines = content.split('\n');

    /** @type {import('./LyricsEngine').LyricsMetadata} */
    const metadata = {
      artist: null,
      title:  null,
      album:  null,
      by:     null,
      offset: 0,    // ms — applied after parsing all lines
      length: null,
    };

    // First pass: extract metadata (especially offset) and collect raw lyric entries
    /** @type {{ times: number[], text: string }[]} */
    const entries = [];

    for (const line of inputLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // ── Check if the entire line is a metadata tag ─────────────────────
      const metaMatch = METADATA_TAG_RE.exec(trimmed);
      if (metaMatch) {
        const key   = metaMatch[1].toLowerCase();
        const value = metaMatch[2].trim();
        if (METADATA_KEYS.has(key)) {
          this._applyMetadata(metadata, key, value);
          continue;
        }
      }

      // ── Extract all timestamps from this line ──────────────────────────
      const times  = [];
      let lastIndex = 0;
      let match;
      TIMESTAMP_RE.lastIndex = 0;

      while ((match = TIMESTAMP_RE.exec(trimmed)) !== null) {
        times.push(partsToSeconds(match[1], match[2], match[3]));
        lastIndex = TIMESTAMP_RE.lastIndex;
      }

      if (times.length === 0) {
        // No timestamp — could be a metadata-style tag we don't recognise;
        // skip silently to avoid polluting the output with junk lines.
        continue;
      }

      // Text is everything after the last timestamp bracket
      const text = trimmed.slice(lastIndex).trim();

      // A line with timestamps but empty text is a valid "empty" line
      // (common for instrumental gaps — keep it so sync has a target)
      entries.push({ times, text });
    }

    // Second pass: apply offset and flatten into individual LyricLine objects
    const offsetSec = metadata.offset / 1000; // ms → seconds
    /** @type {import('./LyricsEngine').LyricLine[]} */
    const lines = [];

    for (const entry of entries) {
      for (const rawTime of entry.times) {
        const adjustedTime = Math.max(0, rawTime - offsetSec);
        lines.push({ time: adjustedTime, text: entry.text });
      }
    }

    if (lines.length === 0) {
      audioLogger.warn(LyricsEvent.PARSE_WARNING, 'LRC had no parseable timed lines — treating as plain');
      // Try to salvage as plain text
      return this.parsePlain(raw);
    }

    // Sort by time, then deduplicate timestamps (keep longest text)
    lines.sort((a, b) => a.time - b.time);
    const deduped = this._deduplicateLines(lines);

    audioLogger.log(LyricsEvent.LYRICS_PARSED, `LRC parsed: ${deduped.length} lines`, { metadata });

    return {
      type:     'synchronized',
      lines:    deduped,
      metadata,
      raw,
    };
  }

  /**
   * Parse plain-text lyrics (no timestamps).
   *
   * Each non-empty line becomes a LyricLine with `time: -1` (unsynchronized).
   * These are still useful for display as static lyrics.
   *
   * @param {string} raw
   * @returns {import('./LyricsEngine').ParsedLyrics}
   */
  parsePlain(raw) {
    if (!raw || typeof raw !== 'string') {
      return this._emptyResult('instrumental', raw);
    }

    const content = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = content
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(text => ({ time: -1, text }));

    if (lines.length === 0) {
      return this._emptyResult('instrumental', raw);
    }

    audioLogger.log(LyricsEvent.LYRICS_PARSED, `Plain lyrics parsed: ${lines.length} lines`);

    return {
      type:     'plain',
      lines,
      metadata: { artist: null, title: null, album: null, by: null, offset: 0, length: null },
      raw,
    };
  }

  /**
   * Auto-detect the format of a raw lyric string and parse accordingly.
   * Returns a synchronized result if LRC timestamps are present; otherwise plain.
   *
   * @param {string} raw
   * @returns {import('./LyricsEngine').ParsedLyrics}
   */
  parseAuto(raw) {
    if (!raw || typeof raw !== 'string') {
      return this._emptyResult('instrumental', null);
    }

    // Heuristic: if the string contains at least one valid LRC timestamp → LRC
    TIMESTAMP_RE.lastIndex = 0;
    const hasTimestamp = TIMESTAMP_RE.test(raw);
    TIMESTAMP_RE.lastIndex = 0;

    return hasTimestamp ? this.parseLRC(raw) : this.parsePlain(raw);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a single metadata key/value pair to the metadata object.
   * @private
   */
  _applyMetadata(metadata, key, value) {
    switch (key) {
      case 'ar':     metadata.artist = value; break;
      case 'ti':     metadata.title  = value; break;
      case 'al':     metadata.album  = value; break;
      case 'by':     metadata.by     = value; break;
      case 'length': metadata.length = value; break;
      case 'offset': {
        const ms = parseInt(value, 10);
        if (!isNaN(ms)) metadata.offset = ms;
        break;
      }
      default: break;
    }
  }

  /**
   * Deduplicate lines that share the same timestamp.
   * When two lines have the same time, keep the one with the longer text
   * (common with translation LRC files that overlay timestamps).
   *
   * @private
   * @param {import('./LyricsEngine').LyricLine[]} sorted - Already sorted by time
   * @returns {import('./LyricsEngine').LyricLine[]}
   */
  _deduplicateLines(sorted) {
    if (sorted.length <= 1) return sorted;
    const result = [];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      if (cur.time === prev.time) {
        // Keep the longer/non-empty text
        if (cur.text.length > prev.text.length) {
          prev = { ...prev, text: cur.text };
        }
      } else {
        result.push(prev);
        prev = cur;
      }
    }
    result.push(prev);
    return result;
  }

  /**
   * Return an empty ParsedLyrics object for tracks with no lyrics.
   * Also exposed publicly for use by LyricsEngine when all providers fail.
   * @param {'synchronized'|'plain'|'instrumental'} type
   * @param {string|null} raw
   * @returns {ParsedLyrics}
   */
  emptyResult(type, raw) {
    return this._emptyResult(type, raw);
  }

  /**
   * Return an empty ParsedLyrics object for tracks with no lyrics.
   * @private
   */
  _emptyResult(type, raw) {
    return {
      type:     type || 'instrumental',
      lines:    [],
      metadata: { artist: null, title: null, album: null, by: null, offset: 0, length: null },
      raw:      raw ?? null,
    };
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────
export const lyricsParser = new LyricsParser();
