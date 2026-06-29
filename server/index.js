require('dotenv').config();

// "?"? Crash prevention: keep server alive on unhandled errors "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message, err.stack?.split("\n")[1] || "");
  // Don't exit ?" keep serving other requests
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("[unhandledRejection]", msg);
});

const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const os       = require("os");
const path     = require("path");
const fs       = require("fs").promises;
const ytdl     = require("@distube/ytdl-core");
let Innertube; // loaded lazily (ESM)

// Append common Python user-bin and virtualenv paths to system PATH for subprocesses
const homeDir = os.homedir();
const extraPaths = [
  path.join(homeDir, ".local", "bin"),
  path.join(process.cwd(), ".venv", "bin"),
  "/usr/local/bin",
  "/usr/bin"
];
process.env.PATH = `${process.env.PATH}${path.delimiter}${extraPaths.join(path.delimiter)}`;

const Track    = require('./models/Track');
const Playlist = require('./models/Playlist');
const User     = require('./models/User');
const { fetchTrending } = require('./trendingService');

const port     = process.env.PORT || 4173;
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/auralis";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// "?"? Global 55-second request timeout (prevents Vite 502 on slow resolvers) "?
app.use((req, res, next) => {
  res.setTimeout(55000, () => {
    if (!res.headersSent) res.status(504).json({ error: 'Request timed out' });
  });
  next();
});

// "?"? DB-ready flag (set after mongoose.connect succeeds) "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
let dbReady = false;

// Routes that need MongoDB ?" return 503 until connected
const DB_ROUTES = ['/api/bootstrap', '/api/playlists', '/api/tracks', '/api/history',
  '/api/favorites', '/api/library', '/api/preferences', '/api/excluded'];

app.use((req, res, next) => {
  if (!dbReady && DB_ROUTES.some(r => req.path.startsWith(r))) {
    return res.status(503).json({ error: 'Database not ready yet ?" please retry in a moment' });
  }
  next();
});

// ??????????????????????????????????????????????????????????????????????
//  YouTube audio extraction
//  Root issue: YouTube blocks cloud-server IPs (429/bot-detection).
//  Fix: route through Piped + Invidious ?" open-source YT proxy networks
//  whose IPs are NOT blocked by YouTube.
//  Priority: Piped +' Invidious +' youtubei.js +' ytdl-core +' yt-dlp
// ??????????????????????????????????????????????????????????????????????

// "?"? URL cache: videoId +' { url, contentType, via, expires } "?"?"?"?"?"?"?"?"?"?"?"?
const AUDIO_URL_CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min ?" safe for Cobalt tunnels + Piped/CDN URLs

function getCachedAudio(videoId) {
  const e = AUDIO_URL_CACHE.get(videoId);
  if (e && e.expires > Date.now()) return e;
  AUDIO_URL_CACHE.delete(videoId);
  return null;
}
function setCachedAudio(videoId, url, contentType, via) {
  if (AUDIO_URL_CACHE.size >= 300) {
    AUDIO_URL_CACHE.delete(AUDIO_URL_CACHE.keys().next().value);
  }
  AUDIO_URL_CACHE.set(videoId, { url, contentType, via, expires: Date.now() + CACHE_TTL_MS });
}

// "?"? 1. Cobalt community instances (legacy v9 API ?" no JWT auth required) "?"?"?
const COBALT_INSTANCES = [
  // Old v9 API endpoints (isAudioOnly format, no auth)
  { ep: "https://co.wuk.sh/api/json",          v9: true },
  { ep: "https://cbl.marcoislam.com/api/json",  v9: true },
  { ep: "https://cobalt.api.timelessnesses.me/api/json", v9: true },
  // v10 endpoints without auth (some community instances)
  { ep: "https://cobalt.synzr.space/",          v9: false },
];

async function cobaltGetAudioUrl(videoId) {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const errs  = [];
  for (const { ep, v9 } of COBALT_INSTANCES) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const body  = v9
        ? { url: ytUrl, isAudioOnly: true }
        : { url: ytUrl, downloadMode: "audio", audioFormat: "best" };
      const r = await fetch(ep, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) { errs.push(`${ep}: HTTP ${r.status}`); continue; }
      const data = await r.json();
      if (data.url) {
        console.log(`[Cobalt] o" ${videoId} via ${ep}`);
        return { url: data.url, contentType: "audio/mpeg" };
      }
      errs.push(`${ep}: ${data.error?.code || data.status || "no url"}`);
    } catch (e) {
      errs.push(`${ep}: ${e.message?.slice(0, 50)}`);
    }
  }
  throw new Error(`Cobalt: ${errs.join(" | ")}`);
}

// "?"? 1. Piped API ?" open-source YT proxy, no bot-detection "?"?"?"?"?"?"?"?"?"?"?"?"?"?
// Piped runs its own infrastructure that fetches from YouTube on our behalf
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://piped-api.garudalinux.org",
];

