/**
 * server/searchEngine.js
 *
 * Advanced Search Engine, Original Soundtrack (OST) Prioritizer,
 * and Metadata-to-Audio Verification System for Auralis.
 */

const { DES } = require('des.js');
const SAAVN_DES_KEY = Array.from(Buffer.from('38346591'));

// ── 1. Text Normalization & Transliteration Helpers ─────────────────────────

/** Decodes common HTML entities */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** Strip punctuation, extra whitespace, diacritics, and normalize */
function normalizeText(str) {
  if (!str) return '';
  return decodeHtmlEntities(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\w\s]/gi, ' ')       // replace symbols with spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute token similarity between two strings (0.0 to 1.0) */
function computeSimilarity(a, b) {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    return Math.max(0.8, minLen / maxLen);
  }

  const tokensA = new Set(normA.split(' ').filter(t => t.length > 1));
  const tokensB = new Set(normB.split(' ').filter(t => t.length > 1));
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  tokensA.forEach(t => {
    if (tokensB.has(t)) intersection++;
  });

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── 2. Query Decomposition & Interpretation ─────────────────────────────────

/**
 * Decomposes complex queries like:
 *   'Veezha Veera (From "O.M: Operation Mole")'
 *   'Veezha Veera Operation Mole'
 *   'O.M: Operation Mole Malayalam songs'
 *   'Original soundtrack Veezha Veera'
 * into structured components: title, movie/origin, artists, intent.
 */
function parseQuery(rawQuery) {
  if (!rawQuery) return { raw: '', cleanTitle: '', movie: '', isOSTQuery: false };

  let query = rawQuery.trim();
  let isOSTQuery = false;
  let movie = '';
  let title = query;

  // Detect explicit OST keywords
  if (/\b(ost|original soundtrack|original motion picture soundtrack|soundtrack)\b/i.test(query)) {
    isOSTQuery = true;
    query = query.replace(/\b(ost|original soundtrack|original motion picture soundtrack|soundtrack)\b/gi, '').trim();
  }

  // Detect (From "Movie Name") or [From "Movie Name"]
  const fromRegex = /[\(\[]\s*from\s+["']?([^"')\]]+)["']?\s*[\)\]]/i;
  const fromMatch = query.match(fromRegex);
  if (fromMatch) {
    movie = fromMatch[1].trim();
    title = query.replace(fromRegex, '').trim();
  } else {
    // Check for "- From Movie" or "From Movie"
    const fromPlainMatch = query.match(/\bfrom\s+["']?([^"']+)["']?$/i);
    if (fromPlainMatch) {
      movie = fromPlainMatch[1].trim();
      title = query.replace(/\bfrom\s+["']?([^"']+)["']?$/i, '').trim();
    }
  }

  // Clean trailing punctuation or separators like " - "
  title = title.replace(/\s*[-:|]\s*$/, '').trim();

  return {
    raw: rawQuery,
    cleanTitle: title || rawQuery,
    movie: movie,
    isOSTQuery: isOSTQuery || !!movie,
  };
}

// ── 3. Version Classification ───────────────────────────────────────────────

/**
 * Classifies track into one of 4 strict tiers:
 *   1. 'original_soundtrack' (Priority 1)
 *   2. 'official_release'    (Priority 2)
 *   3. 'official_alternate'  (Priority 3 - Remastered / Compilation)
 *   4. 'other_version'       (Priority 4 - Remix / Cover / Live / Lo-fi)
 */
