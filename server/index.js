require('dotenv').config();

// ── Crash prevention: keep server alive on unhandled errors ─────────────────
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message, err.stack?.split("\n")[1] || "");
  // Don't exit — keep serving other requests
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

// ══════════════════════════════════════════════════════════════════════
//  YouTube audio extraction
//  Root issue: YouTube blocks cloud-server IPs (429/bot-detection).
//  Fix: route through Piped + Invidious — open-source YT proxy networks
//  whose IPs are NOT blocked by YouTube.
//  Priority: Piped → Invidious → youtubei.js → ytdl-core → yt-dlp
// ══════════════════════════════════════════════════════════════════════

// ── URL cache: videoId → { url, contentType, via, expires } ────────────
const AUDIO_URL_CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — safe for Cobalt tunnels + Piped/CDN URLs

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

// ── 1. Cobalt community instances (legacy v9 API — no JWT auth required) ───
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
        console.log(`[Cobalt] ✓ ${videoId} via ${ep}`);
        return { url: data.url, contentType: "audio/mpeg" };
      }
      errs.push(`${ep}: ${data.error?.code || data.status || "no url"}`);
    } catch (e) {
      errs.push(`${ep}: ${e.message?.slice(0, 50)}`);
    }
  }
  throw new Error(`Cobalt: ${errs.join(" | ")}`);
}

// ── 1. Piped API — open-source YT proxy, no bot-detection ──────────────
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

// ── 2. Invidious API — another open-source YT proxy ────────────────────
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

// ── 3. youtubei.js — Innertube API ────────────────────────────────────────
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

      // IMPORTANT FIX: detect by mime_type — has_audio is undefined for mobile clients
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
          // Always convert to plain string — youtubei.js may return a URL object
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
      console.log(`[Innertube] ✓ ${videoId} via ${clientId} (${ct}, ${audioFmts.length} audio fmts)`);
      return { url: audioUrl, contentType: ct };
    } catch (e) {
      console.warn(`[Innertube/${clientId}]: ${e.message?.slice(0, 80)}`);
    }
  }
  throw new Error("youtubei.js: no playable audio format (all clients tried)");
}

// ── 4. JioSaavn — reliable for Indian content ────────────────────────────
// Works from any cloud server, no IP blocking, supports Ma/Ta/Hi/En.
// Three sources tried in order; EACH has its own AbortController (5 s).
// Key fix: previously one shared AbortController aborted all 3 sources
// when source A (saavn.dev) timed out.

// DES-ECB decrypt for JioSaavn encrypted_media_url
const { createDecipheriv } = require("crypto");
function decryptSaavnUrl(encryptedUrl) {
  try {
    const key      = Buffer.from("38346591");                // 8-byte DES key
    const decipher = createDecipheriv("des-ecb", key, "");   // ECB — no IV
    decipher.setAutoPadding(true);
    const decoded  = Buffer.from(encryptedUrl, "base64");
    const plain    = Buffer.concat([decipher.update(decoded), decipher.final()])
                       .toString("utf8").replace(/\0/g, "");
    // Upgrade quality in the URL
    return plain
      .replace("http://", "https://")
      .replace("_96.", "_320.")
      .replace("_160.", "_320.")
      .replace(".mp3", ".mp4");
  } catch (_) {
    return "";
  }
}

