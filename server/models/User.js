const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, default: "defaultUser" },
  favorites: [{ type: String }],
  history: [{
    id: String,
    at: Number,
    mood: String,
    genre: String
  }],
  library: {
    savedTrackIds: [String],
    importedTrackIds: [String],
    externalTrackIds: [String],
    recentlyAdded: [{
      id: String,
      source: String,
      at: Number
    }]
  },
  preferences: {
    theme: { type: String, default: "dark" },
    accent: { type: String, default: "#67f0b7" },
    glass: { type: Number, default: 42 },
    crossfade: { type: Number, default: 4 },
    quality: { type: String, default: "Very high" },
    suggestions: { type: String, default: "balanced" },
    autoplay: { type: Boolean, default: true },
    gapless: { type: Boolean, default: true },
    normalize: { type: Boolean, default: true },
    private: { type: Boolean, default: false },
    reducedMotion: { type: Boolean, default: false },
    compact: { type: Boolean, default: false },
    volume: { type: Number, default: 62 }
  }
});

module.exports = mongoose.model("User", UserSchema);
