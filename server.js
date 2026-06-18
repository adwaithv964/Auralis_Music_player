const http = require("node:http");
const { promises: fs } = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const dbFile = path.join(dataDir, "music-db.json");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const seedDatabase = {
  tracks: [
    {
      id: "midnight-signal",
      title: "Midnight Signal",
      artist: "Nova Vale",
      album: "Glassworks",
      duration: 214,
      genre: "Electro pop",
      mood: "night",
      energy: 74,
      tempo: 116,
      color: ["#67f0b7", "#7cc7ff", "#111514"],
      freq: 196,
      sourceType: "generated",
      lyrics: ["Neon on the ceiling", "Static in the rain", "Hold the midnight signal", "Let it play again"]
    },
    {
      id: "velvet-circuit",
      title: "Velvet Circuit",
      artist: "Mira Sol",
      album: "Afterimage",
      duration: 187,
      genre: "R&B",
      mood: "night",
      energy: 58,
      tempo: 92,
      color: ["#ff7a90", "#5f6cff", "#161216"],
      freq: 164,
      sourceType: "generated",
      lyrics: ["Soft light on the wire", "Velvet in the room", "Every quiet corner", "Moves around the tune"]
    },
    {
      id: "solar-bloom",
      title: "Solar Bloom",
      artist: "Kaito Lane",
      album: "Daylight Maps",
      duration: 233,
      genre: "Indie dance",
      mood: "drive",
      energy: 82,
      tempo: 124,
      color: ["#ffd166", "#67f0b7", "#222012"],
      freq: 220,
      sourceType: "generated",
      lyrics: ["Windows full of summer", "Bassline in the street", "Solar bloom is rising", "Underneath our feet"]
    },
    {
      id: "rainroom",
      title: "Rainroom",
      artist: "Elian Park",
      album: "Quiet Machines",
      duration: 198,
      genre: "Ambient",
      mood: "focus",
      energy: 36,
      tempo: 74,
      color: ["#7cc7ff", "#d6f6ff", "#13191d"],
      freq: 146,
      sourceType: "generated",
      lyrics: ["A room made out of water", "A lamp beside the door", "The city turns to whisper", "Then disappears once more"]
    },
    {
      id: "static-hearts",
      title: "Static Hearts",
      artist: "Oren Fox",
      album: "Arcade Weather",
      duration: 206,
      genre: "Alt rock",
      mood: "drive",
      energy: 86,
      tempo: 138,
      color: ["#f25f5c", "#ffe066", "#181111"],
      freq: 246,
      sourceType: "generated",
      lyrics: ["Static hearts are racing", "Under every sign", "Turn the speakers upward", "Make the city shine"]
    },
    {
      id: "cobalt-drive",
      title: "Cobalt Drive",
      artist: "June Harbor",
      album: "Late Turns",
      duration: 221,
      genre: "Synthwave",
      mood: "drive",
      energy: 78,
      tempo: 110,
      color: ["#3da5d9", "#73e2a7", "#0c1720"],
      freq: 174,
      sourceType: "generated",
      lyrics: ["Cobalt on the dashboard", "Headlights split the blue", "Every exit flickers", "Leading back to you"]
    },
    {
      id: "afterglow-city",
      title: "Afterglow City",
      artist: "Sable North",
      album: "Night Market",
      duration: 242,
      genre: "House",
      mood: "night",
      energy: 88,
      tempo: 126,
      color: ["#b388ff", "#67f0b7", "#17121d"],
      freq: 208,
      sourceType: "generated",
      lyrics: ["Afterglow city", "Moving through the glass", "Every face a rhythm", "Every minute fast"]
    },
    {
      id: "low-orbit",
      title: "Low Orbit",
      artist: "Tess Arden",
      album: "Satellite Sleep",
      duration: 256,
      genre: "Downtempo",
      mood: "focus",
      energy: 48,
      tempo: 84,
      color: ["#9ad1d4", "#f7b267", "#121918"],
      freq: 155,
      sourceType: "generated",
      lyrics: ["Low orbit breathing", "A circle made of sound", "We move a little slower", "Till our feet touch ground"]
    },
    {
      id: "warm-algorithm",
      title: "Warm Algorithm",
      artist: "Ada Voss",
      album: "Human Index",
      duration: 193,
      genre: "Future soul",
      mood: "focus",
      energy: 61,
      tempo: 98,
      color: ["#f4a261", "#2a9d8f", "#19130f"],
      freq: 185,
      sourceType: "generated",
      lyrics: ["Warm algorithm", "Learning how we move", "Softly counting heartbeats", "Finding every groove"]
    },
    {
      id: "north-window",
      title: "North Window",
      artist: "Iris Bell",
      album: "Rooms",
      duration: 176,
      genre: "Acoustic",
      mood: "focus",
      energy: 34,
      tempo: 68,
      color: ["#d9ed92", "#99d98c", "#182016"],
      freq: 130,
      sourceType: "generated",
      lyrics: ["North window open", "Morning on the floor", "Let the quiet answer", "What we came here for"]
    },
    {
      id: "glass-tide",
      title: "Glass Tide",
      artist: "Reef Atlas",
      album: "Blue Current",
      duration: 205,
      genre: "Chillwave",
      mood: "night",
      energy: 54,
      tempo: 88,
      color: ["#48cae4", "#ffafcc", "#10151a"],
      freq: 175,
      sourceType: "generated",
      lyrics: ["Glass tide rolling", "Pink light on the shore", "Every wave remembers", "What the night is for"]
    },
    {
      id: "pulse-theory",
      title: "Pulse Theory",
      artist: "Nico Sun",
      album: "Bright Data",
      duration: 229,
      genre: "Tech house",
      mood: "drive",
      energy: 91,
      tempo: 128,
      color: ["#06d6a0", "#ef476f", "#111918"],
      freq: 233,
      sourceType: "generated",
      lyrics: ["Pulse theory rising", "Hands above the sound", "Nothing here is static", "When the lights come down"]
    }
  ],
  playlists: [
    { id: "daily-glass", name: "Daily glass", filter: "all", count: 42 },
    { id: "late-night-focus", name: "Late night focus", filter: "focus", count: 18 },
    { id: "drive-pulse", name: "Drive pulse", filter: "drive", count: 27 },
    { id: "saved-shimmer", name: "Saved shimmer", filter: "favorites", count: 0 },
    { id: "imported-files", name: "Imported files", filter: "imported", count: 0 }
  ],
  resources: {
    providers: [
      { id: "local-db", name: "Auralis Local DB", type: "catalog", status: "connected" },
      { id: "generated-preview", name: "Generated Preview Engine", type: "playback", status: "ready" }
    ],
    moods: ["focus", "drive", "night"],
    equalizerPresets: [
      { id: "balanced", name: "Balanced", bands: [0, 0, 0, 0, 0] },
      { id: "bass", name: "Bass lift", bands: [5, 3, 0, -1, 1] },
      { id: "clarity", name: "Clarity", bands: [-1, 0, 2, 4, 3] }
    ],
    recommendationSignals: ["recent plays", "saved songs", "mood", "genre", "tempo", "energy"]
  },
  preferences: {
    theme: "dark",
    accent: "#67f0b7",
    glass: 42,
    crossfade: 4,
    quality: "Very high",
    suggestions: "balanced",
    autoplay: true,
    gapless: true,
    normalize: true,
    private: false,
    reducedMotion: false,
    compact: false,
    volume: 62
  },
  history: [],
  favorites: []
};