// Fetch with per-call timeout (ms). Returns null on error.
async function fetchJson(url, opts = {}, ms = 5000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function saavnGetAudioUrl(query) {
  const q = encodeURIComponent(query);

  // ── Source A: saavn.dev community API (pre-decrypted 320kbps URLs) ──────
  {
    const data = await fetchJson(
      `https://saavn.dev/api/search/songs?query=${q}&limit=5`,
      { headers: { Accept: "application/json" } },
      5000
    );
    const song = data?.data?.results?.[0];
    const urls = song?.downloadUrl || [];
    const best = urls.find(u => u.quality === "320kbps")
              ?? urls.find(u => u.quality === "160kbps")
              ?? urls.at(-1);
    if (best?.url) {
      console.log(`[Saavn/dev] ✓ "${song.name}" for "${query}"`);
      return { url: best.url, contentType: "audio/mpeg" };
    }
    console.warn(`[Saavn/dev] miss for "${query}" (data=${data ? 'ok' : 'null'})`);
  }

  // ── Source B: JioSaavn official app search API (used by Saavn apps) ─────
  {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(
        `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${q}&N=5&p=1&_format=json&_marker=0`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", Cookie: "geo=IN" }, signal: ctrl.signal }
      );
      clearTimeout(timer);
      if (r.ok) {
        const text = await r.text();
        // JioSaavn sometimes returns JSONP like: /**/cb({...})
        const jsonText = text.trim().replace(/^[^{\[]*/, "").replace(/[^}\]]*$/, "") || "{}";
        const data = JSON.parse(jsonText);
        const songs = data?.results || [];
        for (const s of songs) {
          const enc = s?.more_info?.encrypted_media_url;
          if (!enc) continue;
          const url = decryptSaavnUrl(enc);
          if (url.startsWith("http")) {
            console.log(`[Saavn/jiosaavn] ✓ "${s.title}" for "${query}"`);
            return { url, contentType: "audio/mp4" };
          }
        }
        console.warn(`[Saavn/jiosaavn] no usable song (${songs.length} results) for "${query}"`);
      } else {
        console.warn(`[Saavn/jiosaavn] HTTP ${r.status} for "${query}"`);
      }
    } catch (e) {
      clearTimeout(timer);
      console.warn(`[Saavn/jiosaavn] ${e.message.slice(0, 60)}`);
    }
  }

  // ── Source C: saavn.dev songs search (alternate path) ───────────────────
  {
    const data = await fetchJson(
      `https://saavn.dev/api/songs/search?query=${q}&limit=5`,
      { headers: { Accept: "application/json" } },
      5000
    );
    const songs = data?.data?.results ?? data?.data ?? [];
    const song  = Array.isArray(songs) ? songs[0] : null;
    const urls  = song?.downloadUrl || [];
    const best  = urls.find(u => u.quality === "320kbps")
               ?? urls.find(u => u.quality === "160kbps")
               ?? urls.at(-1);
    if (best?.url) {
      console.log(`[Saavn/alt] ✓ "${song.name}" for "${query}"`);
      return { url: best.url, contentType: "audio/mpeg" };
    }
    console.warn(`[Saavn/alt] miss for "${query}"`);
  }

  // ── Source D: JioSaavn autocomplete + song details ───────────────────────
  // autocomplete gives song IDs → fetch song details → encrypted URL
  {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const acR = await fetch(
        `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${q}&_format=json&_marker=0&ctx=wap6dot0`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: ctrl.signal }
      );
      if (acR.ok) {
        const acText = await acR.text();
        const acJson = JSON.parse(acText.trim().replace(/^[^{\[]*/, "").replace(/[^}\]]*$/, "") || "{}");
        const songId = acJson?.songs?.data?.[0]?.id;
        if (songId) {
          const songR = await fetch(
            `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${songId}`,
            { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: ctrl.signal }
          );
          clearTimeout(timer);
          if (songR.ok) {
            const sdText = await songR.text();
            const sdJson = JSON.parse(sdText.trim().replace(/^[^{\[]*/, "").replace(/[^}\]]*$/, "") || "{}");
            const songData = sdJson?.[songId];
            const enc = songData?.more_info?.encrypted_media_url;
            if (enc) {
              const url = decryptSaavnUrl(enc);
              if (url.startsWith("http")) {
                console.log(`[Saavn/autocomplete] ✓ "${songData?.song}" for "${query}"`);
                return { url, contentType: "audio/mp4" };
              }
            }
          }
        }
      } else { clearTimeout(timer); }
    } catch (e) {
      clearTimeout(timer);
      console.warn(`[Saavn/autocomplete] ${e.message.slice(0, 60)}`);
    }
  }

  throw new Error(`Saavn: all sources failed for "${query}"`);
}

// ── 4. @distube/ytdl-core — direct Node.js scraper ─────────────────────
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

// ── 5. yt-dlp — last resort ──────────────────────────────────────────────
let YTDLP_CMD = null;

