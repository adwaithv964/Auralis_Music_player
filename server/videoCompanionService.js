/**
 * server/videoCompanionService.js
 *
 * Original Music Video Discovery & Verification Service for Auralis Music.
 * Rigorously identifies, verifies, and classifies authentic YouTube official
 * music videos matching Auralis tracks without affecting existing audio streaming.
 */

const VIDEO_MATCH_CACHE = new Map(); // key -> { timestamp, data }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Trusted label and official artist channels
const OFFICIAL_CHANNELS = new Set([
  'think music india', 'think music', 'sony music south', 'sony music india',
  'saregama tamil', 'saregama malayalam', 'saregama telugu', 'saregama music',
  'zee music south', 'zee music company', 't-series', 't-series tamil',
  't-series telugu', 'divo music', 'muzik247', 'aditya music', 'lahari music',
  'speed audio video', 'manorama music', 'satyam audios', 'millennium audios',
  'silly monks music', 'warner music india', 'universal music india', 'tips official',
  'times music', 'yrf', 'eros now', 'sun tv', 'star vijay', 'kalaignar tv',
  'sai abhyankkar', 'anirudh ravichander', 'a.r. rahman', 'ar rahman', 'santhosh narayanan',
  'd. imman', 'g.v. prakash', 'gv prakash', 'hiphop tamizha', 'harris jayaraj',
  'yuvan shankar raja', 'sushin shyam', 'jakes bejoy', 'deepak dev', 'shaan rahman',
  'hesham abdul wahab', 'gopi sundar', 'sid sriram', 'pradeep kumar', 'k.j. yesudas',
  'k.s. chithra', 's.p. balasubrahmanyam', 'm.m. keeravaani', 'devi sri prasad', 'thaman s'
]);

function normalize(str = '') {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanTitle(str = '') {
  return str
    .replace(/\(From\s+[^)]+\)/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[-–—]\s*(Tamil|Telugu|Hindi|Malayalam|From\s+.*)$/i, '')
    .trim();
}

function extractMovie(title = '', album = '') {
  const combined = `${title} ${album}`;
  const m = combined.match(/\(From\s+["']?([^"')]+)["']?\)/i);
  if (m) {
    return m[1].replace(/-\s*(Telugu|Tamil|Hindi|Malayalam|English)/i, '').trim();
  }
  return (album || '').replace(/-\s*(Telugu|Tamil|Hindi|Malayalam|English)/i, '').trim();
}

function extractLanguages(str = '') {
  const s = str.toLowerCase();
  const langs = new Set();
  if (/\b(tamil|tam)\b/.test(s)) langs.add('tamil');
  if (/\b(telugu|tel)\b/.test(s)) langs.add('telugu');
  if (/\b(malayalam|mal)\b/.test(s)) langs.add('malayalam');
  if (/\b(hindi|hin)\b/.test(s)) langs.add('hindi');
  if (/\b(kannada|kan)\b/.test(s)) langs.add('kannada');
  return langs;
}