async function pipedGetAudioUrl(videoId) {
  const errs = [];
  for (const base of PIPED_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch(`${base}/streams/${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) { errs.push(`${base}: HTTP ${r.status}`); continue; }
      const data = await r.json();
      if (data.error) { errs.push(`${base}: ${data.error}`); continue; }
      const streams = (data.audioStreams || [])
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best =
        streams.find(s => s.mimeType?.includes("audio/mp4")) ??
        streams.find(s => s.mimeType?.includes("audio/webm")) ??
        streams[0];
      if (!best?.url) { errs.push(`${base}: no audio stream`); continue; }
      const ct = (best.mimeType || "audio/mp4").split(";")[0].trim();
      console.log(`[Piped] resolved ${videoId} via ${base} (${ct})`);
      return { url: best.url, contentType: ct };
    } catch (e) {
      errs.push(`${base}: ${e.message}`);
    }
  }
  throw new Error(`Piped failed (${errs.join(" | ")})`);
}

// "?"? 2. Invidious API ?" another open-source YT proxy "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
const INVIDIOUS_INSTANCES = [
  "https://invidious.io.lol",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.artemislena.eu",
];

async function invidiousGetAudioUrl(videoId) {
  const errs = [];
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch(`${base}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) { errs.push(`${base}: HTTP ${r.status}`); continue; }
      const data = await r.json();
      if (data.error) { errs.push(`${base}: ${data.error}`); continue; }
      const formats = (data.adaptiveFormats || [])
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best =
        formats.find(f => f.type?.includes("audio/mp4") && !f.type?.includes("video")) ??
        formats.find(f => f.type?.includes("audio/webm") && !f.type?.includes("video")) ??
        formats.find(f => f.type?.startsWith("audio/"));
      if (!best?.url) { errs.push(`${base}: no audio format`); continue; }
      const ct = (best.type || "audio/mp4").split(";")[0].trim();
      console.log(`[Invidious] resolved ${videoId} via ${base} (${ct})`);
      return { url: best.url, contentType: ct };
    } catch (e) {
      errs.push(`${base}: ${e.message}`);
    }
  }
  throw new Error(`Invidious failed (${errs.join(" | ")})`);
}

// "?"? 3. youtubei.js ?" Innertube API "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
// NOTE: Innertube IS reachable from Render (HTTP 200). Bug was that
// `f.has_audio` is UNDEFINED for mobile clients, making the filter fail.
// Fix: detect audio-only formats by mime_type instead.
let _innertubeInstance = null;
async function getInnertube() {
  if (_innertubeInstance) return _innertubeInstance;
  const { Innertube, UniversalCache } = await import("youtubei.js");
  _innertubeInstance = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
  });
  console.log("\u2713 youtubei.js Innertube client initialised");
  return _innertubeInstance;
}

async function innertubeGetAudioUrl(videoId) {
  const yt = await getInnertube();

  // ANDROID client returns unencrypted direct URLs; try multiple clients
  for (const clientId of ["ANDROID", "IOS", "WEB_MUSIC", "WEB"]) {
    try {
      const info = await yt.getBasicInfo(videoId, clientId);
      const sd   = info.streaming_data;
      if (!sd) { console.warn(`[Innertube/${clientId}] no streaming_data`); continue; }

      // Combine adaptive + regular formats
      const allFmts = [
        ...(Array.isArray(sd.adaptive_formats) ? sd.adaptive_formats : []),
        ...(Array.isArray(sd.formats)          ? sd.formats          : []),
      ];

      // IMPORTANT FIX: detect by mime_type ?" has_audio is undefined for mobile clients
      const audioFmts = allFmts
        .filter(f => (f.mime_type || "").toLowerCase().startsWith("audio/"))
        .sort((a, b) => (b.bitrate || b.average_bitrate || 0) - (a.bitrate || a.average_bitrate || 0));

      if (!audioFmts.length) {
        console.warn(`[Innertube/${clientId}] ${allFmts.length} formats, none audio`);
        continue;
      }

      const pick =
        audioFmts.find(f => f.mime_type?.includes("mp4"))  ??
        audioFmts.find(f => f.mime_type?.includes("webm")) ??
        audioFmts[0];

      if (!pick) continue;

      let audioUrl;
      try {
        if (pick.url) {
          // Always convert to plain string ?" youtubei.js may return a URL object
          audioUrl = String(pick.url);
        } else if (typeof pick.decipher === "function") {
          const deciphered = pick.decipher(yt.session.player);
          audioUrl = deciphered ? String(deciphered) : null;
        }
      } catch (decipherErr) {
        console.warn(`[Innertube/${clientId}] decipher error: ${decipherErr.message?.slice(0, 60)}`);
        continue;
      }
      if (!audioUrl || !audioUrl.startsWith("http")) continue;

      const ct = (pick.mime_type || "audio/mp4").split(";")[0].trim();
      console.log(`[Innertube] o" ${videoId} via ${clientId} (${ct}, ${audioFmts.length} audio fmts)`);
      return { url: audioUrl, contentType: ct };
    } catch (e) {
      console.warn(`[Innertube/${clientId}]: ${e.message?.slice(0, 80)}`);
    }
  }
  throw new Error("youtubei.js: no playable audio format (all clients tried)");
}

