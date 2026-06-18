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

async function ytdlpGetAudioUrl(videoId) {
  const cached = YTDLP_CACHE.get(videoId);
  if (cached && cached.expires > Date.now()) return cached;

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Use yt-dlp via python to get the direct CDN audio URL
  const { stdout } = await execFileAsync("python", [
    "-m", "yt_dlp",
    "--get-url", "--get-filename",
    "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "--no-playlist",
    "-o", "%(ext)s",
    ytUrl,
  ], { timeout: 25000, maxBuffer: 1024 * 1024 });

  const lines = stdout.trim().split("\n").map(l => l.trim()).filter(Boolean);
  // Lines: [url, ext]  or just [url]
  const audioUrl = lines.find(l => l.startsWith("http")) || "";
  const ext      = lines.find(l => !l.startsWith("http")) || "m4a";

  if (!audioUrl) throw new Error("yt-dlp returned no URL");

  const contentType = ext === "webm" ? "audio/webm" : "audio/mp4";
  const entry = { url: audioUrl, contentType, expires: Date.now() + 4 * 60 * 60 * 1000 };
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

function normItunesTrack(item, language) {
  const art = item.artworkUrl100?.replace("100x100bb", "600x600bb") || "";
  const id  = `itunes-${item.trackId || hashStr(item.trackName || "")}`;
  return {
    id,
    title:          item.trackName || "Untitled",
    artist:         item.artistName || "Unknown",
    album:          item.collectionName || "iTunes",
    duration:       Math.round((item.trackTimeMillis || 180000) / 1000),
    genre:          item.primaryGenreName || "Music",
    language,
    isFull:         false,   // starts as preview; resolved to full on play
    ytResolved:     false,
    sourceType:     "itunes",
    previewUrl:     item.previewUrl || "",
    artworkUrl:     art,
    lyrics:         ["Tap to play full track via YouTube"],
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
  const batches = await Promise.allSettled(picked.map(s => fetchItunes(s, language, Math.ceil(limit / picked.length) + 5)));
  const seen = new Set();
  const out  = [];
  for (const b of batches) {
    if (b.status !== "fulfilled") continue;
    for (const t of b.value) { if (!seen.has(t.id)) { seen.add(t.id); out.push(t); } }
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

  // Get the direct CDN audio URL from yt-dlp (cached for 4h)
  const { url: audioUrl, contentType } = await ytdlpGetAudioUrl(id);

  // Proxy the audio to the browser, forwarding any Range header
  const range    = req.headers.range;
  const headers  = { "User-Agent": "Mozilla/5.0" };
  if (range) headers["Range"] = range;

  const upstream = await fetch(audioUrl, { headers });

  const ct = upstream.headers.get("content-type") || contentType || "audio/mp4";
  const cl = upstream.headers.get("content-length");
  const cr = upstream.headers.get("content-range");

  res.status(upstream.status || 200);
  res.set({
    "Content-Type":               ct,
    "Accept-Ranges":              "bytes",
    "Access-Control-Allow-Origin":"*",
    "Cache-Control":              "no-store",
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
    const base = SEEDS[rawLang] || SEEDS.all;
    seeds = [...base.slice(page % base.length), ...base.slice(0, page % base.length)];
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

  const seen   = new Set();
  const dedup  = arr => arr.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  const tracks = [...dedup(itunesTracks), ...dedup(audiusTracks)].slice(0, limit * 2);

  res.json({ language: rawLang, mood, page, tracks });
}));

// ── Bootstrap ──────────────────────────────────────────────────────────
app.get("/api/bootstrap", wrap(async (req, res) => {
  const [user, tracks, playlists] = await Promise.all([getUser(), Track.find({}).lean(), Playlist.find({}).lean()]);
  res.json({ tracks, playlists, library: user.library, preferences: user.preferences, history: user.history, favorites: user.favorites });
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

app.patch("/api/preferences", wrap(async (req, res) => {
  const user = await getUser();
  Object.assign(user.preferences, req.body);
  user.markModified("preferences");
  await user.save();
  res.json({ preferences: user.preferences });
}));

app.post("/api/history", wrap(async (req, res) => {
  const user = await getUser();
  user.history.push({ ...req.body, at: Date.now() });
  if (user.history.length > 100) user.history.splice(0, user.history.length - 100);
  await user.save();
  res.status(201).json({ ok: true });
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

app.get("/api/health", wrap(async (_req, res) => {
  res.json({ ok: true, sources: ["YouTube (full tracks)", "iTunes (catalog)", "Audius (English)"] });
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