async function resolveYtdlpCommand() {
  if (YTDLP_CMD) return YTDLP_CMD;
  const candidates = [
    { cmd: "yt-dlp",  args: ["--version"] },
    { cmd: "python3", args: ["-m", "yt_dlp", "--version"] },
    { cmd: "python",  args: ["-m", "yt_dlp", "--version"] },
  ];
  for (const c of candidates) {
    try {
      await execFileAsync(c.cmd, c.args, { timeout: 3000 });
      YTDLP_CMD = { cmd: c.cmd, baseArgs: c.args.slice(0, -1) };
      console.log(`✓ yt-dlp resolved: ${c.cmd}`);
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
 * Master resolver — tries all five methods in priority order.
 * Proxy-based methods (Piped/Invidious) go first since cloud server IPs
 * are blocked by YouTube directly.
 * Results are cached for 4 hours.
 */
async function resolveAudioUrl(videoId) {
  const cached = getCachedAudio(videoId);
  if (cached) { console.log(`[YT] cache hit for ${videoId} (via ${cached.via})`); return cached; }

  const methods = [
    // youtubei.js FIRST — Innertube IS reachable from Render (code was buggy before)
    { name: "youtubei",  fn: () => innertubeGetAudioUrl(videoId)   },
    // Cobalt community instances (old v9 API, no JWT)
    { name: "Cobalt",    fn: () => cobaltGetAudioUrl(videoId)      },
    // Piped + Invidious — sometimes work depending on instance availability
    { name: "Piped",     fn: () => pipedGetAudioUrl(videoId)       },
    { name: "Invidious", fn: () => invidiousGetAudioUrl(videoId)   },
    // Direct scrapers — blocked by YouTube on cloud IPs
    { name: "ytdl-core", fn: () => ytdlCoreGetAudioUrl(videoId)    },
    { name: "yt-dlp",    fn: () => ytdlpGetAudioUrl(videoId)       },
  ];

  let lastErr;
  for (const { name, fn } of methods) {
    try {
      const result = await fn();
      const withVia = { ...result, via: name };
      setCachedAudio(videoId, result.url, result.contentType, name);
      console.log(`[YT] resolved ${videoId} via ${name}`);
      return withVia;
    } catch (err) {
      console.warn(`[YT] ${name} failed for ${videoId}: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
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
  const picked = seeds.slice(0, 6);   // 6 seeds × up to 25 tracks = 150 candidates
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
    year:        item.release_date?.split("-")[0],
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


// ── YouTube: resolve title+artist → stream URL ───────────────────────────
// Priority: JioSaavn (multi-query) → oEmbed title + Saavn → YouTube stream
app.get("/api/youtube/resolve", wrap(async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: "title required" });

  // Pass 1: Saavn with multiple query variations of the iTunes title
  try {
    const saavn = await saavnSearch(title);
    return res.json({ videoId: null, streamUrl: saavn.url, via: "saavn" });
  } catch (e) {
    console.warn(`[Resolve] Saavn miss (pass 1) for "${title}": ${e.message}`);
  }

  // YouTube search to get the videoId we'll use for stream fallback
  const videoId = await searchYouTube(title, artist || "");
  if (!videoId) return res.status(404).json({ error: "No result found" });

  // Pass 2: Get the actual YouTube video title via oEmbed, then try Saavn again.
  // The YouTube title is often a cleaner match (e.g. "Parayathe Vannen | Premam")
  // whereas the iTunes title might have different phrasing.
  try {
    const oe = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (oe.ok) {
      const { title: ytTitle } = await oe.json();
      if (ytTitle) {
        const saavn = await saavnSearch(ytTitle);
        console.log(`[Resolve] oEmbed+Saavn ✓ for "${title}" → "${ytTitle}"`);
        return res.json({ videoId: null, streamUrl: saavn.url, via: "saavn_oembed" });
      }
    }
  } catch (e) {
    console.warn(`[Resolve] oEmbed+Saavn miss for "${title}": ${e.message}`);
  }

  // Final fallback: YouTube stream endpoint
  res.json({ videoId, streamUrl: `/api/youtube/stream?id=${videoId}`, via: "youtube" });
}));

app.get("/api/youtube/stream", wrap(async (req, res) => {
  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: "Invalid videoId" });
  }

  let entry;
  try {
    entry = await resolveAudioUrl(id);
  } catch (err) {
    console.warn(`[YT stream] All methods failed for ${id}: ${err.message}`);

    // Last resort: get video title via YouTube oEmbed (works from any IP)
    // then search JioSaavn — covers Indian music reliably
    try {
      const oEmbedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (oEmbedRes.ok) {
        const { title: vtitle } = await oEmbedRes.json();
        if (vtitle) {
          const saavn = await saavnGetAudioUrl(vtitle);
          console.log(`[YT stream] oEmbed+Saavn fallback OK for ${id}: ${vtitle}`);
          res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
          return res.redirect(302, saavn.url);
        }
      }
    } catch (saavnErr) {
      console.warn(`[YT stream] oEmbed+Saavn fallback failed for ${id}:`, saavnErr.message);
    }

    return res.status(500).json({ error: "Audio unavailable", detail: err.message });
  }

  // ── ytdl-core: pipe stream directly — avoids expired-URL / 403 issues ──
  // ytdl().pipe() re-fetches from YouTube in real time using the server's IP,
  // so there's no race between URL extraction and CDN delivery.
  if (entry.via === "ytdl-core") {
    res.set({
      "Content-Type":              entry.contentType || "audio/mp4",
      "Accept-Ranges":             "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":             "no-store",
      "Transfer-Encoding":         "chunked",
    });
    const ytStream = ytdl(`https://www.youtube.com/watch?v=${id}`, {
      filter: "audioonly",
      quality: "highestaudio",
      agent:   YTDL_AGENT,
    });
    ytStream.on("error", (err) => {
      console.warn(`[YT stream] ytdl pipe error: ${err.message}`);
      try { if (!res.headersSent) res.status(500).end(); else res.end(); } catch (_) {}
    });
    req.on("close", () => { try { ytStream.destroy(); } catch (_) {} });
    ytStream.pipe(res);
    return;
  }

  // ── All other sources: plain 302 redirect ─────────────────────────────
  // (Cobalt/Piped/Invidious/Saavn CDN URLs are public and not IP-bound)
  const redirectUrl = String(entry.url || "");
  if (!redirectUrl.startsWith("http")) {
    return res.status(500).json({ error: "Resolved audio URL is invalid" });
  }
  res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  return res.redirect(302, redirectUrl);
}));