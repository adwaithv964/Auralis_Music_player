const mongoose = require("mongoose");

const TrackSnapshotSchema = new mongoose.Schema({
  id:         { type: String, required: true },
  title:      { type: String, default: "" },
  artist:     { type: String, default: "" },
  album:      { type: String, default: "" },
  artworkUrl: { type: String, default: "" },
  duration:   { type: Number, default: 0 },
  previewUrl: { type: String, default: "" },
  sourceType: { type: String, default: "itunes" },
  addedAt:    { type: Date,   default: Date.now },
}, { _id: false });

const PlaylistSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  description: { type: String, default: "" },
  color:       { type: String, default: "#1db954" },
  coverUrl:    { type: String, default: "" },
  filter:      { type: String, default: "all" },
  tracks:      { type: mongoose.Schema.Types.Mixed, default: [] }, // flexible — supports both old [String] and new [Object]
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

// Pre-save: update timestamps + auto-set coverUrl
PlaylistSchema.pre("save", async function () {
  this.updatedAt = new Date();

  // Normalise tracks: ensure it's always an array
  if (!Array.isArray(this.tracks)) this.tracks = [];

  // Auto-set cover from first track with artwork
  if (!this.coverUrl) {
    const first = this.tracks.find(t => t && t.artworkUrl);
    if (first) this.coverUrl = first.artworkUrl;
  }
});

// Helper method to get track count regardless of storage format
PlaylistSchema.methods.trackCount = function () {
  return Array.isArray(this.tracks) ? this.tracks.length : 0;
};

// toJSON: add a count field so the frontend always gets it
PlaylistSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.count = Array.isArray(ret.tracks) ? ret.tracks.length : 0;
    return ret;
  },
});

module.exports = mongoose.model("Playlist", PlaylistSchema);
