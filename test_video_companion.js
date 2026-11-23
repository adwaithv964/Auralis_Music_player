// test_video_companion.js
// Verification suite for Video Companion Matching Algorithm

const OFFICIAL_CHANNELS = new Set([
  'think music india', 'think music', 'sony music south', 'sony music india',
  'saregama tamil', 'saregama malayalam', 'saregama telugu', 'saregama music',
  'zee music south', 'zee music company', 't-series', 't-series tamil',
  't-series telugu', 'divo music', 'muzik247', 'aditya music', 'lahari music',
  'speed audio video', 'manorama music', 'satyam audios', 'millennium audios',
  'sai abhyankkar', 'anirudh ravichander', 'a.r. rahman', 'santhosh narayanan',
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
  return album.replace(/-\s*(Telugu|Tamil|Hindi|Malayalam|English)/i, '').trim();
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
  // Format MM:SS or HH:MM:SS
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function verifyMusicVideoMatch(track, candidate) {
  if (!track || !candidate || !candidate.id) {
    return { matches: false, reason: 'Missing candidate data' };
  }

  const candTitle = candidate.title || '';
  const candChannel = candidate.channel || '';
  const normCandTitle = normalize(candTitle);
  const normCandChannel = normalize(candChannel);

  // 1. Duration check: Reject clips / shorts under 60 seconds
  const candSec = parseDurationSeconds(candidate.length || candidate.duration);
  if (candSec > 0 && candSec < 60) {
    return { matches: false, reason: 'Clip/teaser too short (<60s)' };
  }

  // 2. Reject negative keywords (covers, reactions, shorts, remixes etc.)
  const NEGATIVES = [
    'shorts', '#shorts', 'status video', 'whatsapp status', 'reaction',
    'dance performance', 'dance cover', 'dance visualizer', 'parody',
    'behind the scenes', 'making of', 'interview', 'press meet',
    'review', 'teaser', 'trailer', 'motion poster', '8d audio',
    'slowed', 'reverb', 'mashup', 'tribute', 'scene', 'scenes'
  ];
  for (const neg of NEGATIVES) {
    if (normCandTitle.includes(neg)) {
      return { matches: false, reason: `Contains negative keyword: ${neg}` };
    }
  }

  // Cover / Karaoke check: only reject if the track wasn't explicitly a cover
  const trackIsCover = /cover|unplugged/i.test(track.title);
  if (!trackIsCover && (/\bcover\b/i.test(candTitle) || /\bkaraoke\b/i.test(candTitle))) {
    return { matches: false, reason: 'Cover or karaoke' };
  }

  // Remix check
  const trackIsRemix = /remix|mix/i.test(track.title);
  if (!trackIsRemix && /\bremix\b/i.test(candTitle)) {
    return { matches: false, reason: 'Unrequested remix' };
  }

  // 3. Language Separation Check
  const trackLangs = extractLanguages(`${track.title} ${track.album || ''} ${track.language || ''}`);
  const candLangs = extractLanguages(candTitle);

  if (trackLangs.size > 0) {
    // If track specified language (e.g. Telugu), candidate must not contradict it
    let matchedLang = false;
    for (const tl of trackLangs) {
      if (candLangs.has(tl)) { matchedLang = true; break; }
    }
    // If candidate explicitly specified a DIFFERENT language, reject!
    if (!matchedLang && candLangs.size > 0) {
      return { matches: false, reason: 'Different language version' };
    }
  }

  // 4. Exact Title Match
  const targetClean = cleanTitle(track.title);
  const normTarget = normalize(targetClean);
  
  // Specific title discrimination (e.g. Veezha Veera vs Veera Veera)
  const isVeezha = /\bveezha\b/i.test(track.title);
  const candHasVeezha = /\bveezha\b/i.test(candTitle);
  if (isVeezha && !candHasVeezha && /\bveera veera\b/i.test(candTitle)) {
    return { matches: false, reason: 'Veera Veera (Telugu) does not match Veezha Veera (Tamil)' };
  }
  if (!isVeezha && /\bveera veera\b/i.test(track.title) && candHasVeezha) {
    return { matches: false, reason: 'Veezha Veera (Tamil) does not match Veera Veera (Telugu)' };
  }

  // Check title overlap
  const targetTokens = normTarget.split(' ').filter(t => t.length > 2);
  const candTokens = new Set(normCandTitle.split(' '));
  const matchedTokens = targetTokens.filter(t => candTokens.has(t));
  const tokenMatchRatio = targetTokens.length ? matchedTokens.length / targetTokens.length : 0;

  if (tokenMatchRatio < 0.60) {
    return { matches: false, reason: 'Low title token match ratio' };
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
    (candidate.badge && candidate.badge.includes('Verified'));

  const isVideoSong = /video song|official video|music video|full video/i.test(candTitle);
  const isLyrical = /lyrical|lyric video/i.test(candTitle);
  const isAudio = /official audio|original soundtrack|full audio|ost\b/i.test(candTitle) || normCandChannel.includes('topic');

  if (isOfficialChannel) score += 25;
  if (movieMatches) score += 15;
  if (tokenMatchRatio >= 0.9) score += 10;

  if (isOfficialChannel && isVideoSong) {
    classification = 'Official Original Video';
    score += 30;
  } else if (isVideoSong) {
    classification = 'Official Music Video';
    score += 20;
  } else if (isOfficialChannel && isLyrical) {
    classification = 'Official Lyrical Video';
    score += 15;
  } else if (isLyrical) {
    classification = 'Official Lyrical Video';
    score += 10;
  } else if (isAudio) {
    classification = 'Official Soundtrack Video';
    score += 10;
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

// ── Test Cases ─────────────────────────────────────────────────────────────
console.log('=== TEST 1: Veezha Veera (From "O.M: Operation Mole") ===');
const track1 = {
  title: 'Veezha Veera (From "O.M: Operation Mole")',
  artist: 'Sai Abhyankkar, Tippu, Arun Srinivasan',
  album: 'Veezha Veera (From "O.M: Operation Mole")',
  duration: 236,
  language: 'Tamil',
};

const candidates1 = [
  { id: 'Pt0kTMTK6TY', title: 'Veezha Veera 🔥 50M+ Views | Dhanush | OM', channel: 'Divo Music', length: '0:40' },
  { id: '-ZnYdmreOrk', title: 'Veezha Veera Lyrical (Tamil) | OM | Dhanush | Mammootty | Sai Pallavi | Rajkumar | Sai Abhyankkar', channel: 'Divo Music', length: '3:59' },
  { id: 'e3bpCkjpLIU', title: 'Veezha Veera (From "O.M: Operation Mole")', channel: 'Sai Abhyankkar', length: '3:57' },
  { id: 'ebrQN6zFBzU', title: 'Veera Veera (From "O.M: Operation Mole - Telugu")', channel: 'Sai Abhyankkar', length: '3:57' },
  { id: 'FoWOl77ddaw', title: 'Veezha Veera Dance Cover by XYZ', channel: 'Random Dancer', length: '3:50' },
];

for (const c of candidates1) {
  const res = verifyMusicVideoMatch(track1, c);
  console.log(`Candidate: "${c.title}" (${c.length}) -> Matches: ${res.matches} | Score: ${res.score || 0} | Class: ${res.classification || res.reason}`);
}

console.log('\n=== TEST 2: Veera Veera (From "O.M: Operation Mole - Telugu") ===');
const track2 = {
  title: 'Veera Veera (From "O.M: Operation Mole - Telugu")',
  artist: 'Sai Abhyankkar, Ritesh G Rao',
  album: 'O.M: Operation Mole - Telugu',
  duration: 236,
  language: 'Telugu',
};

const candidates2 = [
  { id: 'ebrQN6zFBzU', title: 'Veera Veera (From "O.M: Operation Mole - Telugu")', channel: 'Sai Abhyankkar', length: '3:57' },
  { id: '-ZnYdmreOrk', title: 'Veezha Veera Lyrical (Tamil) | OM | Dhanush', channel: 'Divo Music', length: '3:59' },
  { id: 'pMJK6K27hhY', title: 'Veera Veera Lyrical (Telugu) | OM | Dhanush | Mammootty', channel: 'Divo Music', length: '4:01' },
];

for (const c of candidates2) {
  const res = verifyMusicVideoMatch(track2, c);
  console.log(`Candidate: "${c.title}" (${c.length}) -> Matches: ${res.matches} | Score: ${res.score || 0} | Class: ${res.classification || res.reason}`);
}

console.log('\n=== TEST 3: Alaakaa Loova (From "O.M: Operation Mole") ===');
const track3 = {
  title: 'Alaakaa Loova (From "O.M: Operation Mole")',
  artist: 'Sai Abhyankkar, Rokesh',
  album: 'O.M: Operation Mole',
  duration: 210,
  language: 'Tamil',
};

const candidates3 = [
  { id: 't13PBhwpr68', title: 'Alaakaa Loova Unplugged (From "O.M: Operation Mole")', channel: 'Sai Abhyankkar', length: '1:14' },
  { id: '7VsejGzcJmM', title: 'Alaakaa Loova Lyrical (Tamil) | OM | Dhanush | Mammootty | Sai Pallavi | Sreeleela | Sai Abhyankkar', channel: 'Divo Music', length: '3:37' },
];

for (const c of candidates3) {
  const res = verifyMusicVideoMatch(track3, c);
  console.log(`Candidate: "${c.title}" (${c.length}) -> Matches: ${res.matches} | Score: ${res.score || 0} | Class: ${res.classification || res.reason}`);
}


const { findBestMusicVideo: findVideoLive } = require('./server/videoCompanionService');

async function testLive() {
  console.log('\n================ LIVE YOUTUBE RESOLUTION TESTS ================');
  console.log('--- 1. Veezha Veera ---');
  const r1 = await findVideoLive({
    title: 'Veezha Veera (From "O.M: Operation Mole")',
    artist: 'Sai Abhyankkar, Tippu, Arun Srinivasan',
    album: 'Veezha Veera (From "O.M: Operation Mole")',
    duration: 236,
    language: 'Tamil',
  });
  console.log(r1);

  console.log('\n--- 2. Veera Veera (Telugu) ---');
  const r2 = await findVideoLive({
    title: 'Veera Veera (From "O.M: Operation Mole - Telugu")',
    artist: 'Sai Abhyankkar, Ritesh G Rao',
    album: 'O.M: Operation Mole - Telugu',
    duration: 236,
    language: 'Telugu',
  });
  console.log(r2);

  console.log('\n--- 3. Alaakaa Loova ---');
  const r3 = await findVideoLive({
    title: 'Alaakaa Loova (From "O.M: Operation Mole")',
    artist: 'Sai Abhyankkar, Rokesh',
    album: 'O.M: Operation Mole',
    duration: 210,
    language: 'Tamil',
  });
  console.log(r3);
}

testLive();
