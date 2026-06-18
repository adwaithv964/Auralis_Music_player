const mongoose = require("mongoose");

const PlaylistSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  filter: { type: String, default: "all" },
  count: { type: Number, default: 0 },
  tracks: [{ type: String }] // Store string IDs to match old JSON structure for ease of porting
});

module.exports = mongoose.model("Playlist", PlaylistSchema);
