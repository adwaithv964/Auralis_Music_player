const mongoose = require("mongoose");

// Full snapshot of a track stored in history (metadata only, no stream URLs)
const HistoryEntrySchema = new mongoose.Schema({
  id:         { type: String, required: true },
  title:      { type: String, default: "" },
  artist:     { type: String, default: "" },
  album:      { type: String, default: "" },
  artworkUrl: { type: String, default: "" },
  duration:   { type: Number, default: 0 },
  genre:      { type: String, default: "" },
  language:   { type: String, default: "" },
  sourceType: { type: String, default: "itunes" },
  playedAt:   { type: Date, default: Date.now },
}, { _id: false });

/**
 * Full metadata snapshot stored when a user likes a track.
 * Mirrors HistoryEntrySchema but keyed by likedAt.
 * Storing the snapshot ensures Liked Songs display works regardless of
 * which external tracks happen to be loaded in the current session.
 */
const LikedSongSchema = new mongoose.Schema({
  id:         { type: String, required: true },
  title:      { type: String, default: "" },
  artist:     { type: String, default: "" },
  album:      { type: String, default: "" },
  artworkUrl: { type: String, default: "" },
  duration:   { type: Number, default: 0 },
  genre:      { type: String, default: "" },
  sourceType: { type: String, default: "itunes" },
  likedAt:    { type: Date,   default: Date.now },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  // ── Identity: links to UserAuth document ──────────────────────
  // This is the foreign key that binds preferences + history to an account.
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      "UserAuth",
    required: true,
    unique:   true,
    index:    true,
  },
  username: { type: String, default: "" }, // display copy, updated on login

  // ── Favorites ─────────────────────────────────────────────────
  // Fast ID-only list for O(1) isFav checks (heart icon).
  favorites: [{ type: String }],

  // ── Liked Songs (full snapshots) ──────────────────────────────
  // Full track metadata stored at like-time so Liked Songs page
  // always displays correctly, independent of the current session's
  // loaded external tracks pool.
  likedSongs: { type: [LikedSongSchema], default: [] },

  // ── Play history (last 100 full snapshots, newest first) ──────
  history: {
    type: [HistoryEntrySchema],
    default: [],
  },

  // ── Library ───────────────────────────────────────────────────
  library: {
    savedTrackIds:    [String],
    importedTrackIds: [String],
    externalTrackIds: [String],
    recentlyAdded:    [{ id: String, source: String, at: Number }],
  },

  // ── Preferences ───────────────────────────────────────────────
  preferences: {
    theme:         { type: String,  default: "dark" },
    accent:        { type: String,  default: "#67f0b7" },
    glass:         { type: Number,  default: 42 },
    crossfade:     { type: Number,  default: 4 },
    quality:       { type: String,  default: "Very high" },
    suggestions:   { type: String,  default: "balanced" },
    autoplay:      { type: Boolean, default: true },
    gapless:       { type: Boolean, default: true },
    normalize:     { type: Boolean, default: true },
    private:       { type: Boolean, default: false },
    reducedMotion: { type: Boolean, default: false },
    compact:       { type: Boolean, default: false },
    volume:        { type: Number,  default: 62 },
    language:      { type: String,  default: "malayalam" },
    shuffle:       { type: Boolean, default: false },
    repeat:        { type: Boolean, default: false },
  },
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
