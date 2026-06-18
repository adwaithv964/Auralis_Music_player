export const api = {
  async fetchBootstrap() {
    const res = await fetch("/api/bootstrap");
    return res.json();
  },

  async searchExternal(term, language, page = 0, mood = '') {
    const params = new URLSearchParams({
      term:     term || '',
      language: language || 'malayalam',
      page:     String(page),
      limit:    '36',
      ...(mood ? { mood } : {}),
    });
    const res = await fetch(`/api/external/search?${params}`);
    return res.json();
  },

  // Resolve iTunes track to YouTube full-track stream URL
  async resolveYouTube(title, artist) {
    const params = new URLSearchParams({ title, artist: artist || '' });
    const res = await fetch(`/api/youtube/resolve?${params}`);
    if (!res.ok) throw new Error(`YouTube resolve failed: ${res.status}`);
    return res.json(); // { videoId, streamUrl }
  },

  async toggleFavorite(id, isFavorite) {
    const method = isFavorite ? "DELETE" : "PUT";
    const res = await fetch(`/api/favorites/${encodeURIComponent(id)}`, { method });
    return res.json();
  },

  async updatePreferences(prefs) {
    const res = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    return res.json();
  },

  async saveHistory(track) {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(track),
    });
  },

  async addTrackToLibrary(track) {
    const res = await fetch("/api/library/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track }),
    });
    return res.json();
  },
};