function parseDurationSeconds(str = '') {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  // If ISO 8601 duration (e.g. PT3M57S from YouTube Data API)
  if (typeof str === 'string' && str.startsWith('PT')) {
    const minMatch = str.match(/(\d+)M/);
    const secMatch = str.match(/(\d+)S/);
    const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
    const secs = secMatch ? parseInt(secMatch[1], 10) : 0;
    return mins * 60 + secs;
  }
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Validates whether a candidate YouTube video genuinely represents the original
 * music video or soundtrack for the target Auralis track.
 */
function verifyMusicVideoMatch(track, candidate) {
  if (!track || !candidate || !candidate.id) {
    return { matches: false, reason: 'Missing candidate data' };
  }

  const candTitle = candidate.title || '';
  const candChannel = candidate.channel || candidate.channelTitle || '';
  const normCandTitle = normalize(candTitle);
  const normCandChannel = normalize(candChannel);

  // 1. Duration check: Reject teasers, status snippets & shorts (< 60s)
  const candSec = parseDurationSeconds(candidate.length || candidate.duration);
  if (candSec > 0 && candSec < 60) {
    return { matches: false, reason: 'Teaser or clip too short (<60s)' };
  }

  // 2. Reject negative keywords (unrelated content, fan edits, reviews, etc.)
  const NEGATIVES = [
    'shorts', '#shorts', 'status video', 'whatsapp status', 'reaction',
    'dance cover', 'dance visualizer', 'parody', 'behind the scenes',
    'making of', 'interview', 'press meet', 'review', 'teaser', 'trailer',
    'motion poster', '8d audio', 'slowed', 'reverb', 'mashup', 'tribute',
    'scene', 'scenes', 'fight scene', 'comedy scene'
  ];
  for (const neg of NEGATIVES) {
    if (normCandTitle.includes(neg)) {
      return { matches: false, reason: `Contains negative keyword: ${neg}` };
    }
  }

  // Reject covers / karaoke unless target track is specifically marked as cover
  const trackIsCover = /cover/i.test(track.title);
  if (!trackIsCover && (/\bcover\b/i.test(candTitle) || /\bkaraoke\b/i.test(candTitle))) {
    return { matches: false, reason: 'Cover or karaoke' };
  }

  // Reject unplugged unless requested
  const trackIsUnplugged = /unplugged/i.test(track.title);
  if (!trackIsUnplugged && /\bunplugged\b/i.test(candTitle)) {
    return { matches: false, reason: 'Unplugged variant not requested' };
  }

  // Reject remix unless requested
  const trackIsRemix = /remix|mix\b/i.test(track.title);
  if (!trackIsRemix && /\bremix\b/i.test(candTitle)) {
    return { matches: false, reason: 'Remix variant not requested' };
  }

  // 3. Strict Language Separation (e.g. Tamil Veezha Veera vs Telugu Veera Veera)
  const trackLangs = extractLanguages(`${track.title} ${track.album || ''} ${track.language || ''}`);
  const candLangs = extractLanguages(`${candTitle} ${candChannel}`);

  if (trackLangs.size > 0) {
    let matchedLang = false;
    for (const tl of trackLangs) {
      if (candLangs.has(tl)) { matchedLang = true; break; }
    }
    // If candidate specifies an explicit language that contradicts target language, reject
    if (!matchedLang && candLangs.size > 0) {
      return { matches: false, reason: 'Language mismatch' };
    }
  }

  // 4. Exact Title Matching & Specific Discriminations
  const targetClean = cleanTitle(track.title);
  const normTarget = normalize(targetClean);

  // Exact song title discrimination for words that easily conflate across languages
  if (/\bveezha\b/i.test(track.title) && !/\bveezha\b/i.test(candTitle) && /\bveera veera\b/i.test(candTitle)) {
    return { matches: false, reason: 'Veera Veera (Telugu) does not match Veezha Veera (Tamil)' };
  }
  if (!/\bveezha\b/i.test(track.title) && /\bveera veera\b/i.test(track.title) && /\bveezha\b/i.test(candTitle)) {
    return { matches: false, reason: 'Veezha Veera (Tamil) does not match Veera Veera (Telugu)' };
  }

  const targetTokens = normTarget.split(' ').filter(t => t.length > 2);
  const candTokens = new Set(normCandTitle.split(' '));
  const matchedTokens = targetTokens.filter(t => candTokens.has(t));
  const tokenMatchRatio = targetTokens.length ? matchedTokens.length / targetTokens.length : 0;

  if (tokenMatchRatio < 0.60) {
    return { matches: false, reason: 'Insufficient title token match' };
  }

  // 5. Movie / Origin Context Check
  const movie = extractMovie(track.title, track.album);
  const normMovie = normalize(movie);
  let movieMatches = false;
  if (normMovie) {
    const movieTokens = normMovie.split(' ').filter(t => t.length > 2);
    const matchedMovie = movieTokens.filter(t => candTokens.has(t));
    movieMatches = matchedMovie.length > 0 || normCandTitle.includes(normMovie) || /\bom\b/i.test(candTitle);
  }

  // 6. Classification & Confidence Scoring
  let classification = 'Best Match';
  let score = 50;

  const isOfficialChannel = Array.from(OFFICIAL_CHANNELS).some(ch => normCandChannel.includes(ch)) ||
    (candidate.badge && candidate.badge.includes('Verified')) ||
    normCandChannel.includes('vevo') ||
    normCandChannel.includes('records');

  const isVideoSong = /video song|official video|music video|full video/i.test(candTitle);
  const isLyrical   = /lyrical|lyric video/i.test(candTitle);
  const isAudio     = /official audio|original soundtrack|full audio|ost\b/i.test(candTitle) || normCandChannel.includes('topic');

  if (isOfficialChannel) score += 25;
  if (movieMatches) score += 20;
  if (tokenMatchRatio >= 0.9) score += 15;

  // Duration proximity to known track duration (+/- 45s is standard for music videos with intros)
  if (track.duration && candSec > 0) {
    const diff = Math.abs(candSec - track.duration);
    if (diff <= 30) score += 15;
    else if (diff <= 60) score += 10;
  }

  if (isOfficialChannel && isVideoSong) {
    classification = 'Official Original Video';
    score += 35;
  } else if (isVideoSong) {
    classification = 'Official Music Video';
    score += 25;
  } else if (isOfficialChannel && isLyrical) {
    classification = 'Official Lyrical Video';
    score += 20;
  } else if (isLyrical) {
    classification = 'Official Lyrical Video';
    score += 15;
  } else if (isAudio) {
    classification = 'Official Soundtrack Video';
    score += 12;
  }

  return {
    matches: true,
    score,
    classification,
    isOfficialChannel,
    movieMatches,
    candSec,
  };
}

/**
 * Scrape-based video candidate search via YouTube results parsing.
 */
async function scrapeYouTubeCandidates(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept-Language': 'en-IN,en;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) return [];
  const html = await resp.text();
  const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
  if (!match) return [];

  const data = JSON.parse(match[1]);
  const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

  return contents
    .filter(c => c.videoRenderer && c.videoRenderer.videoId)
    .map(c => {
      const v = c.videoRenderer;
      return {
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || '',
        channel: v.ownerText?.runs?.[0]?.text || '',
        length: v.lengthText?.simpleText || '',
        thumbnail: v.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        badge: v.ownerBadges?.[0]?.metadataBadgeRenderer?.tooltip || '',
      };
    });
}