// "?"? 4. JioSaavn ?" PRIMARY source for Indian (especially Malayalam) music "?"?"?"?"?
// JioSaavn is FREE, no API key, full 320kbps MP4 CDN streams.
// 2-step flow: search.getResults +' song IDs +' song.getDetails (api_version=4) +' DES-ECB decrypt
//
// Pure-JS DES-ECB decryption via des.js package (no OpenSSL legacy needed).
// Node.js v22 + OpenSSL 3 disabled the legacy DES cipher in the crypto module,
// so we use des.js which is a pure-JS implementation — works on all platforms.
const { DES } = require("des.js");
const SAAVN_DES_KEY = Array.from(Buffer.from("38346591")); // 8-byte key

function decryptSaavnUrl(encryptedUrl) {
  try {
    const cipher    = DES.create({ type: "decrypt", key: SAAVN_DES_KEY });
    const cipherBuf = Array.from(Buffer.from(encryptedUrl, "base64"));
    const decrypted = cipher.update(cipherBuf).concat(cipher.final());
    const plain     = Buffer.from(decrypted).toString("utf8").replace(/\0/g, "").trim();
    // Upgrade quality: JioSaavn defaults to 96kbps; rewrite to 320kbps
    return plain
      .replace("http://", "https://")
      .replace(/_96\.mp4/, "_320.mp4")
      .replace(/_160\.mp4/, "_320.mp4")
      .replace(/_96\.mp3/, "_320.mp4")
      .replace(/_160\.mp3/, "_320.mp4")
      .replace(/\.mp3$/, ".mp4");
  } catch (e) {
    console.warn("[Saavn] decrypt failed:", e.message.slice(0, 60));
    return "";
  }
}




// Timed text fetch with JioSaavn headers ?" each has its own AbortController
async function jioFetchText(url, ms = 8000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", Cookie: "geo=IN" },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.text();
  } catch (_) { return null; } finally { clearTimeout(timer); }
}

/** Strip JSONP wrapper and parse JSON safely */
function parseJioJson(text) {
  if (!text) return null;
  try {
    const s = text.trim();
    const i = Math.min(
      s.indexOf("{") >= 0 ? s.indexOf("{") : Infinity,
      s.indexOf("[") >= 0 ? s.indexOf("[") : Infinity,
    );
    return i === Infinity ? null : JSON.parse(s.slice(i));
  } catch (_) { return null; }
}

/** Extract encrypted_media_url from a song detail object ?" handles string more_info */
function saavnExtractEnc(sd) {
  if (!sd) return null;
  let mi = sd.more_info;
  if (!mi) return null;
  if (typeof mi === "string") { try { mi = JSON.parse(mi); } catch (_) { return null; } }
  return mi?.encrypted_media_url || null;
}

/** STEP 1: Search JioSaavn +' return array of song IDs */
async function jioSearchIds(query) {
  const q = encodeURIComponent(query);
  // Primary: search.getResults (fast, returns IDs even though more_info is null)
  const textA = await jioFetchText(
    `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${q}&N=5&p=1&_format=json&_marker=0`
  );
  const idsA = (parseJioJson(textA)?.results || []).map(s => s?.id).filter(Boolean);
  if (idsA.length) return idsA;

  // Fallback: autocomplete
  const textB = await jioFetchText(
    `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${q}&_format=json&_marker=0&ctx=wap6dot0`
  );
  return (parseJioJson(textB)?.songs?.data || []).map(s => s?.id).filter(Boolean);
}

/** STEP 2: Batch-fetch song.getDetails for IDs +' decrypt and return stream URL */
async function jioGetStreamUrl(ids) {
  if (!ids?.length) throw new Error("no IDs");
  const pids = ids.slice(0, 5).join(",");
  // CRITICAL: api_version=4 is required ?" without it JioSaavn returns more_info:null
  const text = await jioFetchText(
    `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&api_version=4&pids=${pids}`
  );
  const data = parseJioJson(text);
  if (!data) throw new Error("song.getDetails returned null");
  for (const id of ids) {
    const sd  = data[id];
    const enc = saavnExtractEnc(sd);
    if (!enc) continue;
    const url = decryptSaavnUrl(enc);
    if (url.startsWith("http")) {
      console.log(`[Saavn] o" "${sd?.song || id}" +' ${url.slice(0, 55)}?`);
      return { url, contentType: "audio/mp4" };
    }
    console.warn(`[Saavn] decrypt produced non-http for id ${id}`);
  }
  throw new Error(`Saavn: no playable URL in ${ids.length} results`);
}

