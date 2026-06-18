const demoTracks = [
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
    lyrics: ["Pulse theory rising", "Hands above the sound", "Nothing here is static", "When the lights come down"]
  }
];

const fallbackPlaylists = [
  { name: "Daily glass", filter: "all", count: 42 },
  { name: "Late night focus", filter: "focus", count: 18 },
  { name: "Drive pulse", filter: "drive", count: 27 },
  { name: "Saved shimmer", filter: "favorites", count: 0 },
  { name: "Imported files", filter: "imported", count: 0 }
];

const fallbackResources = {
  providers: [
    { id: "static-catalog", name: "Static fallback catalog", type: "catalog", status: "offline" },
    { id: "generated-preview", name: "Generated Preview Engine", type: "playback", status: "ready" }
  ],
  moods: ["focus", "drive", "night"],
  equalizerPresets: [
    { id: "balanced", name: "Balanced", bands: [0, 0, 0, 0, 0] },
    { id: "bass", name: "Bass lift", bands: [5, 3, 0, -1, 1] },
    { id: "clarity", name: "Clarity", bands: [-1, 0, 2, 4, 3] }
  ],
  recommendationSignals: ["recent plays", "saved songs", "mood", "genre", "tempo", "energy"]
};

const defaultPrefs = {
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
};

const storage = {
  prefs: "auralis.preferences",
  history: "auralis.history",
  favorites: "auralis.favorites"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  tracks: [...demoTracks],
  playlists: [...fallbackPlaylists],
  resources: fallbackResources,
  currentId: demoTracks[0].id,
  progress: 0,
  playing: false,
  shuffle: false,
  repeat: "off",
  queue: demoTracks.slice(1, 7).map((track) => track.id),
  view: "home",
  filter: "all",
  query: "",
  apiStatus: "offline fallback",
  prefs: loadPrefs(),
  favorites: new Set(loadJson(storage.favorites, [])),
  history: loadJson(storage.history, [])
};

const databaseApi = {
  connected: false,
  async request(path, options = {}) {
    if (window.location.protocol === "file:") {
      throw new Error("Database API needs the local server");
    }

    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    return response.status === 204 ? {} : response.json();
  },
  async bootstrap() {
    try {
      const payload = await this.request("/api/bootstrap");
      this.connected = true;
      return payload;
    } catch (error) {
      this.connected = false;
      return null;
    }
  },
  async savePreferences(preferences) {
    if (!this.connected) return;
    try {
      await this.request("/api/preferences", { method: "PATCH", body: JSON.stringify(preferences) });
    } catch (error) {
      this.connected = false;
    }
  },
  async saveFavorite(id, saved) {
    if (!this.connected) return;
    try {
      await this.request(`/api/favorites/${encodeURIComponent(id)}`, { method: saved ? "PUT" : "DELETE" });
    } catch (error) {
      this.connected = false;
    }
  },
  async recordHistory(entry) {
    if (!this.connected) return;
    try {
      await this.request("/api/history", { method: "POST", body: JSON.stringify(entry) });
    } catch (error) {
      this.connected = false;
    }
  },
  async addTrack(track) {
    if (!this.connected) return null;
    try {
      return await this.request("/api/tracks", { method: "POST", body: JSON.stringify(track) });
    } catch (error) {
      this.connected = false;
      return null;
    }
  }
};

const audio = new Audio();
audio.preload = "metadata";
audio.volume = state.prefs.volume / 100;

const engineState = {
  progressTimer: null,
  lastRecordedId: null,
  output: "generated-preview"
};

const synth = {
  ctx: null,
  osc: null,
  harmony: null,
  gain: null,
  filter: null,
  start(track) {
    this.stop();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = this.ctx || new AudioContextClass();
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    this.osc = this.ctx.createOscillator();
    this.harmony = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.filter = this.ctx.createBiquadFilter();

    this.osc.type = "sine";
    this.harmony.type = "triangle";
    this.osc.frequency.value = track.freq;
    this.harmony.frequency.value = track.freq * 1.5;
    this.filter.type = "lowpass";
    this.filter.frequency.value = 620 + track.energy * 9;
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(getDemoGain(), now + 0.08);

    this.osc.connect(this.filter);
    this.harmony.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.osc.start();
    this.harmony.start();
  },
  stop() {
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setTargetAtTime(0, now, 0.035);
    }
    [this.osc, this.harmony].forEach((node) => {
      if (node) {
        try {
          node.stop();
        } catch (error) {
          // Stopping a finished oscillator is harmless.
        }
      }
    });
    this.osc = null;
    this.harmony = null;
    this.gain = null;
    this.filter = null;
  },
  setVolume() {
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(getDemoGain(), this.ctx.currentTime, 0.04);
    }
  }
};

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function loadPrefs() {
  return { ...defaultPrefs, ...loadJson(storage.prefs, {}) };
}

