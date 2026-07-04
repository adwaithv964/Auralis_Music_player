/**
 * audio/AudioLogger.js
 *
 * Rolling in-memory debug logger for the AudioEngine.
 *
 * Design goals:
 *   - Zero external dependencies
 *   - Fixed-size ring buffer (MAX_ENTRIES) — no unbounded memory growth
 *   - console.debug output in development; silent in production
 *   - Timestamped entries for chronological debugging
 *   - Exportable log history for diagnostic panels or error reporting
 *
 * Usage:
 *   import { audioLogger } from './AudioLogger';
 *   audioLogger.log('init', 'AudioEngine initialised');
 *   audioLogger.error('context', 'AudioContext creation failed', err);
 *   const history = audioLogger.getLogs(); // array of LogEntry
 */

// ─── Configuration ─────────────────────────────────────────────────────────────
const MAX_ENTRIES = 100; // Maximum entries kept in the rolling buffer
const DEV_MODE    = import.meta.env.DEV ?? false;
const PREFIX      = '[Auralis Audio]';

// ─── Log Levels ────────────────────────────────────────────────────────────────
export const LogLevel = Object.freeze({
  DEBUG: 'debug',
  INFO:  'info',
  WARN:  'warn',
  ERROR: 'error',
});

/**
 * @typedef {Object} LogEntry
 * @property {number} index      - Monotonically increasing sequence number
 * @property {string} timestamp  - ISO-8601 timestamp
 * @property {number} elapsed    - Milliseconds since engine was first used
 * @property {string} level      - LogLevel value
 * @property {string} tag        - Short category tag (e.g. 'init', 'seek', 'error')
 * @property {string} message    - Human-readable description
 * @property {*}      [data]     - Optional structured payload
 */

class AudioLogger {
  constructor() {
    /** @type {LogEntry[]} */
    this._buffer  = [];
    this._index   = 0;
    this._startTs = Date.now();
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Append a DEBUG-level entry.
   * @param {string} tag     - Short category tag
   * @param {string} message - Description
   * @param {*}      [data]  - Optional extra data
   */
  log(tag, message, data) {
    this._append(LogLevel.DEBUG, tag, message, data);
  }

  /**
   * Append an INFO-level entry (always printed to console in dev).
   */
  info(tag, message, data) {
    this._append(LogLevel.INFO, tag, message, data);
  }

  /**
   * Append a WARN-level entry.
   */
  warn(tag, message, data) {
    this._append(LogLevel.WARN, tag, message, data);
  }

  /**
   * Append an ERROR-level entry.
   * @param {string} tag
   * @param {string} message
   * @param {Error|*} [err] - Error object or raw data
   */
  error(tag, message, err) {
    this._append(LogLevel.ERROR, tag, message, err);
  }

  /**
   * Return a shallow copy of the current log buffer (oldest first).
   * @returns {LogEntry[]}
   */
  getLogs() {
    return [...this._buffer];
  }

  /**
   * Return only entries at or above the given log level.
   * @param {string} minLevel - One of LogLevel values
   * @returns {LogEntry[]}
   */
  getLogsAbove(minLevel) {
    const order = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIdx = order.indexOf(minLevel);
    return this._buffer.filter(e => order.indexOf(e.level) >= minIdx);
  }

  /**
   * Return only entries matching the given tag.
   * @param {string} tag
   * @returns {LogEntry[]}
   */
  getLogsByTag(tag) {
    return this._buffer.filter(e => e.tag === tag);
  }

  /**
   * Clear all stored log entries and reset the sequence counter.
   */
  clear() {
    this._buffer  = [];
    this._index   = 0;
    this._startTs = Date.now();
  }

  /**
   * Dump the last N entries as a formatted string (useful for crash reports).
   * @param {number} [n=20]
   * @returns {string}
   */
  dump(n = 20) {
    const tail = this._buffer.slice(-n);
    return tail
      .map(e => `[${e.elapsed}ms] [${e.level.toUpperCase()}] [${e.tag}] ${e.message}`)
      .join('\n');
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /**
   * @private
   */
  _append(level, tag, message, data) {
    const now     = Date.now();
    const elapsed = now - this._startTs;

    /** @type {LogEntry} */
    const entry = {
      index:     this._index++,
      timestamp: new Date(now).toISOString(),
      elapsed,
      level,
      tag,
      message,
      ...(data !== undefined ? { data } : {}),
    };

    // Rolling buffer — evict oldest when full
    if (this._buffer.length >= MAX_ENTRIES) {
      this._buffer.shift();
    }
    this._buffer.push(entry);

    // Console output
    if (DEV_MODE) {
      const label = `${PREFIX} [${tag}] ${message}`;
      switch (level) {
        case LogLevel.ERROR: console.error(label, data ?? '');  break;
        case LogLevel.WARN:  console.warn(label,  data ?? '');  break;
        case LogLevel.INFO:  console.info(label,  data ?? '');  break;
        default:             console.debug(label, data ?? '');  break;
      }
    } else if (level === LogLevel.ERROR) {
      // Always surface errors even in production
      console.error(`${PREFIX} [${tag}] ${message}`, data ?? '');
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const audioLogger = new AudioLogger();
