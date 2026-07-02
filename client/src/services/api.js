/**
 * services/api.js
 *
 * All raw HTTP calls to the Auralis Express backend.
 *
 * Auth strategy
 * ─────────────
 * Every protected request includes: Authorization: Bearer <accessToken>
 *
 * The token is injected via `setApiToken(token)` called from AuthContext
 * whenever the token changes. On 401 responses the module calls
 * `onTokenExpired()` (also set from AuthContext) which triggers a silent
 * refresh and retries the original request once.
 *
 * This keeps api.js free of React hook calls while still supporting
 * automatic token refresh.
 */

// ── Token store (module-level, never persisted to localStorage) ────────────
let _token       = null;
let _refreshFn   = null; // () => Promise<string> — injected by AuthContext
let _onLogout    = null; // () => void            — injected by AuthContext

/** Called by AuthContext to wire in the current token + refresh callback */
export function setApiToken(token, refreshFn, onLogout) {
  _token     = token;
  _refreshFn = refreshFn;
  _onLogout  = onLogout;
}

// ── Internal fetch wrapper with auth + auto-refresh ─────────────────────────
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * authFetch — wraps fetch with:
 *  1. Authorization: Bearer <token> header
 *  2. On 401: silent token refresh + one retry
 *  3. On second 401: logout and throw
 */
async function authFetch(url, options = {}, retry = true) {
  const headers = {
    ...options.headers,
    ...(options.json ? JSON_HEADERS : {}),
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
  };
  const body = options.json ? JSON.stringify(options.json) : options.body;

  const res = await fetch(url, {
    ...options,
    headers,
    body,
    credentials: 'include', // always send cookies (for refresh)
  });

  if (res.status === 401 && retry && _refreshFn) {
    try {
      const newToken = await _refreshFn();
      _token = newToken;
      // Retry original request with new token
      return authFetch(url, options, false);
    } catch (_) {
      if (_onLogout) _onLogout();
      throw new Error('Session expired — please log in again');
    }
  }

  return res;
}

export const api = {
  // ── Bootstrap: initial app data on first load ──────────────────────────────
  async fetchBootstrap() {
    const res = await authFetch('/api/bootstrap');
    if (!res.ok) throw new Error(`Bootstrap failed: ${res.status}`);
    return res.json();
  },

  // ── External music search (YouTube / iTunes / Audius) ──────────────────────
  // Public — no auth required, no authFetch needed
  async searchExternal(term, language, page = 0, mood = '') {
    const params = new URLSearchParams({
      term:     term || '',
      language: language || 'malayalam',
      page:     String(page),
      limit:    '50',
      ...(mood ? { mood } : {}),
    });
    const res = await fetch(`/api/external/search?${params}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json();
  },

  // ── Resolve an iTunes track to a JioSaavn stream URL ──────────────────────
  // Public — no auth needed
  async resolveYouTube(title, artist) {
    const params = new URLSearchParams({ title, artist: artist || '' });
    const res = await fetch(`/api/youtube/resolve?${params}`);
    if (!res.ok) throw new Error(`YouTube resolve failed: ${res.status}`);
    return res.json();
  },

  // ── Favorites management ────────────────────────────────────────────────────
  /**
   * @param {string}  id         - track ID
   * @param {boolean} isFavorite - current liked state (true = currently liked → DELETE)
   * @param {object}  [track]    - full track object (required on PUT to store snapshot)
   */
  async toggleFavorite(id, isFavorite, track = null) {
    const method = isFavorite ? 'DELETE' : 'PUT';
    const options = { method };
    // On PUT (adding a like), send the full track snapshot so the server can
    // persist it in likedSongs[] for display — independent of loaded tracks.
    if (!isFavorite && track) {
      options.json = { track };
    }
    const res = await authFetch(`/api/favorites/${encodeURIComponent(id)}`, options);
    if (!res.ok) throw new Error(`Favorite toggle failed: ${res.status}`);
    return res.json();
  },

  // ── Preferences persistence ─────────────────────────────────────────────────
  async updatePreferences(prefs) {
    const res = await authFetch('/api/preferences', {
      method: 'PATCH',
      json:   prefs,
    });
    if (!res.ok) throw new Error(`Preferences update failed: ${res.status}`);
    return res.json();
  },

  // ── Playback history ────────────────────────────────────────────────────────
  /** Fire-and-forget: saves a full track snapshot. Never throws. */
  saveHistory(track) {
    if (!track?.id) return;
    authFetch('/api/history', {
      method: 'POST',
      json: {
        id:         track.id,
        title:      track.title,
        artist:     track.artist,
        album:      track.album,
        artworkUrl: track.artworkUrl,
        duration:   track.duration,
        genre:      track.genre,
        language:   track.language,
        sourceType: track.sourceType,
      },
    }).catch(() => {}); // silent — never blocks playback
  },

  /** Fetch play history from server */
  async getHistory(limit = 20) {
    const res = await authFetch(`/api/history?limit=${limit}`);
    if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
    return res.json();
  },

  // ── Library: add a track ────────────────────────────────────────────────────
  async addTrackToLibrary(track) {
    const res = await authFetch('/api/library/tracks', {
      method: 'POST',
      json:   { track },
    });
    if (!res.ok) throw new Error(`Add to library failed: ${res.status}`);
    return res.json();
  },

  // ── Playlists ───────────────────────────────────────────────────────────────

  /** Fetch all playlists for the authenticated user */
  async getPlaylists() {
    const res = await authFetch('/api/playlists');
    if (!res.ok) throw new Error(`Get playlists failed: ${res.status}`);
    return res.json();
  },

  /** Create a new playlist */
  async createPlaylist({ name, description = '', color = '#1db954' }) {
    const res = await authFetch('/api/playlists', {
      method: 'POST',
      json:   { name, description, color },
    });
    if (!res.ok) throw new Error(`Create playlist failed: ${res.status}`);
    return res.json();
  },

  /** Rename / update a playlist */
  async updatePlaylist(id, { name, description, color }) {
    const res = await authFetch(`/api/playlists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json:   { name, description, color },
    });
    if (!res.ok) throw new Error(`Update playlist failed: ${res.status}`);
    return res.json();
  },

  /** Delete a playlist */
  async deletePlaylist(id) {
    const res = await authFetch(`/api/playlists/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Delete playlist failed: ${res.status}`);
    return res.json();
  },

  /** Add a track to a playlist */
  async addToPlaylist(playlistId, track) {
    const res = await authFetch(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      json:   { track },
    });
    if (!res.ok) throw new Error(`Add to playlist failed: ${res.status}`);
    return res.json();
  },

  /** Remove a track from a playlist */
  async removeFromPlaylist(playlistId, trackId) {
    const res = await authFetch(
      `/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(`Remove from playlist failed: ${res.status}`);
    return res.json();
  },

  /** Exclude a track from taste profile recommendations */
  async excludeTrack(trackId) {
    const res = await authFetch('/api/excluded', {
      method: 'POST',
      json:   { id: trackId },
    });
    if (!res.ok) throw new Error(`Exclude track failed: ${res.status}`);
    return res.json();
  },
};
