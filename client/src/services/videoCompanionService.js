/**
 * client/src/services/videoCompanionService.js
 *
 * Client-side YouTube Video Companion service for Auralis Music.
 * Fetches verified music videos with client-side caching and stale response protection.
 */

const LOCAL_CACHE_KEY = 'auralis:video_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getLocalCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalCache(cache) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

let activeAbortController = null;

export async function fetchMusicVideoMatch(track) {
  if (!track || !track.title) {
    return { found: false, message: 'Track metadata missing' };
  }

  const clean = (track.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const movie = (track.album || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const artist = (track.artist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const lang = (track.language || '').toLowerCase();
  const cacheKey = `${track.id || ''}:${clean}:${movie}:${artist}:${lang}`;

  // 1. Check local client cache
  const cache = getLocalCache();
  const cachedEntry = cache[cacheKey];
  if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
    return cachedEntry.data;
  }

  // 2. Abort any previous in-flight video search request
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  const params = new URLSearchParams({
    title: track.title,
    artist: track.artist || '',
    album: track.album || '',
    duration: track.duration ? String(track.duration) : '',
    language: track.language || '',
    trackId: track.id || '',
  });

  try {
    const resp = await fetch(`/api/youtube/video-match?${params.toString()}`, {
      signal: activeAbortController.signal,
    });

    if (!resp.ok) {
      return { found: false, message: 'Official music video not available' };
    }

    const data = await resp.json();

    // Cache the result (including negative results to prevent quota exhaustion)
    cache[cacheKey] = {
      timestamp: Date.now(),
      data,
    };

    // Keep cache bounded to 150 entries
    const keys = Object.keys(cache);
    if (keys.length > 150) {
      delete cache[keys[0]];
    }
    setLocalCache(cache);

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      return { aborted: true };
    }
    console.warn('[videoCompanionService] Error:', err.message);
    return { found: false, message: 'Connection error while searching for video' };
  }
}
