/**
 * server/trendingService.js
 *
 * Fetches real trending Malayalam songs from multiple chart sources:
 *   1. Last.fm       — tag charts (requires LASTFM_API_KEY in .env)
 *   2. JioSaavn      — trending SONGS by language search (not playlists)
 *   3. iTunes Search — Malayalam-specific multi-query search
 *   4. Apple Music   — New Releases RSS (India)
 *
 * Results are merged, scored, deduped, and cached for 6 hours.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Per-language cache: { timestamp, data }
const cache = new Map();

// ── Malayalam artist / keyword lists ─────────────────────────
const MALAYALAM_ARTISTS = new Set([
  'jakes bejoy', 'gopi sundar', 'shaan rahman', 'm jayachandran',
  'vidyasagar', 'prashant pillai', 'bijibal', 'renjith unni',
  'hesham abdul wahab', 'rex vijaykumar', 'shahabaz aman', 'deepak dev',
  'sushin shyam', 'sithara krishnakumar', 'vineeth sreenivasan', 'harishankar',
  'k j yesudas', 'k s chitra', 'mg sreekumar', 'unni menon', 'vijay yesudas',
  'sujatha mohan', 'aparna rajeev', 'manjari', 'rahul raj', 'alphonse joseph',
  'ouseppachan', 'job kurian', 'sreejith edavana', 'benny dayal', 'rimi tomy',
  'remya nambeesan', 'geetha madhuri', 'sayanora philip', 'divya s menon',
  'titto p thankachen', 'jyothi krishna', 'sithara', 'minnal murali',
  'anirudh ravichander', 'sid sriram', 'trend'
]);

const MALAYALAM_KEYWORDS = [
  'malayalam', 'mollywood', 'onam', 'vishu', 'kerala', 'kochi',
  'jakes bejoy', 'gopi sundar', 'shaan rahman', 'maaran', 'thudarum',
  'kuttan', 'chuttamalle', 'aavesham', 'identity', 'turbo', 'premalu',
];

function isMalayalam(track) {
  const text = `${track.artist} ${track.title} ${track.album || ''}`.toLowerCase();
  return MALAYALAM_KEYWORDS.some(kw => text.includes(kw)) ||
    [...MALAYALAM_ARTISTS].some(a => text.includes(a));
}

// ── Helpers ───────────────────────────────────────────────────
const ageDays = (t) => t.releaseDate
  ? (Date.now() - new Date(t.releaseDate).getTime()) / 86400000
  : 9999;

function computeScore(track) {
  const days      = ageDays(track);
  const ageBonus  = Math.max(0, 50 - (days / 120) * 50); // 0→50 decays over 4 months
  const rankScore = track.chartRank ? Math.max(0, 100 - track.chartRank) : 0;
  const srcBonus  = (track.sources?.length || 1) * 10;
  const listeners = track.listeners ? Math.min(50, track.listeners / 200000) : 0;
  return rankScore + ageBonus + srcBonus + listeners;
}

function assignBadge(track, rank) {
  if (rank === 0) return { label: '#1 Trending', color: '#ffd700' };
  const days = ageDays(track);
  if (days <= 14)  return { label: '⭐ New Entry', color: '#1db954' };
  if (days <= 45)  return { label: '📈 Rising',   color: '#00b0ff' };
  if (rank <= 4)   return { label: '🔥 Viral',    color: '#ff5722' };
  return null;
}

// ── Source 1: Last.fm tag charts ─────────────────────────────
async function fetchLastFm(tag = 'malayalam', limit = 50) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${apiKey}&format=json&limit=${limit}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.tracks?.track || []).map((t, i) => ({
      id:          `lastfm-${t.mbid || i}-${t.artist?.name}`,
      title:       t.name,
      artist:      t.artist?.name || '',
      album:       '',
      artworkUrl:  t.image?.find(img => img.size === 'extralarge')?.['#text'] || '',
      releaseDate: null,
      chartRank:   i + 1,
      listeners:   Number(t.listeners) || 0,
      sources:     ['Last.fm'],
      trendSource: 'lastfm',
    }));
  } catch { return []; }
}

// ── Source 2: JioSaavn — SONG SEARCH (not trending playlists) ─
// We search for "malayalam <year>" to get actual individual songs.
async function fetchJioSaavn(language = 'malayalam', limit = 40) {
  const queries = [
    `malayalam songs 2026`,
    `malayalam songs 2025`,
    `new malayalam hits 2025`,
  ];

  const seen = new Set();
  const out  = [];

  for (const q of queries) {
    try {
      const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=20&p=1&q=${encodeURIComponent(q)}`;
      const res  = await fetch(url, {
        signal:  AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const text    = await res.text();
      const jsonStr = text.startsWith('(') ? text.slice(1, -1) : text;
      const data    = JSON.parse(jsonStr);

      // getResults returns { songs: { data: [...] } }
      const songs = data?.songs?.data || data?.results || [];

      for (const t of songs) {
        // ONLY accept entries that look like actual songs:
        // - Must have a numeric duration or explicit song fields
        // - Must NOT be a playlist/album (those have list_name or no duration)
        const isActualSong =
          t.type === 'song' ||
          (t.song && typeof t.song === 'string' && t.song.length > 0) ||
          (t.title && t.duration && Number(t.duration) > 30);

        if (!isActualSong) continue;

        const title  = t.song || t.title || '';
        const artist = t.primary_artists || t.singers || t.more_info?.primary_artists || '';
        const key    = `${title.toLowerCase()}|${artist.toLowerCase()}`;
        if (!title || seen.has(key)) continue;
        seen.add(key);

        // Decode HTML entities in title/artist
        const decodeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'");

        out.push({
          id:          `jiosaavn-${t.id || key}`,
          title:       decodeHtml(title),
          artist:      decodeHtml(artist),
          album:       t.album || t.more_info?.album || '',
          artworkUrl:  (t.image || '').replace('150x150', '500x500'),
          releaseDate: t.release_date || t.more_info?.release_date || null,
          duration:    Number(t.duration) || 0,
          previewUrl:  t.media_preview_url || '',
          chartRank:   null,
          sources:     ['JioSaavn'],
          trendSource: 'jiosaavn',
        });
        if (out.length >= limit) break;
      }
    } catch (e) {
      // silently skip failed JioSaavn queries
    }
    if (out.length >= limit) break;
  }
  return out;
}

// ── Source 3: iTunes Search (multi-query Malayalam) ───────────
const ITUNES_QUERIES = [
  { term: 'malayalam songs 2026' },
  { term: 'malayalam songs 2025' },
  { term: 'jakes bejoy'          },
  { term: 'gopi sundar 2025'     },
  { term: 'mollywood 2025'       },
  { term: 'malayalam new 2024'   },
  { term: 'kerala music 2025'    },
  { term: 'thudarum soundtrack'  },
  { term: 'premalu songs'        },
];

async function fetchItunesSearch(limit = 100) {
  const perQ = Math.ceil(limit / ITUNES_QUERIES.length) + 5;

  const results = await Promise.allSettled(
    ITUNES_QUERIES.map(async ({ term }) => {
      const params = new URLSearchParams({
        term, entity: 'musicTrack', country: 'in', limit: String(perQ),
      });
      const res = await fetch(`https://itunes.apple.com/search?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.results || [];
    })
  );

  const seen = new Set();
  const out  = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const t of r.value) {
      if (!t.trackId || seen.has(t.trackId)) continue;
      seen.add(t.trackId);
      out.push({
        id:          `itunes-${t.trackId}`,
        title:       t.trackName || '',
        artist:      t.artistName || '',
        album:       t.collectionName || '',
        artworkUrl:  (t.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        releaseDate: t.releaseDate || null,
        duration:    Math.round((t.trackTimeMillis || 0) / 1000),
        previewUrl:  t.previewUrl || '',
        chartRank:   null,
        sources:     ['Apple Music'],
        trendSource: 'itunes-search',
        genre:       t.primaryGenreName || '',
      });
    }
  }
  return out;
}

// ── Source 4: Apple Music New Releases RSS (India) ────────────
async function fetchAppleMusicNewReleases(limit = 50) {
  try {
    const url = `https://rss.applemarketingtools.com/api/v2/in/music/new-releases/${limit}/songs.json`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.feed?.results || []).map((t, i) => ({
      id:          `apple-new-${t.id}`,
      title:       t.name,
      artist:      t.artistName || '',
      album:       t.name,
      artworkUrl:  (t.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      releaseDate: t.releaseDate || null,
      chartRank:   i + 1,
      sources:     ['Apple Music'],
      trendSource: 'apple-new-releases',
      genre:       t.genres?.[0]?.name || '',
    }));
  } catch { return []; }
}

// ── Merge + rank ──────────────────────────────────────────────
function mergeAndRank(allTracks) {
  const byKey = new Map();

  for (const t of allTracks) {
    const title  = (t.title || '').trim().toLowerCase();
    const artist = (t.artist || '').trim().toLowerCase();
    if (!title || !artist) continue;

    const key = `${title}|${artist}`;
    if (byKey.has(key)) {
      const ex = byKey.get(key);
      ex.sources   = [...new Set([...ex.sources, ...t.sources])];
      ex.chartRank = ex.chartRank
        ? Math.min(ex.chartRank, t.chartRank || 999)
        : t.chartRank;
      if (!ex.artworkUrl && t.artworkUrl) ex.artworkUrl = t.artworkUrl;
      if (!ex.releaseDate && t.releaseDate) ex.releaseDate = t.releaseDate;
      if (!ex.previewUrl && t.previewUrl) ex.previewUrl = t.previewUrl;
    } else {
      byKey.set(key, { ...t });
    }
  }

  // Filter: keep only Malayalam tracks
  const all       = [...byKey.values()];
  const malayalam = all.filter(t =>
    isMalayalam(t) ||
    t.trendSource === 'lastfm' ||
    t.trendSource === 'jiosaavn'
  );

  // Score and sort descending
  const scored = malayalam.map(t => ({ ...t, score: computeScore(t) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.map((t, i) => ({
    ...t,
    trendRank: i + 1,
    badge:     assignBadge(t, i),
    id:        t.id || `trend-${i}`,
  }));
}

// ── Main export ───────────────────────────────────────────────
async function fetchTrending(language = 'malayalam') {
  // Serve from cache if fresh
  const cached = cache.get(language);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return { ...cached.data, fromCache: true };
  }

  // Fire all sources concurrently
  const [lastfmMal, lastfmKerala, itunesResults, jiosaavnResults, appleNew] =
    await Promise.all([
      fetchLastFm('malayalam', 50),
      fetchLastFm('kerala',    30),
      fetchItunesSearch(100),
      fetchJioSaavn(language,  40),
      fetchAppleMusicNewReleases(50),
    ]);

  const allRaw = [
    ...lastfmMal,
    ...lastfmKerala,
    ...itunesResults,
    ...jiosaavnResults,
    ...appleNew,
  ];

  const ranked = mergeAndRank(allRaw);
  const now    = new Date().toISOString();

  // ── Categorize ──
  // New Releases: released within last 180 days (6 months)
  // Viral: released within 90 days and in top 40
  const data = {
    trending:    ranked.slice(0, 12),

    viral:       ranked
                   .filter(t => ageDays(t) <= 90 && t.trendRank <= 40)
                   .slice(0, 12),

    movieTracks: ranked
                   .filter(t => {
                     const text = `${t.album} ${t.title}`.toLowerCase();
                     return /\bfrom\b|\(from|movie|film|ost|soundtrack/.test(text);
                   })
                   .slice(0, 12),

    // New Releases: 180-day window, sorted newest first
    newReleases: ranked
                   .filter(t => t.releaseDate && ageDays(t) <= 180)
                   .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
                   .slice(0, 12),

    topCharts:   ranked
                   .filter(t => t.chartRank)
                   .sort((a, b) => a.chartRank - b.chartRank)
                   .slice(0, 12),

    lastUpdated:  now,
    totalSources: [...new Set(ranked.flatMap(t => t.sources))],
  };

  cache.set(language, { timestamp: Date.now(), data });
  return { ...data, fromCache: false };
}

module.exports = { fetchTrending };
