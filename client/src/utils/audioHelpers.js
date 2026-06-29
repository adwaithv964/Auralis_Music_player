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

  // These CDNs are public and accessible directly from browsers — no proxy needed.
  // Routing them through the server causes 500s because the CDN blocks server UA / IPs.
  const DIRECT_CDN_PATTERNS = [
    'mzstatic.com',       // Apple Music / iTunes
    'last.fm',            // Last.fm
    'lastfm.freetls.fastly.net', // Last.fm Fastly CDN
    'saavn.com',          // JioSaavn
    'jiosaavn.com',
    'c.saavncdn.com',
    'i.scdn.co',          // Spotify CDN
    'image.tmdb.org',
  ];
  try {
    const { hostname } = new URL(url);
    if (DIRECT_CDN_PATTERNS.some(p => hostname === p || hostname.endsWith(`.${p}`))) {
      return url; // load directly — no proxy
    }
  } catch (_) { /* fall through */ }

  return `/api/artwork?url=${encodeURIComponent(url)}`;
}


// ─── Track guards ─────────────────────────────────────────────
/** True if the track has a playable audio URL OR can be resolved on demand */
export const trackHasAudio = (t) =>
  !!(t?.previewUrl) ||               // has direct URL
  t?.sourceType === 'itunes' ||       // iTunes → resolve YouTube on demand
  t?.sourceType === 'audius' ||       // Audius full track
  !!(t?.title && t?.artist);          // has enough info to resolve

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
