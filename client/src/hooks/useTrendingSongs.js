/**
 * hooks/useTrendingSongs.js
 *
 * Fetches real trending Malayalam songs from /api/trending.
 * - Caches in localStorage for 6 hours
 * - Auto-refreshes on mount if cache is stale
 * - Exposes manual refresh()
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const CACHE_KEY = 'auralis:trending';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function loadCache(language) {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${language}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed._ts > CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(language, data) {
  try {
    localStorage.setItem(`${CACHE_KEY}:${language}`, JSON.stringify({ ...data, _ts: Date.now() }));
  } catch {}
}

const EMPTY = {
  trending:    [],
  viral:       [],
  movieTracks: [],
  newReleases: [],
  topCharts:   [],
  lastUpdated: null,
  totalSources: [],
};

export function useTrendingSongs(language = 'malayalam') {
  const [data,      setData]      = useState(() => loadCache(language) || EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState(null);
  const abortRef  = useRef(null);
  const fetchedFor = useRef(null);

  const fetchTrending = useCallback(async (lang, force = false) => {
    if (!force) {
      const cached = loadCache(lang);
      if (cached && cached.trending?.length > 0) {
        setData(cached);
        return;
      }
    }

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/trending?language=${encodeURIComponent(lang)}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      saveCache(lang, json);
      setData(json);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message);
      // Fall back to stale cache if available
      const stale = loadCache(lang);
      if (stale) setData(stale);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount or language change
  useEffect(() => {
    if (fetchedFor.current !== language) {
      fetchedFor.current = language;
      fetchTrending(language, false);
    }
  }, [language, fetchTrending]);

  const refresh = useCallback(() => fetchTrending(language, true), [language, fetchTrending]);

  return { ...data, isLoading, error, refresh };
}
