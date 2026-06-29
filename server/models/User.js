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
  favorites: [{ type: String }],

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