/** Public: query text +' stream URL (two JioSaavn API calls: search + details) */
async function saavnGetAudioUrl(query) {
  const ids = await jioSearchIds(query);
  if (!ids.length) throw new Error(`Saavn: no results for "${query}"`);
  return jioGetStreamUrl(ids);
}

/**
 * Smart Saavn search with query simplification fallbacks.
 * Malayalam/Tamil titles from iTunes often have "| Official Audio | Movie Name" suffixes
 * that prevent Saavn from matching. We strip these progressively.
 */
async function saavnSearch(rawQuery) {
  if (!rawQuery) throw new Error("Saavn: empty query");
  const queries = [
    rawQuery,
    rawQuery.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").trim(),   // remove (From "Movie")
    rawQuery.replace(/\s*[-|:]\s*.+$/, "").trim(),              // remove " - Official Audio?"
    rawQuery.replace(/\b(official|audio|video|lyric|lyrics|full|song|hd|4k)\b.*/gi, "").trim(),
    rawQuery.split(/\s+/).slice(0, 3).join(" "),                // first 3 words
  ].filter((q, i, arr) => q && q.length > 2 && arr.indexOf(q) === i);

  let lastErr;
  for (const q of queries) {
    try { return await saavnGetAudioUrl(q); }
    catch (e) {
      console.warn(`[Saavn] query "${q.slice(0, 50)}" +' ${e.message.slice(0, 60)}`);
      lastErr = e;
    }
  }
  throw lastErr || new Error(`Saavn: no match for "${rawQuery}"`);
}

// "?"? 4. @distube/ytdl-core ?" direct Node.js scraper "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
const YTDL_AGENT = ytdl.createAgent([]);

async function ytdlCoreGetAudioUrl(videoId) {
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, { agent: YTDL_AGENT });
  const fmt =
    ytdl.chooseFormat(info.formats, { quality: "highestaudio", filter: f => f.container === "mp4" && f.hasAudio && !f.hasVideo }) ??
    ytdl.chooseFormat(info.formats, { quality: "highestaudio", filter: f => f.container === "webm" && f.hasAudio && !f.hasVideo }) ??
    ytdl.chooseFormat(info.formats, { quality: "highestaudio", filter: "audioonly" });
  if (!fmt) throw new Error("ytdl-core: no audio format found");
  return { url: fmt.url, contentType: (fmt.mimeType ?? "audio/mp4").split(";")[0].trim() };
}

// "?"? 5. yt-dlp ?" last resort "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
let YTDLP_CMD = null;

async function resolveYtdlpCommand() {
  if (YTDLP_CMD) return YTDLP_CMD;
  const candidates = [
    // python -m yt_dlp is confirmed installed on this machine
    { cmd: "python",  args: ["-m", "yt_dlp", "--version"] },
    { cmd: "python3", args: ["-m", "yt_dlp", "--version"] },
    { cmd: "yt-dlp",  args: ["--version"] },
  ];
  for (const c of candidates) {
    try {
      await execFileAsync(c.cmd, c.args, { timeout: 5000 });
      YTDLP_CMD = { cmd: c.cmd, baseArgs: c.args.slice(0, -1) };
      console.log(`o" yt-dlp resolved: ${c.cmd} ${c.args.slice(0,-1).join(' ')}`);
      return YTDLP_CMD;
    } catch (_) {}
  }
  YTDLP_CMD = { cmd: "python", baseArgs: ["-m", "yt_dlp"] };
  return YTDLP_CMD;
}

async function ytdlpGetAudioUrl(videoId) {
  const resolved = await resolveYtdlpCommand();
  const args = [...resolved.baseArgs];
  const cookiesPath = process.env.YTDLP_COOKIES_FILE || path.join(process.cwd(), "cookies.txt");
  try { await fs.access(cookiesPath); args.push("--cookies", cookiesPath); } catch (_) {}
  args.push(
    "--get-url", "--get-filename",
    "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "--no-playlist", "-o", "%(ext)s",
    `https://www.youtube.com/watch?v=${videoId}`
  );
  const { stdout } = await execFileAsync(resolved.cmd, args, { timeout: 25000, maxBuffer: 1024 * 1024 });
  const lines    = stdout.trim().split("\n").map(l => l.trim()).filter(Boolean);
  const audioUrl = lines.find(l => l.startsWith("http")) || "";
  const ext      = lines.find(l => !l.startsWith("http")) || "m4a";
  if (!audioUrl) throw new Error("yt-dlp returned no URL");
  return { url: audioUrl, contentType: ext === "webm" ? "audio/webm" : "audio/mp4" };
}