/**
 * Searches and finds the best verified original music video for an Auralis track.
 */
async function findBestMusicVideo(track) {
  if (!track || !track.title) {
    return { found: false, message: 'Track metadata missing' };
  }

  const clean = cleanTitle(track.title);
  const movie = extractMovie(track.title, track.album);
  const primaryArtist = (track.artist || '').split(/[,&]/)[0].trim();
  const lang = track.language || '';

  const cacheKey = `${track.id || ''}:${clean}:${movie}:${primaryArtist}:${lang}`.toLowerCase();
  const cached = VIDEO_MATCH_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  // Construct queries:
  // Primary query: Song Title + Movie + Artist + Official Music Video
  const qParts = [clean];
  if (movie) qParts.push(movie);
  if (primaryArtist) qParts.push(primaryArtist);
  if (lang) qParts.push(lang);
  qParts.push('official video');
  const primaryQuery = qParts.join(' ');

  try {
    let candidates = await scrapeYouTubeCandidates(primaryQuery);

    // If initial query returned few candidates, try secondary targeted query
    if (!candidates || candidates.length < 2) {
      const fallbackQuery = `${clean} ${primaryArtist} official music video`;
      const fallbackCandidates = await scrapeYouTubeCandidates(fallbackQuery);
      candidates = [...(candidates || []), ...fallbackCandidates];
    }

    const verifiedList = [];
    for (const cand of candidates) {
      const res = verifyMusicVideoMatch(track, cand);
      if (res.matches) {
        verifiedList.push({
          ...cand,
          score: res.score,
          classification: res.classification,
          isOfficialChannel: res.isOfficialChannel,
          durationSec: res.candSec,
        });
      }
    }

    // Sort by score descending
    verifiedList.sort((a, b) => b.score - a.score);

    if (verifiedList.length > 0) {
      const best = verifiedList[0];
      const result = {
        found: true,
        videoId: best.id,
        title: best.title,
        channelTitle: best.channel,
        classification: best.classification,
        badge: best.isOfficialChannel ? 'Verified Source' : 'Best Match',
        confidence: Math.min(0.99, Number((best.score / 125).toFixed(2))),
        duration: best.durationSec,
        thumbnailUrl: `https://i.ytimg.com/vi/${best.id}/hqdefault.jpg`,
        youtubeUrl: `https://www.youtube.com/watch?v=${best.id}`,
      };

      VIDEO_MATCH_CACHE.set(cacheKey, { timestamp: Date.now(), data: result });
      if (VIDEO_MATCH_CACHE.size > 500) {
        VIDEO_MATCH_CACHE.delete(VIDEO_MATCH_CACHE.keys().next().value);
      }
      return result;
    }
  } catch (err) {
    console.warn('[videoCompanionService] Error finding video:', err.message);
  }

  const notFound = {
    found: false,
    message: 'Official music video not available',
  };
  VIDEO_MATCH_CACHE.set(cacheKey, { timestamp: Date.now(), data: notFound });
  return notFound;
}

module.exports = {
  findBestMusicVideo,
  verifyMusicVideoMatch,
};
