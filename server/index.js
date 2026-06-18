require('dotenv').config();
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const Track    = require("./models/Track");
const Playlist = require("./models/Playlist");
const User     = require("./models/User");

const port     = process.env.PORT || 4173;
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/auralis";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ══════════════════════════════════════════════════════════════════════
//  yt-dlp helper  —  reliable YouTube audio extraction
// ══════════════════════════════════════════════════════════════════════
const YTDLP_CACHE = new Map(); // videoId → { url, contentType, contentLength, expires }

async function ytdlpGetAudioUrl(videoId, { bust = false } = {}) {
  if (!bust) {
    const cached = YTDLP_CACHE.get(videoId);
    if (cached && cached.expires > Date.now()) return cached;
  }
  // Remove stale/expired entry before re-resolving
  YTDLP_CACHE.delete(videoId);

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const { stdout } = await execFileAsync("python", [
    "-m", "yt_dlp",
    "--get-url", "--get-filename",
    "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "--no-playlist",
    "-o", "%(ext)s",
    ytUrl,
  ], { timeout: 25000, maxBuffer: 1024 * 1024 });

  const lines = stdout.trim().split("\n").map(l => l.trim()).filter(Boolean);
  const audioUrl = lines.find(l => l.startsWith("http")) || "";
  const ext      = lines.find(l => !l.startsWith("http")) || "m4a";

  if (!audioUrl) throw new Error("yt-dlp returned no URL");

  const contentType = ext === "webm" ? "audio/webm" : "audio/mp4";
  // Cache for 3.5h (CDN URLs typically valid ~6h; be conservative)
  const entry = { url: audioUrl, contentType, expires: Date.now() + 3.5 * 60 * 60 * 1000 };
  YTDLP_CACHE.set(videoId, entry);
  if (YTDLP_CACHE.size > 200) YTDLP_CACHE.delete(YTDLP_CACHE.keys().next().value);
  return entry;
}


// ══════════════════════════════════════════════════════════════════════
//  YouTube  —  Full-length songs for ALL languages
//  Flow: iTunes catalog → YouTube audio stream (full track)
// ══════════════════════════════════════════════════════════════════════

const YT_SEARCH_CACHE = new Map(); // query → videoId

// Search YouTube by scraping (no API key needed)
async function searchYouTube(title, artist) {
  const query    = `${title} ${artist} official audio`;
  const cacheKey = query.toLowerCase();
  if (YT_SEARCH_CACHE.has(cacheKey)) return YT_SEARCH_CACHE.get(cacheKey);

  const url  = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept-Language":  "en-IN,en;q=0.9,ml;q=0.8",
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!resp.ok) throw new Error(`YouTube search ${resp.status}`);
  const html = await resp.text();

  // Extract unique video IDs from the HTML payload
  const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)]
    .map(m => m[1])
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, 3);

  const videoId = ids[0] || null;
  if (videoId) {
    YT_SEARCH_CACHE.set(cacheKey, videoId);
    if (YT_SEARCH_CACHE.size > 300) YT_SEARCH_CACHE.delete(YT_SEARCH_CACHE.keys().next().value);
  }
  return videoId;
}


// ══════════════════════════════════════════════════════════════════════
//  iTunes Search  —  Catalog: metadata, artwork, genre
// ══════════════════════════════════════════════════════════════════════
const ITUNES_URL  = "https://itunes.apple.com/search";
const ITUNES_CACHE = new Map();

