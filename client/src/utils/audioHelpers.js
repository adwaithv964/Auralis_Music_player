// ─── Time formatter ───────────────────────────────────────────
/** Convert seconds to m:ss string */
export function fmt(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── Artwork proxy ────────────────────────────────────────────
/**
 * Route all external artwork URLs through the server proxy
 * to avoid CORS issues. Internal `/api/` paths pass through.
 */
export function artProxy(url) {
  if (!url) return '';
  if (url.startsWith('/api/')) return url;
  return `/api/artwork?url=${encodeURIComponent(url)}`;
}

// ─── Track guards ─────────────────────────────────────────────
/** True if the track has a playable audio URL */
export const trackHasAudio = (t) => !!(t?.previewUrl);

/** True if the track is a full-length song (not a 30s preview) */
export const isFullSong = (t) => t?.isFull === true || t?.sourceType === 'audius';

// ─── Cover background helper ──────────────────────────────────
/**
 * Returns a CSS background value for a track card:
 * - Artwork URL (proxied) if available
 * - Gradient from track color palette otherwise
 */
export const coverBg = (t) => {
  if (!t) return 'none';
  if (t.artworkUrl) return `url(${artProxy(t.artworkUrl)}) center/cover no-repeat`;
  return `linear-gradient(135deg, ${t.color?.[0] || '#1db954'}, ${t.color?.[1] || '#191414'})`;
};
