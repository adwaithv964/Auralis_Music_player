const mongoose = require("mongoose");

const TrackSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  artist: { type: String, required: true },
  album: { type: String, default: "Unknown Album" },
  duration: { type: Number, required: true },
  genre: { type: String, default: "Music" },
  mood: { type: String, default: "focus" },
  energy: { type: Number, default: 50 },
  tempo: { type: Number, default: 100 },
  color: { type: [String], default: ["#67f0b7", "#7cc7ff", "#111514"] },
  freq: { type: Number, default: 180 },
  sourceType: { type: String, default: "generated" },
  sourceProvider: { type: String },
  sourceUrl: { type: String },
  previewUrl: { type: String },
  artworkUrl: { type: String },
  lyrics: { type: [String], default: [] },
  imported: { type: Boolean, default: false }
});

module.exports = mongoose.model("Track", TrackSchema);