/**
 * Master resolver ?" priority order:
 * 1. JioSaavn (via oEmbed title) ?" FASTEST for Indian/Malayalam music, no YT needed
 * 2. youtubei.js Innertube ?" direct, works when not IP-blocked
 * 3. Cobalt / Piped / Invidious ?" proxy layers
 * 4. yt-dlp pipe ?" last resort (python -m yt_dlp, confirmed installed)
 */
async function resolveAudioUrl(videoId) {
  const cached = getCachedAudio(videoId);
  if (cached) { console.log(`[YT] cache hit for ${videoId} (via ${cached.via})`); return cached; }

  // "?"? Pre-flight: oEmbed title +' JioSaavn lookup "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
  // For Malayalam/Indian tracks, Saavn has the full track and CDN is fast.
  // This saves 10-30s compared to going through all the YouTube resolvers.
  try {
    const oeCtrl  = new AbortController();
    const oeTimer = setTimeout(() => oeCtrl.abort(), 4000);
    const oeRes   = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: oeCtrl.signal }
    );
    clearTimeout(oeTimer);
    if (oeRes.ok) {
      const { title: oeTitle } = await oeRes.json();
      if (oeTitle) {
        const saavn = await saavnSearch(oeTitle);
        console.log(`[YT] resolved ${videoId} via Saavn+oEmbed ("${oeTitle.slice(0,40)}")`);
        setCachedAudio(videoId, saavn.url, saavn.contentType, "saavn");
        return { ...saavn, via: "saavn" };
      }
    }
  } catch (saavnPreErr) {
    console.warn(`[YT] Saavn pre-flight miss for ${videoId}: ${saavnPreErr.message?.slice(0, 60)}`);
  }

  const methods = [
    { name: "youtubei",  fn: () => innertubeGetAudioUrl(videoId)  },
    { name: "Cobalt",    fn: () => cobaltGetAudioUrl(videoId)     },
    { name: "Piped",     fn: () => pipedGetAudioUrl(videoId)      },
    { name: "Invidious", fn: () => invidiousGetAudioUrl(videoId)  },
    // yt-dlp before ytdl-core: yt-dlp handles anti-bot; ytdl-core URLs 403 on pipe
    { name: "yt-dlp",    fn: () => ytdlpGetAudioUrl(videoId)      },
    { name: "ytdl-core", fn: () => ytdlCoreGetAudioUrl(videoId)   },
  ];

  let lastErr;
  for (const { name, fn } of methods) {
    try {
      const result = await fn();
      setCachedAudio(videoId, result.url, result.contentType, name);
      console.log(`[YT] resolved ${videoId} via ${name}`);
      return { ...result, via: name };
    } catch (err) {
      console.warn(`[YT] ${name} failed for ${videoId}: ${err.message?.slice(0,80)}`);
      lastErr = err;
    }
  }
  throw lastErr;
}


// ??????????????????????????????????????????????????????????????????????
//  YouTube  ?"  Full-length songs for ALL languages
//  Flow: iTunes catalog +' YouTube audio stream (full track)
// ??????????????????????????????????????????????????????????????????????

const YT_SEARCH_CACHE = new Map(); // query +' videoId

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


// ??????????????????????????????????????????????????????????????????????
//  iTunes Search  ?"  Catalog: metadata, artwork, genre
// ??????????????????????????????????????????????????????????????????????
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

/** Strip parenthetical movie-name suffixes +' canonical title for dedup */
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
  const picked = seeds.slice(0, 6);   // 6 seeds A- up to 25 tracks = 150 candidates
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

// ??????????????????????????????????????????????????????????????????????
//  Audius  ?"  Full English/Electronic songs
// ??????????????????????????????????????????????????????????????????????
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
    year:        item.release_date?.split("-")[0],
    lyrics:      [`Full track A ${item.genre}`, `${item.user?.name}`, "via Audius"],
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

// ??????????????????????????????????????????????????????????????????????
//  Helpers
// ??????????????????????????????????????????????????????????????????????
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

// ??????????????????????????????????????????????????????????????????????
//  Routes
// ??????????????????????????????????????????????????????????????????????


