/**
 * services/api.js
 *
 * All raw HTTP calls to the Auralis Express backend.
 * Components should call musicService.js (higher-level) rather than
 * this file directly — keeps the door open for caching, interceptors,
 * auth headers, etc. without touching every call-site.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  // ── Bootstrap: initial app data on first load ──────────────
  async fetchBootstrap() {
    const res = await fetch('/api/bootstrap');
    if (!res.ok) throw new Error(`Bootstrap failed: ${res.status}`);
    return res.json();
  },

  // ── External music search (YouTube / iTunes / Audius) ──────
  async searchExternal(term, language, page = 0, mood = '') {
    const params = new URLSearchParams({
      term:     term || '',
      language: language || 'malayalam',
      page:     String(page),
      limit:    '36',
      ...(mood ? { mood } : {}),
    });
    const res = await fetch(`/api/external/search?${params}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json();
  },

  // ── Resolve an iTunes track to a full YouTube stream URL ───
  async resolveYouTube(title, artist) {
    const params = new URLSearchParams({ title, artist: artist || '' });
    const res = await fetch(`/api/youtube/resolve?${params}`);
    if (!res.ok) throw new Error(`YouTube resolve failed: ${res.status}`);
    return res.json(); // { videoId, streamUrl }
  },

  // ── Favorites management ───────────────────────────────────
  async toggleFavorite(id, isFavorite) {
    const method = isFavorite ? 'DELETE' : 'PUT';
    const res = await fetch(`/api/favorites/${encodeURIComponent(id)}`, { method });
    if (!res.ok) throw new Error(`Favorite toggle failed: ${res.status}`);
    return res.json();
  },

  // ── Preferences persistence ────────────────────────────────
  async updatePreferences(prefs) {
    const res = await fetch('/api/preferences', {
      method:  'PATCH',
      headers: JSON_HEADERS,
      body:    JSON.stringify(prefs),
    });
    if (!res.ok) throw new Error(`Preferences update failed: ${res.status}`);
    return res.json();
  },

  // ── Playback history ───────────────────────────────────────
  async saveHistory(track) {
    await fetch('/api/history', {
      method:  'POST',
      headers: JSON_HEADERS,
      body:    JSON.stringify(track),
    });
  },

  // ── Library: add a track ───────────────────────────────────
  async addTrackToLibrary(track) {
    const res = await fetch('/api/library/tracks', {
      method:  'POST',
      headers: JSON_HEADERS,
      body:    JSON.stringify({ track }),
    });
    if (!res.ok) throw new Error(`Add to library failed: ${res.status}`);
    return res.json();
  },
};