function classifyVersion(title = '', album = '', artist = '') {
  const fullText = `${title} ${album}`.toLowerCase();
  const albumLower = (album || '').toLowerCase();

  // Tier 4: Other Versions (Covers, Remixes, Unplugged, Lo-Fi)
  if (/\b(remix|dj mix|mashup|club mix|dance mix|trap mix)\b/i.test(fullText)) {
    return { tier: 4, label: 'Remix', badge: 'Remix' };
  }
  if (/\b(cover|unplugged|acoustic|tribute|rendition|karaoke|instrumental|lo-?fi)\b/i.test(fullText)) {
    return { tier: 4, label: 'Cover / Instrumental', badge: 'Cover' };
  }
  if (/\b(live|concert|in concert)\b/i.test(fullText)) {
    return { tier: 4, label: 'Live Performance', badge: 'Live' };
  }

  // Tier 3: Compilations / Best Of / Remastered (checked before OST so compilation releases don't steal Tier 1)
  if (/\b(best of|greatest hits|essential|collection|hits \d{4}|music day)\b/i.test(albumLower)) {
    return { tier: 3, label: 'Compilation Album', badge: 'Compilation' };
  }

  if (/\b(remaster|remastered)\b/i.test(fullText)) {
    return { tier: 3, label: 'Remastered', badge: 'Remastered' };
  }

  // Tier 1: Verified Original Movie Soundtrack
  if (
    /\b(original motion picture soundtrack|soundtrack from the motion picture|original soundtrack|o\.?s\.?t\.?)\b/i.test(fullText) ||
    /[\(\[]\s*from\s+["'].*["']\s*[\)\]]/i.test(fullText)
  ) {
    return { tier: 1, label: 'Original Movie Soundtrack', badge: 'Original Soundtrack' };
  }

  // Tier 2: Official Artist Release / Single
  return { tier: 2, label: 'Official Release', badge: 'Official Release' };
}

// ── 4. Advanced Scoring & Ranking Engine ────────────────────────────────────

/**
 * Computes an objective relevancy score (0 to 100+) for a candidate track
 * given the user's parsed query.
 */
function scoreCandidate(track, parsedQuery) {
  let score = 0;
  const trackTitleNorm = normalizeText(track.title);
  const queryTitleNorm = normalizeText(parsedQuery.cleanTitle);
  const trackAlbumNorm = normalizeText(track.album);
  const movieNorm = normalizeText(parsedQuery.movie);

  // 1. Title Similarity (0 - 50 points)
  const titleSim = computeSimilarity(track.title, parsedQuery.cleanTitle);
  score += titleSim * 50;

  // Exact title match bonus
  if (trackTitleNorm === queryTitleNorm) {
    score += 15;
  }

  // 2. Movie / Origin Matching (0 - 40 points)
  if (movieNorm) {
    if (trackAlbumNorm.includes(movieNorm) || trackTitleNorm.includes(movieNorm)) {
      score += 40;
    } else {
      const albumSim = computeSimilarity(track.album, movieNorm);
      score += albumSim * 30;
    }
  }

  // 3. Version & OST Prioritization (Phase 3 Requirement)
  const version = classifyVersion(track.title, track.album, track.artist);
  if (version.tier === 1) {
    score += 35; // Priority 1 boost
  } else if (version.tier === 2) {
    score += 15; // Priority 2 boost
  } else if (version.tier === 3) {
    score += 5;  // Priority 3 boost
  } else if (version.tier === 4) {
    // Penalty for remix/cover UNLESS the user explicitly requested it
    if (!/\b(remix|cover|acoustic|lofi|unplugged)\b/i.test(parsedQuery.raw)) {
      score -= 30;
    }
  }

  // 4. Playability bonus
  if (track.streamUrl || track.isFull) {
    score += 10;
  }

  return {
    ...track,
    matchScore: Math.round(score),
    versionInfo: version,
    isOST: version.tier === 1,
  };
}

// ── 5. Strict Metadata-to-Audio Match Verifier ──────────────────────────────

const KNOWN_LANGUAGES = ['hindi', 'telugu', 'tamil', 'malayalam', 'kannada', 'bengali', 'marathi', 'punjabi', 'bhojpuri', 'gujarati'];

function extractLanguageModifiers(text) {
  if (!text) return new Set();
  const norm = normalizeText(text);
  const words = new Set(norm.split(' '));
  const found = new Set();
  for (const lang of KNOWN_LANGUAGES) {
    if (words.has(lang)) found.add(lang);
  }
  return found;
}

/**
 * Validates that an audio resolution candidate (e.g. from JioSaavn or YouTube)
 * actually represents the exact song requested by the user.
 *
 * Prevents the fatal flaw where searching "Veezha Veera" resolves to "Veera Veera"!
 */
function verifyTrackMatch(targetTitle, targetArtist = '', targetAlbum = '', candidate = {}) {
  if (!candidate) return false;

  const candidateTitle = decodeHtmlEntities(candidate.title || candidate.song || '');
  const candidateArtist = decodeHtmlEntities(candidate.artist || candidate.primary_artists || candidate.channel || '');
  const candidateAlbum = decodeHtmlEntities(candidate.album || '');

  if (!candidateTitle) return false;

  // 0. Language / Dubbed Modifier Check
  // Prevent dubbed versions (e.g. "- Hindi" or "- Telugu") from matching original OST,
  // and ensure target language requirements are respected.
  const targetLangs = extractLanguageModifiers(`${targetTitle} ${targetAlbum}`);
  const candLangs = extractLanguageModifiers(`${candidateTitle} ${candidateAlbum}`);

  if (targetLangs.size > 0) {
    // Target explicitly requested language (e.g. "Veera Veera (From 'O.M: Operation Mole - Telugu')")
    // Candidate MUST contain at least one of target languages if candidate specifies language modifiers
    let hasOverlap = false;
    for (const tl of targetLangs) {
      if (candLangs.has(tl)) { hasOverlap = true; break; }
    }
    if (!hasOverlap && candLangs.size > 0) {
      // Candidate specifies a different language than requested
      return false;
    }
  } else {
    // Target did NOT specify a language modifier (original release)
    // If candidate has an explicit language modifier like "hindi", "telugu" etc., reject dubbed candidate
    if (candLangs.size > 0) {
      return false;
    }
  }

  // 1. Title Similarity Check
  const titleSim = computeSimilarity(targetTitle, candidateTitle);

  // If title similarity is below 0.60, reject immediately
  if (titleSim < 0.60) {
    return false;
  }

  // 2. Artist Overlap Check
  const normTargetArtist = normalizeText(targetArtist);
  const normCandArtist = normalizeText(candidateArtist);

  let artistMatches = false;
  if (normTargetArtist && normCandArtist) {
    const targetTokens = normTargetArtist.split(' ').filter(t => t.length > 2);
    const candTokens = new Set(normCandArtist.split(' ').filter(t => t.length > 2));
    artistMatches = targetTokens.some(t => candTokens.has(t));
  }

  // 3. Album / Movie Overlap Check
  const normTargetAlbum = normalizeText(targetAlbum);
  const normCandAlbum = normalizeText(candidateAlbum);

  let albumMatches = false;
  if (normTargetAlbum && normCandAlbum) {
    const targetAlbumTokens = normTargetAlbum.split(' ').filter(t => t.length > 2);
    const candAlbumTokens = new Set(normCandAlbum.split(' ').filter(t => t.length > 2));
    albumMatches = targetAlbumTokens.some(t => candAlbumTokens.has(t));
  }

  // Decision Logic:
  // - If title is near exact (>= 0.85): Accept
  // - If title is moderate (0.60 - 0.84): REQUIRES artist match OR album/movie match
  if (titleSim >= 0.85) return true;
  if (titleSim >= 0.60 && (artistMatches || albumMatches)) return true;

  return false;
}

// ── 6. Verified YouTube Search ──────────────────────────────────────────────

/**
 * Searches YouTube and returns ONLY video IDs whose titles and channels
 * strictly verify against the requested track title, artist, and album.
 */
async function searchYouTubeVerified(title, artist = '', album = '') {
  const query = `${title} ${artist} official audio`;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const items = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

    for (const item of items) {
      const v = item.videoRenderer;
      if (!v || !v.videoId) continue;

      const videoTitle = v.title?.runs?.[0]?.text || '';
      const channel = v.ownerText?.runs?.[0]?.text || '';

      const isMatch = verifyTrackMatch(title, artist, album, {
        title: videoTitle,
        artist: channel,
        album: album,
      });

      if (isMatch) {
        console.log(`[YouTube Verified OK] Video "${videoTitle}" (${v.videoId}) matches "${title}"`);
        return v.videoId;
      }
    }
  } catch (err) {
    console.warn('[searchYouTubeVerified] Error:', err.message);
  }

  return null;
}

// ── 7. JioSaavn Decryption & Helpers ─────────────────────────────────────────

function decryptSaavnUrl(encryptedUrl) {
  if (!encryptedUrl) return '';
  try {
    const cipher = DES.create({ type: 'decrypt', key: SAAVN_DES_KEY });
    const cipherBuf = Array.from(Buffer.from(encryptedUrl, 'base64'));
    const decrypted = cipher.update(cipherBuf).concat(cipher.final());
    const plain = Buffer.from(decrypted).toString('utf8').replace(/\0/g, '').trim();
    return plain
      .replace('http://', 'https://')
      .replace(/_96\.mp4/, '_320.mp4')
      .replace(/_160\.mp4/, '_320.mp4')
      .replace(/_96\.mp3/, '_320.mp4')
      .replace(/_160\.mp3/, '_320.mp4')
      .replace(/\.mp3$/, '.mp4');
  } catch (e) {
    return '';
  }
}

function parseJioJson(text) {
  if (!text) return null;
  try {
    const s = text.trim();
    const i = Math.min(
      s.indexOf('{') >= 0 ? s.indexOf('{') : Infinity,
      s.indexOf('[') >= 0 ? s.indexOf('[') : Infinity,
    );
    return i === Infinity ? null : JSON.parse(s.slice(i));
  } catch (_) { return null; }
}

// ── 8. Search JioSaavn Catalog ──────────────────────────────────────────────

async function searchSaavnTracks(query, language = 'malayalam') {
  if (!query) return [];
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const headers = {
    'User-Agent': userAgent,
    Accept: 'application/json, text/plain, */*',
    Cookie: 'geo=IN',
  };

  const tracks = [];
  const seenIds = new Set();
  const seenKeys = new Set();

  const addCandidate = (item) => {
    if (!item || !item.id) return;
    const cleanId = String(item.id);
    if (seenIds.has(cleanId)) return;
    seenIds.add(cleanId);

    const mi = item.more_info || {};
    const enc = mi.encrypted_media_url || item.encrypted_media_url || '';
    const streamUrl = enc ? decryptSaavnUrl(enc) : '';
    const title = decodeHtmlEntities(item.title || item.song || '').trim();
    if (!title) return;

    const artist = decodeHtmlEntities(
      mi.artistMap?.primary_artists?.map(a => a.name).join(', ') ||
      item.primary_artists || item.singers || 'Unknown'
    ).trim();
    const album = decodeHtmlEntities(mi.album || item.album || '').trim();

    const dedupKey = `${normalizeText(title)}|${normalizeText(artist).split(' ')[0]}`;
    if (seenKeys.has(dedupKey)) return;
    seenKeys.add(dedupKey);

    const art = item.image?.replace('150x150', '500x500') || '';

    tracks.push({
      id: `saavn-${cleanId}`,
      title,
      artist,
      album,
      duration: Number(item.duration || mi.duration) || 180,
      genre: item.language || 'Music',
      language: item.language || language,
      isFull: !!streamUrl,
      sourceType: 'saavn',
      previewUrl: streamUrl,
      streamUrl: streamUrl,
      artworkUrl: art,
      lyrics: ['Full 320kbps track via JioSaavn', artist, album],
    });
  };

  try {
    // Run 3 complementary search mechanisms in parallel:
    // 1. Direct song search (standard web client)
    // 2. Global album search (bypasses US/regional song geo-filtering for soundtracks & movie singles)
    // 3. Autocomplete search (fast edge trie)
    const [songRes, albumRes, autoRes] = await Promise.allSettled([
      fetch(
        `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(query)}&n=20&p=1&_format=json&_marker=0&api_version=4&ctx=web6dot0`,
        { headers, signal: AbortSignal.timeout(7000) }
      ).then(r => r.ok ? r.text() : null).then(t => t ? parseJioJson(t) : null),

      fetch(
        `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&q=${encodeURIComponent(query)}&n=10&p=1&_format=json&_marker=0&api_version=4`,
        { headers, signal: AbortSignal.timeout(7000) }
      ).then(r => r.ok ? r.text() : null).then(t => t ? parseJioJson(t) : null),

      fetch(
        `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(query)}&_format=json&_marker=0&ctx=wap6dot0`,
        { headers, signal: AbortSignal.timeout(6000) }
      ).then(r => r.ok ? r.text() : null).then(t => t ? parseJioJson(t) : null),
    ]);

    // Process 1: Standard song search results
    if (songRes.status === 'fulfilled' && songRes.value?.results) {
      songRes.value.results.forEach(addCandidate);
    }

    // Process 2: Album results (critical for global & overseas cloud parity like Render)
    if (albumRes.status === 'fulfilled' && Array.isArray(albumRes.value?.results) && albumRes.value.results.length > 0) {
      const albumList = albumRes.value.results.slice(0, 10);
      const albumDetails = await Promise.allSettled(
        albumList.map(alb =>
          fetch(
            `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${alb.id}&_format=json&_marker=0&api_version=4`,
            { headers, signal: AbortSignal.timeout(6000) }
          ).then(r => r.ok ? r.text() : null).then(t => t ? parseJioJson(t) : null)
        )
      );

      albumDetails.forEach(res => {
        if (res.status === 'fulfilled' && res.value?.list) {
          res.value.list.forEach(addCandidate);
        }
      });
    }

    // Process 3: Autocomplete song suggestions
    if (autoRes.status === 'fulfilled' && autoRes.value?.songs?.data) {
      const autoIds = autoRes.value.songs.data.map(s => s.id).filter(Boolean).slice(0, 5);
      if (autoIds.length > 0) {
        try {
          const detText = await fetch(
            `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&api_version=4&pids=${autoIds.join(',')}`,
            { headers, signal: AbortSignal.timeout(6000) }
          ).then(r => r.ok ? r.text() : null);
          const detData = detText ? parseJioJson(detText) : null;
          if (detData) {
            autoIds.forEach(id => {
              if (detData[id]) addCandidate(detData[id]);
            });
          }
        } catch (_) {}
      }
    }

    return tracks;
  } catch (err) {
    console.warn('[searchSaavnTracks]', err.message);
    return tracks;
  }
}

// ── 9. Robust Verified Audio Stream Resolver ────────────────────────────────

/**
 * Resolves a stream URL for the given track info by:
 * 1. Searching JioSaavn with multi-candidate queries (enforcing cc=in & api_version=4).
 * 2. Strict matching every candidate using `verifyTrackMatch`.
 * 3. If verified match found, returns decrypted 320kbps MP4 URL.
 * 4. If JioSaavn has no verified match, falls back to `searchYouTubeVerified`.
 * 5. If verified YouTube video found, returns stream URL.
 * 6. If neither verified, returns null (never silently substitutes an unrelated song).
 */
async function resolveVerifiedAudioStream(targetTitle, targetArtist = '', targetAlbum = '') {
  if (!targetTitle) return null;
  const parsed = parseQuery(targetTitle);
  const cleanTitle = parsed.cleanTitle;

  // Step 1: Search JioSaavn
  const queries = [
    targetArtist ? `${cleanTitle} ${targetArtist.split(/[,&]/)[0].trim()}` : null,
    parsed.movie ? `${cleanTitle} ${parsed.movie}` : null,
    cleanTitle,
  ].filter(Boolean).filter((q, i, a) => q && q.length > 2 && a.indexOf(q) === i);

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  for (const q of queries) {
    try {
      let results = [];
      try {
        const resp = await fetch(
          `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(q)}&n=10&p=1&_format=json&_marker=0&cc=in&api_version=4`,
          {
            headers: { 'User-Agent': userAgent, Accept: 'application/json, text/plain, */*', Cookie: 'geo=IN' },
            signal: AbortSignal.timeout(6000),
          }
        );
        if (resp.ok) {
          const text = await resp.text();
          const data = parseJioJson(text);
          results = data?.results || [];
        }
      } catch (_) {}

      // Fallback: autocomplete if primary search returned no results
      if (!results.length) {
        try {
          const autoResp = await fetch(
            `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(q)}&_format=json&_marker=0&ctx=wap6dot0`,
            {
              headers: { 'User-Agent': userAgent, Accept: 'application/json, text/plain, */*', Cookie: 'geo=IN' },
              signal: AbortSignal.timeout(6000),
            }
          );
          if (autoResp.ok) {
            const autoData = parseJioJson(await autoResp.text());
            const autoIds = (autoData?.songs?.data || []).map(s => s.id).filter(Boolean).slice(0, 5);
            if (autoIds.length) {
              const detResp = await fetch(
                `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&api_version=4&pids=${autoIds.join(',')}`,
                {
                  headers: { 'User-Agent': userAgent, Accept: 'application/json, text/plain, */*', Cookie: 'geo=IN' },
                  signal: AbortSignal.timeout(6000),
                }
              );
              if (detResp.ok) {
                const detData = parseJioJson(await detResp.text());
                results = autoIds.map(id => detData?.[id]).filter(Boolean);
              }
            }
          }
        } catch (_) {}
      }

      if (!results.length) continue;

      for (const item of results) {
        let mi = item.more_info;
        if (typeof mi === 'string') {
          try { mi = JSON.parse(mi); } catch (_) { mi = {}; }
        } else if (!mi) {
          mi = {};
        }

        const candidateSong = decodeHtmlEntities(item.title || item.song || '');
        const candidateArtist = decodeHtmlEntities(mi.artistMap?.primary_artists?.map(a => a.name).join(', ') || item.primary_artists || item.subtitle || '');
        const candidateAlbum = decodeHtmlEntities(mi.album || item.album || '');

        // Strict verification
        const isMatch = verifyTrackMatch(targetTitle, targetArtist, targetAlbum, {
          title: candidateSong,
          artist: candidateArtist,
          album: candidateAlbum,
        });

        if (!isMatch) {
          console.log(`[JioSaavn] Rejected mismatch candidate: "${candidateSong}" (${candidateAlbum})`);
          continue;
        }

        // Passed match!
        const enc = mi.encrypted_media_url || item.encrypted_media_url;
        if (enc) {
          const url = decryptSaavnUrl(enc);
          if (url.startsWith('http')) {
            console.log(`[JioSaavn Verified OK] "${candidateSong}" -> ${url.slice(0, 50)}...`);
            return {
              streamUrl: url,
              contentType: 'audio/mp4',
              via: 'saavn',
              matchedSong: candidateSong,
            };
          }
        }
      }
    } catch (err) {
      console.warn('[JioSaavn search err]:', err.message);
    }
  }

  // Step 2: Fallback to Verified YouTube
  console.log(`[JioSaavn] No verified match for "${targetTitle}". Searching verified YouTube...`);
  const ytVideoId = await searchYouTubeVerified(targetTitle, targetArtist, targetAlbum);
  if (ytVideoId) {
    console.log(`[YouTube Verified OK] videoId: ${ytVideoId}`);
    return {
      streamUrl: `/api/youtube/stream?id=${ytVideoId}`,
      contentType: 'audio/mp4',
      via: 'youtube_verified',
      videoId: ytVideoId,
    };
  }

  console.warn(`[Audio Resolver] No verified audio found for "${targetTitle}"`);
  return null;
}

module.exports = {
  decodeHtmlEntities,
  normalizeText,
  computeSimilarity,
  parseQuery,
  classifyVersion,
  scoreCandidate,
  verifyTrackMatch,
  searchYouTubeVerified,
  decryptSaavnUrl,
  searchSaavnTracks,
  resolveVerifiedAudioStream,
};