function savePrefs() {
  localStorage.setItem(storage.prefs, JSON.stringify(state.prefs));
  databaseApi.savePreferences(state.prefs);
}

function saveFavorites() {
  localStorage.setItem(storage.favorites, JSON.stringify([...state.favorites]));
}

function saveHistory() {
  localStorage.setItem(storage.history, JSON.stringify(state.history.slice(-80)));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function getTrack(id = state.currentId) {
  return state.tracks.find((track) => track.id === id) || state.tracks[0];
}

function coverStyle(track) {
  return `--c1:${track.color[0]}; --c2:${track.color[1]}; --c3:${track.color[2]}; --cover-tilt:${(track.energy % 18) - 9}deg`;
}

function icon(name) {
  return `<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
}

function getDemoGain() {
  const normalized = state.prefs.normalize ? 0.055 : 0.075;
  return (state.prefs.volume / 100) * normalized;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function applyPrefs() {
  const theme = state.prefs.theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : state.prefs.theme;
  const [r, g, b] = hexToRgb(state.prefs.accent);
  const glassValue = state.prefs.glass / 100;

  document.body.dataset.theme = theme;
  document.body.dataset.density = state.prefs.compact ? "compact" : "comfortable";
  document.body.dataset.reducedMotion = state.prefs.reducedMotion ? "true" : "false";
  document.documentElement.style.setProperty("--accent", state.prefs.accent);
  document.documentElement.style.setProperty("--accent-rgb", `${r} ${g} ${b}`);
  document.documentElement.style.setProperty("--glass-opacity", glassValue.toFixed(2));
  document.documentElement.style.setProperty("--glass-blur", `${18 + state.prefs.glass / 2}px`);
  audio.volume = state.prefs.volume / 100;
  synth.setVolume();
}

function recommendationScore(track) {
  const current = getTrack();
  const recent = state.history.slice(-18);
  const plays = recent.filter((item) => item.id === track.id).length;
  let score = 8 + track.energy / 20;

  if (track.id === current.id) score -= 30;
  if (track.mood === current.mood) score += 16;
  if (track.genre === current.genre) score += 12;
  score += Math.max(0, 14 - Math.abs(track.tempo - current.tempo) / 4);
  score += Math.max(0, 10 - Math.abs(track.energy - current.energy) / 8);

  recent.forEach((entry, index) => {
    const played = getTrack(entry.id);
    const recency = (index + 1) / recent.length;
    if (played.mood === track.mood) score += 10 * recency;
    if (played.genre === track.genre) score += 8 * recency;
    score += Math.max(0, 7 - Math.abs(played.tempo - track.tempo) / 12) * recency;
  });

  if (state.favorites.has(track.id)) score += state.prefs.suggestions === "favorites" ? 20 : 7;
  if (state.prefs.suggestions === "mood" && track.mood === current.mood) score += 18;
  if (state.prefs.suggestions === "fresh") score -= plays * 12;
  if (state.prefs.suggestions === "balanced") score -= plays * 4;

  return score;
}

function recommendTracks(limit = 8) {
  return state.tracks
    .map((track) => ({ track, score: recommendationScore(track) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.track);
}

function filteredTracks() {
  const q = state.query.trim().toLowerCase();
  let tracks = [...state.tracks];

  if (state.view === "library") {
    tracks = tracks.filter((track) => state.favorites.has(track.id) || track.imported);
  }
  if (state.view === "radio") {
    tracks = recommendTracks(12);
  }
  if (state.filter !== "all") {
    if (state.filter === "favorites") {
      tracks = tracks.filter((track) => state.favorites.has(track.id));
    } else if (state.filter === "imported") {
      tracks = tracks.filter((track) => track.imported);
    } else {
      tracks = tracks.filter((track) => track.mood === state.filter);
    }
  }
  if (q) {
    tracks = tracks.filter((track) => {
      return [track.title, track.artist, track.album, track.genre, track.mood]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }
  return tracks;
}

function renderPlaylists() {
  const importedCount = state.tracks.filter((track) => track.imported).length;
  const favoriteCount = state.favorites.size;
  $("#playlistList").innerHTML = state.playlists.map((playlist) => {
    const count = playlist.filter === "favorites" ? favoriteCount : playlist.filter === "imported" ? importedCount : playlist.count;
    return `
      <button class="playlist-item" type="button" data-playlist-filter="${playlist.filter}">
        <span class="playlist-name">${playlist.name}</span>
        <span class="playlist-count">${count}</span>
      </button>
    `;
  }).join("");
}

function renderRecommendations() {
  const recommendations = recommendTracks(6);
  $("#recommendationGrid").innerHTML = recommendations.map((track) => `
    <button class="album-tile" type="button" data-track-id="${track.id}">
      <div class="cover-thumb" style="${coverStyle(track)}"></div>
      <strong>${track.title}</strong>
      <span>${track.artist}</span>
    </button>
  `).join("");
}

function renderTrackList() {
  const tracks = filteredTracks();
  const title = state.view === "library" ? "Library" : state.view === "radio" ? "Smart radio" : state.view === "search" ? "Search results" : "Songs";
  const kicker = state.filter === "all" ? "All music" : state.filter;
  $("#trackListTitle").textContent = title;
  $("#viewKicker").textContent = kicker;

  if (!tracks.length) {
    $("#trackList").innerHTML = `<div class="empty-state">No songs match this view yet.</div>`;
    return;
  }

  $("#trackList").innerHTML = tracks.map((track, index) => `
    <div class="track-row ${track.id === state.currentId ? "active" : ""}" role="button" tabindex="0" data-track-id="${track.id}">
      <span class="track-index">${index + 1}</span>
      <div class="cover-thumb" style="${coverStyle(track)}"></div>
      <div class="track-copy">
        <strong>${track.title}</strong>
        <span>${track.artist} - ${track.album}</span>
      </div>
      <span class="track-genre">${track.genre}</span>
      <span class="track-energy">${track.energy}%</span>
      <button class="mini-action ${state.favorites.has(track.id) ? "active" : ""}" type="button" data-favorite-id="${track.id}" title="Save song" aria-label="Save ${track.title}">
        ${icon("i-heart")}
      </button>
      <span class="track-time">${formatTime(track.duration)}</span>
    </div>
  `).join("");
}

function renderNowPlaying() {
  const track = getTrack();
  $("#heroTitle").textContent = state.history.length > 1 ? `${track.mood} radio` : "Glass room radio";
  $("#heroMeta").textContent = `${track.artist}, ${track.genre}, ${track.energy}% energy, ${track.tempo} bpm.`;
  $("#heroArt").setAttribute("style", coverStyle(track));
  $("#nowTitle").textContent = track.title;
  $("#nowArtist").textContent = track.artist;
  $("#nowAlbum").textContent = track.album;
  $("#miniTitle").textContent = track.title;
  $("#miniArtist").textContent = track.artist;
  $("#largeCover").setAttribute("style", coverStyle(track));
  $("#miniCover").setAttribute("style", coverStyle(track));
  $("#nowFavorite").classList.toggle("active", state.favorites.has(track.id));
  $("#playIcon").innerHTML = `<use href="#${state.playing ? "i-pause" : "i-play"}"></use>`;
  $("#playButton").setAttribute("aria-label", state.playing ? "Pause" : "Play");
  $("#playButton").setAttribute("title", state.playing ? "Pause" : "Play");
  $("#shuffleButton").classList.toggle("active", state.shuffle);
  $("#repeatButton").classList.toggle("active", state.repeat !== "off");
  document.body.classList.toggle("is-playing", state.playing);
  renderLyrics();
}

function renderLyrics() {
  const track = getTrack();
  const activeIndex = Math.min(track.lyrics.length - 1, Math.floor((state.progress / Math.max(1, track.duration)) * track.lyrics.length));
  $("#lyricWindow").innerHTML = track.lyrics.map((line, index) => `
    <p class="lyric-line ${index === activeIndex ? "active" : ""}">${line}</p>
  `).join("");
}

function renderMeter() {
  const track = getTrack();
  $("#signalMeter").innerHTML = Array.from({ length: 28 }, (_, index) => {
    const seed = Math.sin(index * 1.7 + track.energy / 12) * 26;
    const level = Math.max(18, Math.min(98, 44 + seed + track.energy / 2));
    return `<span class="meter-bar" style="--level:${level}; --i:${index}"></span>`;
  }).join("");
}

function renderQueue() {
  const queued = state.queue.map(getTrack).filter(Boolean).slice(0, 5);
  $("#queueList").innerHTML = queued.map((track) => `
    <button class="queue-item" type="button" data-track-id="${track.id}">
      <div class="cover-thumb" style="${coverStyle(track)}"></div>
      <span class="queue-copy">
        <strong>${track.title}</strong>
        <span>${track.artist}</span>
      </span>
      <time>${formatTime(track.duration)}</time>
    </button>
  `).join("");
}

function renderResourcePanel() {
  const providers = state.resources.providers || [];
  const presets = state.resources.equalizerPresets || [];
  const signals = state.resources.recommendationSignals || [];
  const connected = databaseApi.connected;

  $("#apiStatusTitle").textContent = connected ? "Connected to Auralis DB" : "Offline fallback";
  $("#apiStatusMeta").textContent = connected
    ? `${state.tracks.length} tracks, ${state.playlists.length} playlists, ${signals.length} recommendation signals, and ${presets.length} EQ presets are loaded from the API.`
    : "Start the local server to load catalog, resources, preferences, history, and favorites from the API.";

  const pills = [
    { label: "Catalog", value: connected ? `${state.tracks.length} API tracks` : `${state.tracks.length} local tracks` },
    { label: "Engine", value: musicEngine.snapshot.output },
    { label: "Signals", value: signals.slice(0, 3).join(", ") || "local scoring" }
  ];

  if (providers[0]) {
    pills[0].value = `${providers[0].name}`;
  }

  $("#resourceList").innerHTML = pills.map((pill) => `
    <div class="resource-pill">
      <strong>${pill.label}</strong>
      <span>${pill.value}</span>
    </div>
  `).join("");
}

function renderProgress() {
  const track = getTrack();
  const percent = Math.min(1, state.progress / track.duration);
  $("#elapsedTime").textContent = formatTime(state.progress);
  $("#durationTime").textContent = formatTime(track.duration);
  $("#seekBar").value = Math.round(percent * 1000);
  renderLyrics();
}

function renderSuggestionsPopover() {
  const popover = $("#suggestionPopover");
  const q = state.query.trim();
  if (!q) {
    popover.hidden = true;
    popover.innerHTML = "";
    return;
  }
  const matches = filteredTracks().slice(0, 5);
  if (!matches.length) {
    popover.hidden = true;
    return;
  }
  popover.hidden = false;
  popover.innerHTML = matches.map((track) => `
    <button class="suggestion-item" type="button" data-track-id="${track.id}">
      <div class="cover-thumb" style="${coverStyle(track)}"></div>
      <span class="queue-copy">
        <strong>${track.title}</strong>
        <span>${track.artist}</span>
      </span>
      <span>${track.mood}</span>
    </button>
  `).join("");
}

function renderPreferences() {
  $$("[data-theme-option]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === state.prefs.theme);
  });
  $$(".swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.accent.toLowerCase() === state.prefs.accent.toLowerCase());
  });
  $("#accentPicker").value = state.prefs.accent;
  $("#glassSlider").value = state.prefs.glass;
  $("#crossfadeSlider").value = state.prefs.crossfade;
  $("#qualitySelect").value = state.prefs.quality;
  $("#suggestionSelect").value = state.prefs.suggestions;
  $("#autoplayToggle").checked = state.prefs.autoplay;
  $("#gaplessToggle").checked = state.prefs.gapless;
  $("#normalizeToggle").checked = state.prefs.normalize;
  $("#privateToggle").checked = state.prefs.private;
  $("#motionToggle").checked = state.prefs.reducedMotion;
  $("#compactToggle").checked = state.prefs.compact;
  $("#volumeSlider").value = state.prefs.volume;
}

function renderAll() {
  renderPlaylists();
  renderRecommendations();
  renderTrackList();
  renderNowPlaying();
  renderMeter();
  renderQueue();
  renderResourcePanel();
  renderProgress();
  renderPreferences();
}

function setView(view) {
  state.view = view;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  if (view === "search") {
    $("#searchInput").focus();
  }
  renderTrackList();
}

function setFilter(filter) {
  state.filter = filter;
  $$(".chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === filter));
  renderTrackList();
}

function recordPlay(track) {
  if (state.prefs.private || engineState.lastRecordedId === track.id) return;
  const entry = { id: track.id, at: Date.now(), mood: track.mood, genre: track.genre };
  state.history.push(entry);
  state.history = state.history.slice(-80);
  saveHistory();
  databaseApi.recordHistory(entry);
  engineState.lastRecordedId = track.id;
}

function playTrack(id, keepProgress = false) {
  const track = getTrack(id);
  state.currentId = track.id;
  state.progress = keepProgress ? state.progress : 0;
  state.queue = state.queue.filter((trackId) => trackId !== id);
  const recs = recommendTracks(8).map((item) => item.id).filter((trackId) => trackId !== id && !state.queue.includes(trackId));
  state.queue = [...state.queue, ...recs].slice(0, 8);
  startPlayback();
  renderAll();
}

function startPlayback() {
  const track = getTrack();
  clearInterval(engineState.progressTimer);
  state.playing = true;
  recordPlay(track);

  if (track.url) {
    engineState.output = "audio-element";
    synth.stop();
    if (audio.src !== track.url) {
      audio.src = track.url;
    }
    audio.currentTime = Math.min(state.progress, track.duration - 0.2);
    audio.play().catch(() => {
      state.playing = false;
      renderNowPlaying();
    });
  } else {
    engineState.output = "generated-preview";
    audio.pause();
    synth.start(track);
  }

  engineState.progressTimer = setInterval(tickProgress, 500);
  renderNowPlaying();
}

function pausePlayback() {
  state.playing = false;
  audio.pause();
  synth.stop();
  clearInterval(engineState.progressTimer);
  renderNowPlaying();
}

function togglePlayback() {
  if (state.playing) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function tickProgress() {
  const track = getTrack();
  if (track.url) {
    state.progress = audio.currentTime || state.progress;
  } else {
    state.progress += 0.5;
  }
  if (state.progress >= track.duration - 0.2) {
    handleEnded();
    return;
  }
  renderProgress();
}

function handleEnded() {
  const track = getTrack();
  state.progress = 0;
  if (state.repeat === "one") {
    playTrack(track.id);
    return;
  }
  if (state.prefs.autoplay || state.queue.length) {
    nextTrack();
  } else {
    pausePlayback();
    renderProgress();
  }
}

function nextTrack() {
  let nextId = state.queue.shift();
  if (!nextId) {
    const tracks = state.shuffle ? recommendTracks(state.tracks.length) : state.tracks;
    const index = tracks.findIndex((track) => track.id === state.currentId);
    nextId = tracks[(index + 1 + tracks.length) % tracks.length].id;
  }
  engineState.lastRecordedId = null;
  playTrack(nextId);
}

function prevTrack() {
  if (state.progress > 4) {
    state.progress = 0;
    if (getTrack().url) audio.currentTime = 0;
    renderProgress();
    return;
  }
  const tracks = state.tracks;
  const index = tracks.findIndex((track) => track.id === state.currentId);
  const prevId = tracks[(index - 1 + tracks.length) % tracks.length].id;
  engineState.lastRecordedId = null;
  playTrack(prevId);
}

function seekTo(value) {
  const track = getTrack();
  state.progress = (value / 1000) * track.duration;
  if (track.url) {
    audio.currentTime = state.progress;
  }
  renderProgress();
}

function toggleFavorite(id) {
  let saved;
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    saved = false;
  } else {
    state.favorites.add(id);
    saved = true;
  }
  saveFavorites();
  databaseApi.saveFavorite(id, saved);
  renderAll();
}

async function importFiles(files) {
  const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/"));
  for (const file of audioFiles) {
    const url = URL.createObjectURL(file);
    const duration = await readAudioDuration(url);
    const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
    const track = {
      id: `local-${crypto.randomUUID()}`,
      title,
      artist: "Local file",
      album: "Imported",
      duration,
      genre: "Local audio",
      mood: "focus",
      energy: 55,
      tempo: 96,
      color: ["#d9ed92", "#7cc7ff", "#151914"],
      freq: 170,
      imported: true,
      url,
      lyrics: ["Local track", "Imported to Auralis", "Ready in your library", "Playing from this device"]
    };
    state.tracks.unshift(track);
    state.queue.unshift(track.id);
    databaseApi.addTrack({
      ...track,
      url: undefined,
      sourceType: "local-upload",
      lyrics: ["Imported metadata saved", "Playback uses this device while the tab stays open"]
    });
  }
  state.view = "library";
  renderAll();
}

function readAudioDuration(url) {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? probe.duration : 180);
    probe.onerror = () => resolve(180);
  });
}

function makeSmartMix() {
  const mix = recommendTracks(10).map((track) => track.id);
  state.queue = mix.filter((id) => id !== state.currentId);
  if (mix[0]) {
    playTrack(mix[0]);
  }
}

const musicEngine = {
  get snapshot() {
    return {
      currentId: state.currentId,
      playing: state.playing,
      progress: state.progress,
      queue: [...state.queue],
      shuffle: state.shuffle,
      repeat: state.repeat,
      output: engineState.output,
      volume: state.prefs.volume,
      crossfade: state.prefs.crossfade
    };
  },
  playTrack,
  play: startPlayback,
  pause: pausePlayback,
  toggle: togglePlayback,
  next: nextTrack,
  previous: prevTrack,
  seek: seekTo,
  makeSmartMix,
  setVolume(value) {
    state.prefs.volume = Number(value);
    audio.volume = state.prefs.volume / 100;
    synth.setVolume();
    savePrefs();
  },
  toggleShuffle() {
    state.shuffle = !state.shuffle;
    renderNowPlaying();
  },
  rotateRepeat() {
    state.repeat = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
    renderNowPlaying();
  }
};

window.AuralisMusicEngine = musicEngine;

function wireEvents() {
  document.addEventListener("click", (event) => {
    const favoriteButton = event.target.closest("[data-favorite-id]");
    if (favoriteButton) {
      event.stopPropagation();
      toggleFavorite(favoriteButton.dataset.favoriteId);
      return;
    }

    const trackTarget = event.target.closest("[data-track-id]");
    if (trackTarget) {
      musicEngine.playTrack(trackTarget.dataset.trackId);
      $("#suggestionPopover").hidden = true;
      return;
    }

    const nav = event.target.closest("[data-view]");
    if (nav) {
      setView(nav.dataset.view);
      return;
    }

    const chip = event.target.closest("[data-filter]");
    if (chip) {
      setFilter(chip.dataset.filter);
      return;
    }

    const playlist = event.target.closest("[data-playlist-filter]");
    if (playlist) {
      setView(playlist.dataset.playlistFilter === "imported" || playlist.dataset.playlistFilter === "favorites" ? "library" : "home");
      setFilter(playlist.dataset.playlistFilter);
    }
  });

  document.addEventListener("keydown", (event) => {
    const row = event.target.closest(".track-row");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      musicEngine.playTrack(row.dataset.trackId);
    }
  });

  $("#playButton").addEventListener("click", () => musicEngine.toggle());
  $("#nextButton").addEventListener("click", () => musicEngine.next());
  $("#prevButton").addEventListener("click", () => musicEngine.previous());
  $("#shuffleButton").addEventListener("click", () => musicEngine.toggleShuffle());
  $("#repeatButton").addEventListener("click", () => musicEngine.rotateRepeat());
  $("#nowFavorite").addEventListener("click", () => toggleFavorite(state.currentId));
  $("#seekBar").addEventListener("input", (event) => musicEngine.seek(Number(event.target.value)));
  $("#volumeSlider").addEventListener("input", (event) => musicEngine.setVolume(event.target.value));
  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value;
    state.view = "search";
    setView("search");
    renderSuggestionsPopover();
  });
  $("#refreshSuggestions").addEventListener("click", () => {
    state.history = [...state.history.slice(-12)].sort(() => Math.random() - 0.5);
    renderRecommendations();
  });
  $("#smartMixButton").addEventListener("click", () => musicEngine.makeSmartMix());
  $("#openQueueButton").addEventListener("click", () => {
    $("#settingsButton").focus();
    document.querySelector(".now-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("#importButton").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", (event) => importFiles(event.target.files));
  $("#settingsButton").addEventListener("click", openPreferences);
  $("#closePreferences").addEventListener("click", closePreferences);

  $$("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.theme = button.dataset.themeOption;
      savePrefs();
      applyPrefs();
      renderPreferences();
    });
  });
  $$(".swatch").forEach((button) => {
    button.addEventListener("click", () => updateAccent(button.dataset.accent));
  });
  $("#accentPicker").addEventListener("input", (event) => updateAccent(event.target.value));
  $("#glassSlider").addEventListener("input", (event) => updatePrefNumber("glass", event.target.value));
  $("#crossfadeSlider").addEventListener("input", (event) => updatePrefNumber("crossfade", event.target.value));
  $("#qualitySelect").addEventListener("change", (event) => updatePref("quality", event.target.value));
  $("#suggestionSelect").addEventListener("change", (event) => {
    updatePref("suggestions", event.target.value);
    renderRecommendations();
    renderQueue();
  });
  $("#autoplayToggle").addEventListener("change", (event) => updatePref("autoplay", event.target.checked));
  $("#gaplessToggle").addEventListener("change", (event) => updatePref("gapless", event.target.checked));
  $("#normalizeToggle").addEventListener("change", (event) => updatePref("normalize", event.target.checked));
  $("#privateToggle").addEventListener("change", (event) => updatePref("private", event.target.checked));
  $("#motionToggle").addEventListener("change", (event) => updatePref("reducedMotion", event.target.checked));
  $("#compactToggle").addEventListener("change", (event) => updatePref("compact", event.target.checked));

  audio.addEventListener("ended", handleEnded);
  audio.addEventListener("loadedmetadata", () => {
    const track = getTrack();
    if (track.url && Number.isFinite(audio.duration)) {
      track.duration = audio.duration;
      renderProgress();
      renderTrackList();
    }
  });
}

function updateAccent(value) {
  state.prefs.accent = value;
  savePrefs();
  applyPrefs();
  renderPreferences();
}

function updatePrefNumber(key, value) {
  state.prefs[key] = Number(value);
  savePrefs();
  applyPrefs();
}

function updatePref(key, value) {
  state.prefs[key] = value;
  savePrefs();
  applyPrefs();
  renderPreferences();
}

function openPreferences() {
  $("#preferencesPanel").classList.add("open");
  $("#preferencesPanel").setAttribute("aria-hidden", "false");
}

function closePreferences() {
  $("#preferencesPanel").classList.remove("open");
  $("#preferencesPanel").setAttribute("aria-hidden", "true");
}

function normalizeTrack(track) {
  return {
    ...track,
    duration: Number(track.duration || 180),
    energy: Number(track.energy || 50),
    tempo: Number(track.tempo || 100),
    freq: Number(track.freq || 180),
    color: Array.isArray(track.color) ? track.color : ["#67f0b7", "#7cc7ff", "#111514"],
    lyrics: Array.isArray(track.lyrics) && track.lyrics.length ? track.lyrics : ["Ready in Auralis", "Loaded from the resource API"]
  };
}

async function hydrateFromDatabaseApi() {
  const payload = await databaseApi.bootstrap();
  if (!payload) {
    state.apiStatus = "offline fallback";
    return;
  }

  state.tracks = (payload.tracks || demoTracks).map(normalizeTrack);
  state.playlists = payload.playlists || fallbackPlaylists;
  state.resources = payload.resources || fallbackResources;
  state.prefs = { ...defaultPrefs, ...state.prefs, ...(payload.preferences || {}) };
  state.favorites = new Set(payload.favorites || []);
  state.history = payload.history || [];
  state.currentId = state.tracks.some((track) => track.id === state.currentId) ? state.currentId : state.tracks[0]?.id;
  state.queue = state.tracks.filter((track) => track.id !== state.currentId).slice(0, 8).map((track) => track.id);
  state.apiStatus = "connected";

  localStorage.setItem(storage.prefs, JSON.stringify(state.prefs));
  localStorage.setItem(storage.favorites, JSON.stringify([...state.favorites]));
  localStorage.setItem(storage.history, JSON.stringify(state.history));
}

async function initializeApp() {
  applyPrefs();
  await hydrateFromDatabaseApi();
  applyPrefs();
  wireEvents();
  renderAll();
}

initializeApp();
