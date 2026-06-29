/**
 * middleware/auth.js
 *
 * requireAuth — JWT access-token verification middleware.
 *
 * Reads the Bearer token from the Authorization header.
 * On success:  attaches req.userId (string ObjectId) and req.userRole to the request.
 * On failure:  returns 401 (missing/malformed) or 403 (expired).
 *
 * Usage:
 *   app.get('/api/protected', requireAuth, handler);
 */
const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.SESSION_SECRET || 'auralis-access-secret-change-me';

/**
 * Middleware: verify JWT access token.
 * Token must be supplied as:  Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    req.userId   = payload.sub;   // MongoDB ObjectId string
    req.userRole = payload.role || 'user';
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token' });
  }
}

/**
 * Middleware: optionally verify JWT — attaches req.userId if valid,
 * but does NOT block the request if missing/invalid.
 * Useful for routes that behave differently for auth vs anon users.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), ACCESS_SECRET);
      req.userId   = payload.sub;
      req.userRole = payload.role || 'user';
    } catch (_) {
      // silently ignore — req.userId stays undefined
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