// "?"? YouTube: resolve title+artist +' stream URL "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
// ── Resolve iTunes title+artist → JioSaavn stream URL ─────────────────────
// YouTube is NOT used here — cloud IPs are blocked by YouTube.
// JioSaavn is free, fast, 320kbps MP4, works from all server IPs.
app.get("/api/youtube/resolve", wrap(async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: "title required" });

  // Build progressively broader queries: most specific first
  const queries = [
    artist ? `${title} ${artist}` : null,
    title,
    artist ? `${title.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").trim()} ${artist.split(/[,&]/)[0].trim()}` : null,
  ].filter(Boolean).filter((q, i, a) => q && q.length > 2 && a.indexOf(q) === i);

  for (const q of queries) {
    try {
      const saavn = await saavnSearch(q);
      console.log(`[Resolve] Saavn OK for "${title}" via "${q}"`);
      return res.json({ videoId: null, streamUrl: saavn.url, via: "saavn", contentType: saavn.contentType });
    } catch (e) {
      console.warn(`[Resolve] Saavn miss for "${q.slice(0, 50)}": ${e.message.slice(0, 60)}`);
    }
  }

  // All Saavn attempts failed — return 404 (client will show "unavailable")
  return res.status(404).json({ error: "Track not found on JioSaavn. YouTube streaming not supported on this deployment." });
}));

// ── Direct JioSaavn lookup by title+artist ──────────────────────────────────
app.get("/api/saavn/stream", wrap(async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: "title required" });

  // saavnSearch already does smart multi-variant stripping internally.
  // We call it twice: once with just the title (best for Indian music with
  // "(From Movie)" suffixes), and once with "title artist" for disambiguation.
  const cleanTitle  = title.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").trim(); // strip (From "Movie")
  const firstArtist = artist ? artist.split(/[,&]/)[0].trim() : "";

  const attempts = [
    // 1. Clean title + first artist — most targeted
    firstArtist ? `${cleanTitle} ${firstArtist}` : null,
    // 2. Clean title alone — best hit-rate for regional Indian songs
    cleanTitle,
    // 3. Full raw title — saavnSearch handles further simplification internally
    title !== cleanTitle ? title : null,
    // 4. First 3 words of clean title
    cleanTitle.split(/\s+/).slice(0, 3).join(" "),
  ].filter((q, i, a) => q && q.length > 2 && a.indexOf(q) === i);

  let lastErr;
  for (const q of attempts) {
    try {
      console.log(`[Saavn] trying: "${q.slice(0, 60)}"`);
      const saavn = await saavnSearch(q);
      console.log(`[Saavn] OK for "${title.slice(0, 40)}" via "${q.slice(0, 40)}"`);
      return res.json({ streamUrl: saavn.url, contentType: saavn.contentType || "audio/mp4", via: "saavn" });
    } catch (e) {
      console.warn(`[Saavn] miss: "${q?.slice(0, 50)}" → ${e.message.slice(0, 60)}`);
      lastErr = e;
    }
  }
  return res.status(404).json({ error: "Not found on JioSaavn", detail: lastErr?.message });
}));



app.get("/api/youtube/stream", wrap(async (req, res) => {
  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: "Invalid videoId" });
  }

  // "?"? PRE-FLIGHT: try Saavn via oEmbed title BEFORE the heavy YT resolver chain.
  // Render cloud IPs are often blocked by YouTube. oEmbed is not IP-restricted.
  // This saves 10-30s and avoids the 500 for Indian tracks.
  try {
    const oEmbedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (oEmbedRes.ok) {
      const { title: vtitle } = await oEmbedRes.json();
      if (vtitle) {
        try {
          const saavn = await saavnSearch(vtitle); // multi-query variant for best hit-rate
          console.log(`[YT stream] Saavn pre-flight o" for ${id}: "${vtitle}"`);
          res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
          return res.redirect(302, saavn.url);
        } catch (saavnPreErr) {
          console.warn(`[YT stream] Saavn pre-flight miss for "${vtitle}": ${saavnPreErr.message?.slice(0, 60)}`);
        }
      }
    }
  } catch (oembedErr) {
    console.warn(`[YT stream] oEmbed pre-flight failed for ${id}: ${oembedErr.message?.slice(0, 60)}`);
  }

  let entry;
  try {
    entry = await resolveAudioUrl(id);
  } catch (err) {
    console.warn(`[YT stream] All methods failed for ${id}: ${err.message}`);

    // Last resort: try Saavn one more time with a fresh oEmbed lookup
    try {
      const oEmbedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (oEmbedRes.ok) {
        const { title: vtitle } = await oEmbedRes.json();
        if (vtitle) {
          const saavn = await saavnSearch(vtitle);
          console.log(`[YT stream] oEmbed+Saavn last-resort OK for ${id}: "${vtitle}"`);
          res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
          return res.redirect(302, saavn.url);
        }
      }
    } catch (saavnErr) {
      console.warn(`[YT stream] oEmbed+Saavn last-resort failed for ${id}:`, saavnErr.message);
    }

    return res.status(500).json({ error: "Audio unavailable", detail: err.message });
  }

  // For ytdl-core or yt-dlp resolved URLs: stream via yt-dlp which handles
  // anti-bot detection better than piping ytdl directly (ytdl gets 403).
  // yt-dlp is available as: python -m yt_dlp
  if (entry.via === "ytdl-core" || entry.via === "yt-dlp") {
    try {
      const ytdlpResolved = await resolveYtdlpCommand();
      const ytdlpArgs = [
        ...ytdlpResolved.baseArgs,
        "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
        "--no-playlist",
        "-o", "-", // stdout
        `https://www.youtube.com/watch?v=${id}`,
      ];
      console.log(`[YT stream] piping via yt-dlp for ${id}`);
      res.set({
        "Content-Type":               entry.contentType || "audio/mp4",
        "Accept-Ranges":              "bytes",
        "Transfer-Encoding":          "chunked",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control":              "no-store",
      });
      const proc = spawn(ytdlpResolved.cmd, ytdlpArgs, { stdio: ["ignore", "pipe", "pipe"] });
      proc.stderr.on("data", d => {
        const line = d.toString().trim();
        if (line) console.warn("[yt-dlp stderr]", line.slice(0, 120));
      });
      proc.on("error", err => {
        console.warn("[yt-dlp spawn error]", err.message);
        try { if (!res.headersSent) res.status(500).end(); else res.end(); } catch (_) {}
      });
      proc.on("close", code => {
        if (code !== 0) console.warn(`[yt-dlp] exited ${code} for ${id}`);
        try { res.end(); } catch (_) {}
      });
      req.on("close", () => { try { proc.kill(); } catch (_) {} });
      proc.stdout.pipe(res);
      return;
    } catch (ytdlpErr) {
      console.warn(`[YT stream] yt-dlp pipe setup failed: ${ytdlpErr.message}`);
      // Fall through to redirect if yt-dlp setup fails
    }
  }

  // All other sources (Cobalt / Piped / Invidious / Saavn CDN):
  // plain 302 redirect ?" these URLs are public and not IP-bound.
  const redirectUrl = String(entry.url || "");
  if (!redirectUrl.startsWith("http")) {
    return res.status(500).json({ error: "Resolved audio URL is invalid" });
  }
  res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  return res.redirect(302, redirectUrl);
}));



