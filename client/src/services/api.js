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
  /** Fire-and-forget: saves a full track snapshot. Never throws. */
  saveHistory(track) {
    if (!track?.id) return;
    fetch('/api/history', {
      method:  'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        id:         track.id,
        title:      track.title,
        artist:     track.artist,
        album:      track.album,
        artworkUrl: track.artworkUrl,
        duration:   track.duration,
        genre:      track.genre,
        language:   track.language,
        sourceType: track.sourceType,
      }),
    }).catch(() => {});   // silent — never blocks playback
  },

  /** Fetch play history from server */
  async getHistory(limit = 20) {
    const res = await fetch(`/api/history?limit=${limit}`);
    if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
    return res.json(); // { history: [...] }
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

  // ── Playlists ──────────────────────────────────────────────────

  /** Fetch all playlists */
  async getPlaylists() {
    const res = await fetch('/api/playlists');
    if (!res.ok) throw new Error(`Get playlists failed: ${res.status}`);
    return res.json(); // { playlists }
  },

  /** Create a new playlist */
  async createPlaylist({ name, description = '', color = '#1db954' }) {
    const res = await fetch('/api/playlists', {
      method:  'POST',
      headers: JSON_HEADERS,
      body:    JSON.stringify({ name, description, color }),
    });
    if (!res.ok) throw new Error(`Create playlist failed: ${res.status}`);
    return res.json(); // { playlist }
  },

  /** Rename / update a playlist */
  async updatePlaylist(id, { name, description, color }) {
    const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: JSON_HEADERS,
      body:    JSON.stringify({ name, description, color }),
    });
    if (!res.ok) throw new Error(`Update playlist failed: ${res.status}`);
    return res.json(); // { playlist }
  },

  /** Delete a playlist */
  async deletePlaylist(id) {
    const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete playlist failed: ${res.status}`);
    return res.json();
  },

  /** Add a track to a playlist */
  async addToPlaylist(playlistId, track) {
    const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method:  'POST',
      headers: JSON_HEADERS,
      body:    JSON.stringify({ track }),
    });
    if (!res.ok) throw new Error(`Add to playlist failed: ${res.status}`);
    return res.json(); // { playlist, added }
  },

  /** Remove a track from a playlist */
  async removeFromPlaylist(playlistId, trackId) {
    const res = await fetch(
      `/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(`Remove from playlist failed: ${res.status}`);
    return res.json(); // { playlist }
  },

  /** Exclude a track from taste profile recommendations */
  async excludeTrack(trackId) {
    const res = await fetch('/api/excluded', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ id: trackId }),
    });
    if (!res.ok) throw new Error(`Exclude track failed: ${res.status}`);
    return res.json();
  },
};