const SEEDS = {
  malayalam: [
    "Jakes Bejoy", "Sid Sriram Malayalam", "Vineeth Sreenivasan",
    "Sithara Krishnakumar", "Vidyasagar Malayalam", "M G Sreekumar",
    "Minnalvala Narivetta", "Parayuvaan Ishq", "Aaromale 96",
    "Premam songs", "Bangalore Days", "Jimikki Kammal",
    "Manikya Malaraya Poovi", "Njandukalude Nattil Oridavela",
    "Manjummel Boys song", "Bramayugam song", "Turbo Malayalam",
    "Aadujeevitham songs", "Bheeshma Parvam", "Lucifer Malayalam",
    "Thaikkudam Bridge", "Gowri Lekha song", "Poomaram song",
    "Oru Adaar Love", "Oppam song", "Drishyam songs", "Malik song",
  ],
  tamil: [
    "AR Rahman Tamil", "Anirudh Ravichander", "Sid Sriram Tamil",
    "Yuvan Shankar Raja", "Harris Jayaraj", "Ilaiyaraaja",
    "Rowdy Baby", "Kannaana Kanney", "Master BGM Vijay",
    "96 movie songs", "Minnale songs Tamil", "Vikram 2022 Tamil",
    "Beast Tamil song", "Jailer Tamil", "Leo Tamil 2023",
    "The Greatest of All Time Tamil", "Amaran songs 2024",
    "Vettaiyan song", "Annaatthe songs", "Mersal songs",
    "Bigil songs", "Kaithi songs Tamil", "Soorarai Pottru",
    "Dhanush singer Tamil", "Anirudh new songs 2024",
  ],
  hindi: [
    "Arijit Singh 2024", "Atif Aslam", "Shreya Ghoshal",
    "Jubin Nautiyal", "Armaan Malik", "Neha Kakkar",
    "Animal movie songs", "Stree 2 songs", "Dunki songs",
    "Jawan songs", "Pathaan songs", "Rocky Aur Rani",
    "Tu Jhoothi Main Makkaar", "Brahmastra songs",
    "Lut Gaye song", "Kesariya song", "Tum Kya Mile songs",
  ],
  english: [
    "Ed Sheeran 2024", "Taylor Swift", "The Weeknd",
    "Harry Styles", "Olivia Rodrigo", "Billie Eilish",
    "Coldplay 2024", "Imagine Dragons", "Post Malone",
    "Justin Bieber", "Ariana Grande", "Dua Lipa",
    "Sam Smith", "Adele", "Bruno Mars 2024",
  ],
  all: [
    "Minnalvala", "Parayuvaan", "Rowdy Baby", "Anirudh",
    "Jakes Bejoy", "AR Rahman", "Arijit Singh",
    "Ed Sheeran", "Sid Sriram", "Malayalam hits 2024",
    "Tamil hits 2024", "Bollywood hits 2024",
  ],
};

const MOOD_SEEDS = {
  romantic:   { ml:"Malayalam love songs", ta:"Tamil love songs", hi:"Romantic Hindi", en:"English love songs" },
  party:      { ml:"Malayalam dance songs", ta:"Tamil party songs", hi:"Bollywood party", en:"English party hits" },
  melody:     { ml:"Malayalam melody", ta:"Tamil melody", hi:"Hindi melody songs", en:"English acoustic" },
  sad:        { ml:"Malayalam sad songs", ta:"Tamil sad songs", hi:"Sad Hindi songs", en:"Sad English songs" },
  folk:       { ml:"Kerala folk songs", ta:"Tamil folk songs", hi:"Rajasthani folk", en:"Country folk music" },
  devotional: { ml:"Malayalam devotional", ta:"Tamil devotional", hi:"Hindi bhajan", en:"Christian songs" },
};

function hashStr(v) { return [...String(v)].reduce((s, c) => s + c.charCodeAt(0), 0); }

/** Strip parenthetical movie-name suffixes → canonical title for dedup */
function canonicalTitle(title) {
  return String(title || "")
    .replace(/\s*\(.*?\)\s*/g, "")  // (From "Movie")
    .replace(/\s*\[.*?\]\s*/g, "")  // [OST]
    .replace(/\s*-\s*(title\s+track|reprise|redux).*$/i, "") // - Title Track
    .toLowerCase()
    .trim();
}

/** First credited artist, lower-cased */
function firstArtist(artistStr) {
  return String(artistStr || "")
    .split(/[,&]/)[0]
    .toLowerCase()
    .trim();
}