// ── Artwork proxy ──────────────────────────────────────────────────────
app.get("/api/artwork", wrap(async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: "url required" });
  let parsed;
  try { parsed = new URL(rawUrl); } catch (_) { return res.status(400).json({ error: "Invalid URL" }); }
  if (!["http:", "https:"].includes(parsed.protocol)) return res.status(403).json({ error: "Protocol not allowed" });
  const h = parsed.hostname;
  if (/^(127\.|\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|0\.0\.0\.0)/i.test(h))
    return res.status(403).json({ error: "Private IP not allowed" });
  // Use full browser UA — Apple CDN (mzstatic.com) and others block minimal UA strings
  const upstream = await fetch(parsed.toString(), {
    redirect: "follow",
    headers: {
      "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept":          "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer":         "https://" + h + "/",
      "Sec-Fetch-Dest":  "image",
      "Sec-Fetch-Mode":  "no-cors",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!upstream.ok) return res.status(502).json({ error: "Upstream " + upstream.status });
  const ct = upstream.headers.get("content-type") || "image/jpeg";
  if (!ct.startsWith("image/") && ct !== "application/octet-stream")
    return res.status(502).json({ error: "Bad upstream content-type: " + ct });
  res.set({
    "Content-Type":                ct.startsWith("image/") ? ct : "image/jpeg",
    "Cache-Control":               "public, max-age=604800",
    "Access-Control-Allow-Origin": "*",
  });
  res.send(Buffer.from(await upstream.arrayBuffer()));
}));

// "?"? Audius stream proxy "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
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