async function ensureDatabase() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbFile);
  } catch (error) {
    await writeDatabase(seedDatabase);
  }
}

async function readDatabase() {
  await ensureDatabase();
  const raw = await fs.readFile(dbFile, "utf8");
  return JSON.parse(raw);
}

async function writeDatabase(db) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbFile, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      throw new Error("Request body is too large");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function apiPayload(db) {
  return {
    tracks: db.tracks,
    playlists: db.playlists,
    resources: db.resources,
    preferences: db.preferences,
    history: db.history,
    favorites: db.favorites
  };
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const db = await readDatabase();
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "auralis-db-api",
      tracks: db.tracks.length,
      playlists: db.playlists.length,
      storage: path.relative(rootDir, dbFile)
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    sendJson(res, 200, apiPayload(db));
    return;
  }

  if (req.method === "GET" && pathname === "/api/tracks") {
    const query = (url.searchParams.get("q") || "").toLowerCase();
    const mood = url.searchParams.get("mood");
    const limit = Number(url.searchParams.get("limit") || db.tracks.length);
    let tracks = [...db.tracks];
    if (mood && mood !== "all") {
      tracks = tracks.filter((track) => track.mood === mood);
    }
    if (query) {
      tracks = tracks.filter((track) => [track.title, track.artist, track.album, track.genre, track.mood].join(" ").toLowerCase().includes(query));
    }
    sendJson(res, 200, { tracks: tracks.slice(0, limit) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/resources") {
    sendJson(res, 200, { resources: db.resources });
    return;
  }

  if (req.method === "PATCH" && pathname === "/api/preferences") {
    const body = await readBody(req);
    db.preferences = { ...db.preferences, ...body };
    await writeDatabase(db);
    sendJson(res, 200, { preferences: db.preferences });
    return;
  }

  if (req.method === "POST" && pathname === "/api/history") {
    const body = await readBody(req);
    db.history = [...db.history, { ...body, at: body.at || Date.now() }].slice(-100);
    await writeDatabase(db);
    sendJson(res, 201, { history: db.history });
    return;
  }

  if ((req.method === "PUT" || req.method === "DELETE") && pathname.startsWith("/api/favorites/")) {
    const id = decodeURIComponent(pathname.replace("/api/favorites/", ""));
    const favorites = new Set(db.favorites);
    if (req.method === "PUT") {
      favorites.add(id);
    } else {
      favorites.delete(id);
    }
    db.favorites = [...favorites];
    await writeDatabase(db);
    sendJson(res, 200, { favorites: db.favorites });
    return;
  }

  if (req.method === "POST" && pathname === "/api/tracks") {
    const body = await readBody(req);
    const id = body.id || `api-${Date.now()}`;
    const track = {
      id,
      title: body.title || "Untitled track",
      artist: body.artist || "Unknown artist",
      album: body.album || "API imports",
      duration: Number(body.duration || 180),
      genre: body.genre || "Imported",
      mood: body.mood || "focus",
      energy: Number(body.energy || 50),
      tempo: Number(body.tempo || 100),
      color: body.color || ["#67f0b7", "#7cc7ff", "#111514"],
      freq: Number(body.freq || 180),
      sourceType: body.sourceType || "api",
      sourceUrl: body.sourceUrl || "",
      lyrics: body.lyrics || ["Imported through the API", "Ready for the local engine"]
    };
    db.tracks.unshift(track);
    await writeDatabase(db);
    sendJson(res, 201, { track });
    return;
  }

  sendError(res, 404, "API route not found");
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(rootDir, `.${requestedPath}`);

  if (!filePath.startsWith(rootDir)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch (error) {
    sendError(res, 404, "File not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendError(res, 500, error.message || "Server error");
  }
});

server.listen(port, () => {
  console.log(`Auralis running at http://localhost:${port}`);
  console.log(`Database API ready at http://localhost:${port}/api/health`);
});