function normItunesTrack(item, language) {
  const art = item.artworkUrl100?.replace("100x100bb", "600x600bb") || "";
  const id  = `itunes-${item.trackId || hashStr(item.trackName || "")}`;
  const title  = item.trackName  || "Untitled";
  const artist = item.artistName || "Unknown";
  return {
    id,
    title,
    artist,
    album:          item.collectionName || "iTunes",
    duration:       Math.round((item.trackTimeMillis || 180000) / 1000),
    genre:          item.primaryGenreName || "Music",
    language,
    isFull:         false,
    ytResolved:     false,
    sourceType:     "itunes",
    previewUrl:     item.previewUrl || "",
    artworkUrl:     art,
    lyrics:         ["Tap to play full track via YouTube"],
    // Canonical key for cross-seed deduplication
    _dedupKey:      `${canonicalTitle(title)}|${firstArtist(artist)}`,
  };
}

async function fetchItunes(term, language, limit = 25) {
  const cacheKey = `it:${term}`;
  if (ITUNES_CACHE.has(cacheKey)) return ITUNES_CACHE.get(cacheKey);
  const params = new URLSearchParams({ term, country: "IN", media: "music", entity: "song", limit: String(Math.min(limit, 25)) });
  const resp   = await fetch(`${ITUNES_URL}?${params}`);
  if (!resp.ok) return [];
  const json   = await resp.json();
  const tracks = (json.results || [])
    .filter(i => (i.kind === "song" || i.wrapperType === "track") && i.previewUrl)
    .map(i => normItunesTrack(i, language));
  ITUNES_CACHE.set(cacheKey, tracks);
  if (ITUNES_CACHE.size > 300) ITUNES_CACHE.delete(ITUNES_CACHE.keys().next().value);
  return tracks;
}