// "?"? Main Search "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
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
    // Pick NON-OVERLAPPING 6-seed chunks per page (no rotation overlap)
    const chunkSize = 6;
    const startIdx  = (page * chunkSize) % base.length;
    seeds = [
      base[(startIdx + 0) % base.length],
      base[(startIdx + 1) % base.length],
      base[(startIdx + 2) % base.length],
      base[(startIdx + 3) % base.length],
      base[(startIdx + 4) % base.length],
      base[(startIdx + 5) % base.length],
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

// "?"? Real Trending Charts "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
app.get("/api/trending", wrap(async (req, res) => {
  const language = String(req.query.language || 'malayalam').toLowerCase();
  try {
    const data = await fetchTrending(language);
    res.json(data);
  } catch (e) {
    console.error('[Trending] fetch error:', e.message);
    res.status(503).json({
      error: 'Trending data unavailable',
      trending: [], viral: [], movieTracks: [],
      newReleases: [], topCharts: [],
      lastUpdated: null,
    });
  }
}));

// "?"? Bootstrap "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
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

// PATCH /api/preferences ?" merge partial updates (volume, language, shuffle, repeat, theme?)
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

// POST /api/history ?" save a full track snapshot (fire-and-forget from client)
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

// GET /api/history ?" return last N played tracks
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

// "?"? Excluded (taste profile) "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
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

// "?"? Playlists "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?

/** Serialize a playlist doc to a plain object with count */
function playlistJSON(pl) {
  const obj = pl.toObject ? pl.toObject() : { ...pl };
  const tracks = Array.isArray(obj.tracks) ? obj.tracks : [];
  obj.tracks = tracks.filter(t => t && typeof t === "object" && t.id);
  obj.count  = obj.tracks.length;
  return obj;
}

/** GET /api/playlists ?" list all playlists */
app.get("/api/playlists", wrap(async (_req, res) => {
  const docs = await Playlist.find({}).sort({ updatedAt: -1 });
  res.json({ playlists: docs.map(playlistJSON) });
}));

/** POST /api/playlists ?" create a new playlist */
app.post("/api/playlists", wrap(async (req, res) => {
  const { name, description = "", color = "#1db954" } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  const id = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const playlist = new Playlist({ id, name: name.trim(), description, color, tracks: [] });
  await playlist.save();
  res.status(201).json({ playlist: playlistJSON(playlist) });
}));

/** GET /api/playlists/:id ?" get a single playlist with all tracks */
app.get("/api/playlists/:id", wrap(async (req, res) => {
  const playlist = await Playlist.findOne({ id: req.params.id });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  res.json({ playlist: playlistJSON(playlist) });
}));

/** PATCH /api/playlists/:id ?" rename / update a playlist */
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

/** DELETE /api/playlists/:id ?" delete a playlist */
app.delete("/api/playlists/:id", wrap(async (req, res) => {
  await Playlist.deleteOne({ id: req.params.id });
  res.json({ ok: true });
}));

/** POST /api/playlists/:id/tracks ?" add a track to a playlist */
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

/** DELETE /api/playlists/:id/tracks/:trackId ?" remove a track from a playlist */
app.delete("/api/playlists/:id/tracks/:trackId", wrap(async (req, res) => {
  const playlist = await Playlist.findOne({ id: req.params.id });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  playlist.tracks = (Array.isArray(playlist.tracks) ? playlist.tracks : [])
    .filter(t => t && t.id !== req.params.trackId);
  playlist.markModified("tracks");
  await playlist.save();
  res.json({ playlist: playlistJSON(playlist) });
}));

app.get("/api/ytdlp-test", wrap(async (req, res) => {
  const testVideoId = req.query.id || "MKnHHXMD3Bg";

  const test = async (fn) => {
    try { const r = await fn(); return { ok: true, contentType: r.contentType, url: r.url?.slice(0, 80) + "?" }; }
    catch (e) { return { ok: false, error: e.message.slice(0, 200) }; }
  };

  const [cobalt, piped, invidious, innertube, ytdlCore] = await Promise.allSettled([
    test(() => cobaltGetAudioUrl(testVideoId)),
    test(() => pipedGetAudioUrl(testVideoId)),
    test(() => invidiousGetAudioUrl(testVideoId)),
    test(() => innertubeGetAudioUrl(testVideoId)),
    test(() => ytdlCoreGetAudioUrl(testVideoId)),
  ]);
  const get = r => r.status === "fulfilled" ? r.value : { ok: false, error: r.reason?.message };

  res.json({
    testVideoId,
    anyOk: [cobalt, piped, invidious, innertube, ytdlCore].some(r => r.status === "fulfilled" && r.value?.ok),
    "1_cobalt":      get(cobalt),
    "2_piped":       get(piped),
    "3_invidious":   get(invidious),
    "4_youtubei.js": get(innertube),
    "5_ytdl-core":   get(ytdlCore),
    env: { NODE_ENV: process.env.NODE_ENV },
  });
}));

app.use("/api/{*path}", (_req, res) => res.status(404).json({ error: "Not found" }));

// ??????????????????????????????????????????????????????????????????????
//  Start
// ??????????????????????????????????????????????????????????????????????
// Start HTTP immediately so Vite proxy doesn't get ECONNREFUSED
const server = app.listen(port, () => {
  console.log(`Auralis API at http://localhost:${port}`);;
  console.log("  YouTube full tracks | iTunes catalog | Malayalam/Tamil/Hindi/English");;
});
// Prevent keep-alive connections from blocking graceful shutdown
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;

// Connect to MongoDB in the background
mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 30000 })
  .then(() => {
    console.log("MongoDB connected");
    dbReady = true;
  })
  .catch(e => {
    console.error("MongoDB connection failed:", e.message);
    console.warn("  DB-dependent routes will return 503 until connection succeeds.");
    // Retry every 30s
    const retry = setInterval(() => {
      mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 30000 })
        .then(() => { console.log("MongoDB reconnected"); dbReady = true; clearInterval(retry); })
        .catch(err => console.error("MongoDB retry failed:", err.message));
    }, 30000);
  });


