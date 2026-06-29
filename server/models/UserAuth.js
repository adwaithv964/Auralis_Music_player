/**
 * models/UserAuth.js
 *
 * Security-sensitive user identity model.
 * Deliberately SEPARATE from User.js (preferences/history) to prevent
 * accidental serialisation of passwordHash in API responses.
 *
 * Fields
 * ──────
 *  email           — unique login identifier
 *  username        — display name (unique)
 *  passwordHash    — bcrypt hash, NEVER returned in API responses
 *  role            — 'user' | 'admin'
 *  profileImage    — URL string (Cloudflare R2 / any CDN)
 *  refreshTokens   — array of hashed refresh tokens (max 5, FIFO)
 */
const mongoose = require('mongoose');

const UserAuthSchema = new mongoose.Schema(
  {
    email: {
      type:     String,
      required: true,
      unique:   true,
      lowercase: true,
      trim:     true,
      match:    [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    username: {
      type:      String,
      required:  true,
      unique:    true,
      trim:      true,
      minlength: [2,  'Username must be at least 2 characters'],
      maxlength: [30, 'Username must be at most 30 characters'],
      match:     [/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, underscores, hyphens and dots'],
    },
    passwordHash: {
      type:     String,
      required: true,
      select:   false, // never returned in .find() unless explicitly requested
    },
    role: {
      type:    String,
      enum:    ['user', 'admin'],
      default: 'user',
    },
    profileImage: {
      type:    String,
      default: '',
    },
    // Hashed refresh tokens stored here for server-side revocation.
    // Max 5 kept — oldest rotated out (prevents unbounded growth).
    refreshTokens: {
      type:    [String],
      default: [],
      select:  false,
    },
  },
  { timestamps: true }
);

// timestamps: createdAt, updatedAt set automatically by mongoose
UserAuthSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.refreshTokens;
    return ret;
  },
});

module.exports = mongoose.model('UserAuth', UserAuthSchema);