async function fetchItunesMultiSeed(seeds, language, limit) {
  const picked = seeds.slice(0, 4);
  const batches = await Promise.allSettled(
    picked.map(s => fetchItunes(s, language, Math.ceil(limit / picked.length) + 5))
  );
  const seenId   = new Set();
  const seenKey  = new Set(); // canonical title|firstArtist
  const out = [];
  for (const b of batches) {
    if (b.status !== "fulfilled") continue;
    for (const t of b.value) {
      const key = t._dedupKey ||
        `${canonicalTitle(t.title)}|${firstArtist(t.artist)}`;
      if (seenId.has(t.id) || seenKey.has(key)) continue;
      seenId.add(t.id);
      seenKey.add(key);
      out.push(t);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
//  Audius  —  Full English/Electronic songs
// ══════════════════════════════════════════════════════════════════════
const AUDIUS_HOST   = "https://discoveryprovider.audius.co/v1";
const APP_NAME      = "AuralisPlayer";
const AUDIUS_CACHE  = new Map();
const AUDIUS_GENRES = ["Electronic", "Hip-Hop/Rap", "Pop", "R&B/Soul", "Rock", "Acoustic"];

function normAudiusTrack(item) {
  const art       = item.artwork?.["480x480"] || item.artwork?.["150x150"] || "";
  const rawStream = item.stream?.url || "";
  return {
    id:          `audius-${item.id}`,
    title:       item.title || "Untitled",
    artist:      item.user?.name || "Unknown",
    album:       "Audius",
    duration:    parseInt(item.duration, 10) || 180,
    genre:       item.genre || "Music",
    language:    "english",
    isFull:      true,
    sourceType:  "audius",
    previewUrl:  rawStream ? `/api/stream?url=${encodeURIComponent(rawStream)}` : "",
    artworkUrl:  art,
    year:        item.release_date?.split("-")[0] || "",
    lyrics:      [`Full track · ${item.genre}`, `${item.user?.name}`, "via Audius"],
  };
}

async function fetchAudiusTrending(genre, limit, offset) {
  const key = `au:${genre}:${limit}:${offset}`;
  if (AUDIUS_CACHE.has(key)) return AUDIUS_CACHE.get(key);
  const g    = genre && genre !== "all" ? `&genre=${encodeURIComponent(genre)}` : "";
  const resp = await fetch(`${AUDIUS_HOST}/tracks/trending?limit=${limit}&offset=${offset}${g}&app_name=${APP_NAME}`, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Audius ${resp.status}`);
  const json   = await resp.json();
  const tracks = (json.data || []).filter(t => t.stream?.url && t.access?.stream !== false).map(normAudiusTrack);
  AUDIUS_CACHE.set(key, tracks);
  if (AUDIUS_CACHE.size > 60) AUDIUS_CACHE.delete(AUDIUS_CACHE.keys().next().value);
  return tracks;
}

// ══════════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════════
async function getUser() {
  let u = await User.findOne({ username: "defaultUser" });
  if (!u) u = await new User({ username: "defaultUser" }).save();
  return u;
}
function wrap(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next); }
    catch (e) { console.error("[API]", e.message); res.status(500).json({ error: e.message }); }
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Routes
// ══════════════════════════════════════════════════════════════════════

// ── YouTube: resolve title+artist → full audio stream URL ─────────────
app.get("/api/youtube/resolve", wrap(async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: "title required" });

  const videoId = await searchYouTube(title, artist || "");
  if (!videoId) return res.status(404).json({ error: "No YouTube result found" });

  res.json({ videoId, streamUrl: `/api/youtube/stream?id=${videoId}` });
}));

// ── YouTube: stream full audio via yt-dlp (reliable, always works) ──
app.get("/api/youtube/stream", wrap(async (req, res) => {
  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: "Invalid videoId" });
  }

  // First attempt — use cached URL (or resolve fresh)
  let entry = await ytdlpGetAudioUrl(id);

  const tryStream = async (audioUrl, contentType, isRetry = false) => {
    const range   = req.headers.range;
    const headers = { "User-Agent": "Mozilla/5.0" };
    if (range) headers["Range"] = range;

    const upstream = await fetch(audioUrl, { headers });

    // CDN URL expired — re-resolve once
    if (upstream.status === 403 && !isRetry) {
      console.warn(`[YT stream] 403 on cached URL for ${id}, re-resolving…`);
      const fresh = await ytdlpGetAudioUrl(id, { bust: true });
      return tryStream(fresh.url, fresh.contentType, true);
    }

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
      return;
    }

    const ct = upstream.headers.get("content-type") || contentType || "audio/mp4";
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");

    res.status(upstream.status || 200);
    res.set({
      "Content-Type":                ct,
      "Accept-Ranges":               "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":               "no-store",
      ...(cl ? { "Content-Length": cl } : {}),
      ...(cr ? { "Content-Range":  cr } : {}),
    });

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const ok = res.write(value);
        if (!ok) await new Promise(r => res.once("drain", r));
      }
      res.end();
    };
    pump().catch(() => { try { res.end(); } catch (_) {} });
  };

  await tryStream(entry.url, entry.contentType);
}));



// ── Artwork proxy ──────────────────────────────────────────────────────
app.get("/api/artwork", wrap(async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: "url required" });
  const parsed = new URL(rawUrl);
  const allowed = [
    "mzstatic.com", "apple.com", "itunes.apple.com",
    "audius.co", "theblueprint.xyz", "staked.cloud",
    "decentralizeaudio.xyz", "open-audio-validator.com", "audiusindex.org",
  ];
  const ok = ["http:", "https:"].includes(parsed.protocol)
    && allowed.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  if (!ok) return res.status(403).json({ error: "Host not allowed" });
  const upstream = await fetch(parsed.toString());
  const ct = upstream.headers.get("content-type") || "image/jpeg";
  if (!upstream.ok || !ct.startsWith("image/")) return res.status(502).json({ error: "Bad upstream" });
  res.set({ "Content-Type": ct, "Cache-Control": "public, max-age=86400" });
  res.send(Buffer.from(await upstream.arrayBuffer()));
}));

// ── Audius stream proxy ────────────────────────────────────────────────
app.get("/api/stream", wrap(async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: "url required" });
  const parsed  = new URL(rawUrl);
  const allowed = ["open-audio-validator.com", "audius.co", "staked.cloud", "theblueprint.xyz", "decentralizeaudio.xyz", "audiusindex.org"];
  const ok = ["http:", "https:"].includes(parsed.protocol)
    && allowed.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  if (!ok) return res.status(403).json({ error: "Not allowed" });
  const upstream = await fetch(parsed.toString(), { headers: { Range: req.headers.range || "bytes=0-" } });
  const ct = upstream.headers.get("content-type") || "audio/mpeg";
  const cl = upstream.headers.get("content-length");
  const cr = upstream.headers.get("content-range");
  res.status(upstream.status);
  res.set({ "Content-Type": ct, "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", ...(cl ? { "Content-Length": cl } : {}), ...(cr ? { "Content-Range": cr } : {}) });
  const reader = upstream.body.getReader();
  const pump = async () => { while (true) { const { done, value } = await reader.read(); if (done) break; const ok2 = res.write(value); if (!ok2) await new Promise(r => res.once("drain", r)); } res.end(); };
  pump().catch(() => { try { res.end(); } catch (_) {} });
}));

// ── Main Search ────────────────────────────────────────────────────────
app.get("/api/external/search", wrap(async (req, res) => {
  const term    = String(req.query.term || "").trim();
  const rawLang = req.query.language || "malayalam";
  const mood    = req.query.mood || "";
  const page    = Math.max(0, Number(req.query.page) || 0);
  const limit   = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  let seeds;
  if (mood && MOOD_SEEDS[mood]) {
    const ms = MOOD_SEEDS[mood];
    const k  = { malayalam:"ml", tamil:"ta", hindi:"hi", english:"en", all:"ml" }[rawLang] || "ml";
    seeds    = [ms[k], ms[k] + " 2024", ms.hi];
  } else {
    const base     = SEEDS[rawLang] || SEEDS.all;
    // Pick NON-OVERLAPPING 4-seed chunks per page (no rotation overlap)
    const chunkSize = 4;
    const startIdx  = (page * chunkSize) % base.length;
    seeds = [
      base[(startIdx + 0) % base.length],
      base[(startIdx + 1) % base.length],
      base[(startIdx + 2) % base.length],
      base[(startIdx + 3) % base.length],
    ];
  }

  const itunesTracks = term
    ? await fetchItunes(term, rawLang, limit * 2)
    : await fetchItunesMultiSeed(seeds, rawLang, limit * 2);

  let audiusTracks = [];
  if (rawLang === "english" || rawLang === "all") {
    try {
      const genreIdx = page % AUDIUS_GENRES.length;
      audiusTracks   = await fetchAudiusTrending(AUDIUS_GENRES[genreIdx], Math.ceil(limit / 2), page * 10);
    } catch (e) { console.warn("[Audius]", e.message); }
  }

  const seenId  = new Set();
  const seenKey = new Set();
  const dedup = (arr) => arr.filter(t => {
    const key = t._dedupKey ||
      `${canonicalTitle(t.title)}|${firstArtist(t.artist)}`;
    if (seenId.has(t.id) || seenKey.has(key)) return false;
    seenId.add(t.id);
    seenKey.add(key);
    return true;
  });
  // Strip internal _dedupKey before sending to client
  const tracks = [...dedup(itunesTracks), ...dedup(audiusTracks)]
    .slice(0, limit * 2)
    .map(({ _dedupKey, ...t }) => t);

  res.json({ language: rawLang, mood, page, tracks });
}));

// ── Bootstrap ───────────────────────────────────────────────
app.get("/api/bootstrap", wrap(async (req, res) => {
  const [user, tracks] = await Promise.all([
    getUser(),
    Track.find({}).lean(),
  ]);
  // Sort history newest-first, cap at 50 for the client
  const history = [...(user.history || [])]
    .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
    .slice(0, 50);
  res.json({
    tracks,
    library:     user.library,
    preferences: user.preferences,
    history,
    favorites:   user.favorites,
  });
}));

app.get("/api/tracks", wrap(async (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const filter = {};
  if (q) filter.$or = [{ title: { $regex: q, $options: "i" } }, { artist: { $regex: q, $options: "i" } }];
  res.json({ tracks: await Track.find(filter).limit(200).lean() });
}));

app.post("/api/tracks", wrap(async (req, res) => {
  const data  = { ...req.body, id: req.body.id || `api-${Date.now()}` };
  const track = await Track.findOneAndUpdate({ id: data.id }, data, { upsert: true, new: true });
  res.status(201).json({ track });
}));

// PATCH /api/preferences — merge partial updates (volume, language, shuffle, repeat, theme…)
app.patch("/api/preferences", wrap(async (req, res) => {
  const user = await getUser();
  // Merge only known/safe keys
  const allowed = [
    "theme", "accent", "glass", "crossfade", "quality", "suggestions",
    "autoplay", "gapless", "normalize", "private", "reducedMotion",
    "compact", "volume", "language", "shuffle", "repeat",
  ];
  for (const k of allowed) {
    if (req.body[k] !== undefined) user.preferences[k] = req.body[k];
  }
  user.markModified("preferences");
  await user.save();
  res.json({ preferences: user.preferences });
}));

// POST /api/history — save a full track snapshot (fire-and-forget from client)
app.post("/api/history", wrap(async (req, res) => {
  const { id, title, artist, album, artworkUrl, duration,
          genre, language, sourceType } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });

  const user = await getUser();

  // Deduplicate: remove previous entry for this track so newest is always on top
  user.history = (user.history || []).filter(h => h.id !== id);

  // Prepend new entry
  user.history.unshift({
    id, title, artist, album, artworkUrl,
    duration, genre, language, sourceType,
    playedAt: new Date(),
  });

  // Keep last 100 entries
  if (user.history.length > 100) user.history = user.history.slice(0, 100);

  user.markModified("history");
  await user.save();
  res.status(201).json({ ok: true });
}));

// GET /api/history — return last N played tracks
app.get("/api/history", wrap(async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const user  = await getUser();
  const history = (user.history || []).slice(0, limit);
  res.json({ history });
}));

app.put("/api/favorites/:id", wrap(async (req, res) => {
  const user = await getUser();
  if (!user.favorites.includes(req.params.id)) user.favorites.push(req.params.id);
  if (!user.library.savedTrackIds.includes(req.params.id)) user.library.savedTrackIds.push(req.params.id);
  user.markModified("library");
  await user.save();
  res.json({ favorites: user.favorites });
}));

app.delete("/api/favorites/:id", wrap(async (req, res) => {
  const user = await getUser();
  user.favorites             = user.favorites.filter(f => f !== req.params.id);
  user.library.savedTrackIds = user.library.savedTrackIds.filter(f => f !== req.params.id);
  user.markModified("library");
  await user.save();
  res.json({ favorites: user.favorites });
}));

app.post("/api/library/tracks", wrap(async (req, res) => {
  const trackData = req.body.track || req.body;
  if (!trackData?.id) return res.status(400).json({ error: "id required" });
  await Track.findOneAndUpdate({ id: trackData.id }, trackData, { upsert: true });
  const user = await getUser();
  const add  = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  add(user.favorites, trackData.id);
  add(user.library.savedTrackIds, trackData.id);
  add(user.library.externalTrackIds, trackData.id);
  user.library.recentlyAdded.unshift({ id: trackData.id, at: Date.now() });
  if (user.library.recentlyAdded.length > 40) user.library.recentlyAdded.length = 40;
  user.markModified("library");
  await user.save();
  res.status(201).json({ track: trackData, favorites: user.favorites });
}));

// ── Excluded (taste profile) ─────────────────────────────────────────────
app.post("/api/excluded", wrap(async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  const user = await getUser();
  if (!user.library.excludedTrackIds) user.library.excludedTrackIds = [];
  if (!user.library.excludedTrackIds.includes(id)) {
    user.library.excludedTrackIds.push(id);
    user.markModified("library");
    await user.save();
  }
  res.json({ excluded: user.library.excludedTrackIds });
}));

app.delete("/api/excluded/:id", wrap(async (req, res) => {
  const user = await getUser();
  user.library.excludedTrackIds = (user.library.excludedTrackIds || [])
    .filter(x => x !== req.params.id);
  user.markModified("library");
  await user.save();
  res.json({ excluded: user.library.excludedTrackIds });
}));

app.get("/api/health", wrap(async (_req, res) => {
  res.json({ ok: true, sources: ["YouTube (full tracks)", "iTunes (catalog)", "Audius (English)"] });
}));

// ── Playlists ────────────────────────────────────────────────────────────

/** Serialize a playlist doc to a plain object with count */
function playlistJSON(pl) {
  const obj = pl.toObject ? pl.toObject() : { ...pl };
  const tracks = Array.isArray(obj.tracks) ? obj.tracks : [];
  obj.tracks = tracks.filter(t => t && typeof t === "object" && t.id);
  obj.count  = obj.tracks.length;
  return obj;
}

/** GET /api/playlists — list all playlists */
app.get("/api/playlists", wrap(async (_req, res) => {
  const docs = await Playlist.find({}).sort({ updatedAt: -1 });
  res.json({ playlists: docs.map(playlistJSON) });
}));

/** POST /api/playlists — create a new playlist */
app.post("/api/playlists", wrap(async (req, res) => {
  const { name, description = "", color = "#1db954" } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  const id = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const playlist = new Playlist({ id, name: name.trim(), description, color, tracks: [] });
  await playlist.save();
  res.status(201).json({ playlist: playlistJSON(playlist) });
}));

/** GET /api/playlists/:id — get a single playlist with all tracks */
app.get("/api/playlists/:id", wrap(async (req, res) => {
  const playlist = await Playlist.findOne({ id: req.params.id });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  res.json({ playlist: playlistJSON(playlist) });
}));

/** PATCH /api/playlists/:id — rename / update a playlist */
app.patch("/api/playlists/:id", wrap(async (req, res) => {
  const { name, description, color } = req.body;
  const update = { updatedAt: new Date() };
  if (name)                      update.name        = name.trim();
  if (description !== undefined) update.description = description;
  if (color)                     update.color       = color;
  const playlist = await Playlist.findOneAndUpdate(
    { id: req.params.id }, { $set: update }, { new: true }
  );
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  res.json({ playlist: playlistJSON(playlist) });
}));

/** DELETE /api/playlists/:id — delete a playlist */
app.delete("/api/playlists/:id", wrap(async (req, res) => {
  await Playlist.deleteOne({ id: req.params.id });
  res.json({ ok: true });
}));

/** POST /api/playlists/:id/tracks — add a track to a playlist */
app.post("/api/playlists/:id/tracks", wrap(async (req, res) => {
  const track = req.body.track;
  if (!track?.id) return res.status(400).json({ error: "track.id required" });
  const playlist = await Playlist.findOne({ id: req.params.id });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (!Array.isArray(playlist.tracks)) playlist.tracks = [];
  const alreadyIn = playlist.tracks.some(t => t && t.id === track.id);
  if (!alreadyIn) {
    playlist.tracks.push(track);
    if (!playlist.coverUrl && track.artworkUrl) playlist.coverUrl = track.artworkUrl;
    playlist.markModified("tracks");
    await playlist.save();
  }
  res.json({ playlist: playlistJSON(playlist), added: !alreadyIn });
}));

/** DELETE /api/playlists/:id/tracks/:trackId — remove a track from a playlist */
app.delete("/api/playlists/:id/tracks/:trackId", wrap(async (req, res) => {
  const playlist = await Playlist.findOne({ id: req.params.id });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  playlist.tracks = (Array.isArray(playlist.tracks) ? playlist.tracks : [])
    .filter(t => t && t.id !== req.params.trackId);
  playlist.markModified("tracks");
  await playlist.save();
  res.json({ playlist: playlistJSON(playlist) });
}));

app.use("/api/{*path}", (_req, res) => res.status(404).json({ error: "Not found" }));

// ══════════════════════════════════════════════════════════════════════
//  Start
// ══════════════════════════════════════════════════════════════════════
mongoose.connect(mongoURI)
  .then(() => {
    console.log("✓ MongoDB connected");
    app.listen(port, () => {
      console.log(`✓ Auralis API at http://localhost:${port}`);
      console.log("  🎵 YouTube full tracks · iTunes catalog · Malayalam/Tamil/Hindi/English");
    });
  })
  .catch(e => { console.error("✗ MongoDB:", e.message); process.exit(1); });
