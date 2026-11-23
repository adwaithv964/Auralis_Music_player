/**
 * client/src/services/videoCompanionService.js
 *
 * Client-side YouTube Video Companion service for Auralis Music.
 * Fetches verified music videos with client-side caching and stale response protection.
 */

const LOCAL_CACHE_KEY = 'auralis:video_cache_v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MEMORY_NEGATIVE_CACHE = new Map(); // key -> timestamp (short lived, 5s)

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

  // 1. Check persistent positive cache first
  const cache = getLocalCache();
  const cachedEntry = cache[cacheKey];
  if (cachedEntry && cachedEntry.data?.found) {
    if (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
      return cachedEntry.data;
    }
  }

  // 1b. Check short-lived in-memory negative cache (5 seconds max)
  const negTime = MEMORY_NEGATIVE_CACHE.get(cacheKey);
  if (negTime && Date.now() - negTime < 5000) {
    return { found: false, message: 'Official music video not available' };
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
    let resp = await fetch(`/api/youtube/video-match?${params.toString()}`, {
      signal: activeAbortController.signal,
    });

    // If local dev server returned 404 (e.g. backend not yet restarted on localhost),
    // fallback seamlessly to the deployed Vercel production gateway
    if (resp.status === 404 || !resp.ok) {
      try {
        const prodFallback = await fetch(`https://auralis-music-player.vercel.app/api/youtube/video-match?${params.toString()}`, {
          signal: activeAbortController.signal,
        });
        if (prodFallback.ok) {
          resp = prodFallback;
        }
      } catch (e) {
        // network or CORS error on fallback, keep original resp
      }
    }

    if (!resp.ok) {
      return { found: false, message: 'Official music video not available' };
    }

    const data = await resp.json();

    if (data && data.found) {
      // Cache verified positive result
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
    } else {
      // Negative result kept in memory for only 5s to allow fast retry if metadata loads or network recovers
      MEMORY_NEGATIVE_CACHE.set(cacheKey, Date.now());
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      return { aborted: true };
    }
    console.warn('[videoCompanionService] Error:', err.message);
    return { found: false, message: 'Connection error while searching for video' };
  }
}
