# Phase 5 — User Personalization & Data Isolation

## Background

The current app has **no authentication system** — it uses a single hardcoded `"defaultUser"` MongoDB document shared by every browser tab and every person who visits the site. All data (playlists, favorites, history, preferences) is global. This phase implements a complete per-user system with JWT authentication and full data isolation.

## User Review Required

> [!IMPORTANT]
> **No JWT/bcrypt packages are currently installed.** The server `package.json` has only Express, Mongoose, CORS, dotenv, ytdl, des.js, and youtubei.js. Installing `jsonwebtoken`, `bcryptjs`, and `cookie-parser` is required. This will be done via `npm install` in the server directory.

> [!IMPORTANT]
> **The existing `Playlist` model has NO `userId` field.** Any existing playlists in MongoDB will become orphaned unless migrated. A migration script will be created but the existing data is likely test data.

> [!WARNING]
> **The UI will gain a Login/Register screen.** The existing UI design and all components remain unchanged — an auth gate (login/signup page) will be added on top. If the user is not authenticated, they will see a login screen instead of the app. This is the minimal UI change needed.

> [!IMPORTANT]
> **`getUser()` helper is used across all routes.** Every route that calls `getUser()` will be changed to call `requireAuth` middleware first and use `req.user` instead. The function signature changes from parameterless to reading from the JWT.

## Open Questions

> [!NOTE]
> The `.env` file currently has `SESSION_SECRET=change_this_to_a_random_secret_string`. The JWT signing will use this secret. **Action required: change this value to a random 64-char hex string before deploying.** I will add clear documentation in the env file but will not change the actual secret value (user should generate their own).

## Proposed Changes

---

### Backend — New Dependencies

#### [MODIFY] [package.json](file:///c:/Projects/Music_Player/package.json)

Add:
- `jsonwebtoken` — JWT access token signing/verification
- `bcryptjs` — password hashing (pure JS, no native binaries)
- `cookie-parser` — parse HTTP-only cookie for refresh token

---

### Backend — New Models

#### [NEW] `server/models/UserAuth.js`

A new, separate model from the existing `User.js` (which stores preferences/history). This model stores security-sensitive data:
- `email` (unique, indexed)
- `username` (unique, indexed)
- `passwordHash` (bcrypt, never exposed)
- `refreshTokens` (array of hashed tokens, max 5)
- `role` (`user` | `admin`, default `user`)
- `profileImage` (URL string)
- `createdAt`, `updatedAt` (timestamps)

> **Why separate from `User.js`?** The existing `User.js` is embedded-document-heavy (history arrays, preferences). Keeping auth fields separate follows the Single Responsibility principle and avoids accidentally serializing `passwordHash` in bootstrap responses.

---

### Backend — Auth Middleware

#### [NEW] `server/middleware/auth.js`

```js
// requireAuth(req, res, next)
// - reads Authorization header "Bearer <token>" or falling back to cookie
// - verifies JWT with ACCESS_TOKEN_SECRET
// - attaches req.userId, req.user to the request
// - returns 401 if missing/invalid, 403 if expired
```

---

### Backend — Auth Routes (added to server/index.js)

New endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create account; returns access token + sets refresh cookie |
| `POST` | `/api/auth/login` | Login; returns access token + sets refresh cookie |
| `POST` | `/api/auth/logout` | Clears refresh token cookie + invalidates server-side |
| `POST` | `/api/auth/refresh` | Uses HTTP-only cookie to issue new access token |
| `GET`  | `/api/auth/me`     | Returns current user profile (protected) |

Token strategy:
- **Access token**: 15-minute JWT, sent in response body, stored in memory (React state)
- **Refresh token**: 7-day JWT, stored as HTTP-only `Secure` cookie, also hashed and stored in DB for revocation

---

### Backend — Model Changes

#### [MODIFY] [Playlist.js](file:///c:/Projects/Music_Player/server/models/Playlist.js)
- Add `userId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserAuth', required: true, index: true }`
- Add compound index: `{ userId: 1, updatedAt: -1 }`

#### [MODIFY] [User.js](file:///c:/Projects/Music_Player/server/models/User.js)
- Add `userId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserAuth', required: true, unique: true, index: true }`
- Remove `username: "defaultUser"` default (replaced by userId reference)
- Keep all existing preference/history/library/favorites fields

---

### Backend — Route Changes (server/index.js)

#### Protected routes: all user-data endpoints

Every route that currently calls `getUser()` will:
1. Apply `requireAuth` middleware
2. Replace `getUser()` with `getUserByAuthId(req.userId)` — a new helper that finds-or-creates the `User` document by `userId` (ObjectId from JWT)

Affected routes:
- `GET /api/bootstrap`
- `PATCH /api/preferences`
- `POST /api/history`
- `GET /api/history`
- `PUT /api/favorites/:id`
- `DELETE /api/favorites/:id`
- `POST /api/library/tracks`
- `POST /api/excluded`
- `DELETE /api/excluded/:id`
- `GET /api/playlists`
- `POST /api/playlists`
- `GET /api/playlists/:id`
- `PATCH /api/playlists/:id`
- `DELETE /api/playlists/:id`
- `POST /api/playlists/:id/tracks`
- `DELETE /api/playlists/:id/tracks/:trackId`

#### Ownership enforcement on playlists:
Every playlist read/write will check `playlist.userId.equals(req.userId)` and return `403` if mismatched.

#### Public routes (no auth needed):
- `GET /api/external/search`
- `GET /api/trending`
- `GET /api/youtube/resolve`
- `GET /api/saavn/stream`
- `GET /api/youtube/stream`
- `GET /api/artwork`
- `GET /api/stream`
- `GET /api/health`

---

### Backend — DB Guard update

Add `/api/auth` to `DB_ROUTES` so auth endpoints also wait for DB readiness.

---

### Frontend — New Auth Context

#### [NEW] `client/src/context/AuthContext.jsx`

Owns:
- `currentUser` state (null when logged out)
- `accessToken` (in-memory only, never localStorage)
- `login(email, password)` — POST `/api/auth/login`, stores token in memory
- `register(username, email, password)` — POST `/api/auth/register`
- `logout()` — POST `/api/auth/logout`, clears memory + all user-specific state
- `refreshAccessToken()` — POST `/api/auth/refresh` (called on 401 responses)
- Auto-refresh: on mount, attempt token refresh from cookie silently

---

### Frontend — Auth API layer

#### [MODIFY] [api.js](file:///c:/Projects/Music_Player/client/src/services/api.js)

Add `Authorization: Bearer <token>` header to all protected API calls. The token is read from `AuthContext`. Add an interceptor pattern: if any call returns 401, attempt token refresh then retry once.

---

### Frontend — Auth Gate (Login/Register screen)

#### [NEW] `client/src/pages/Auth/AuthPage.jsx`

A beautiful login/register screen shown when `currentUser === null`. Features:
- Tab-style toggle between Login and Register
- Form validation
- Animated transitions
- Consistent with existing dark glass design language (uses existing CSS variables)
- **Does NOT change any existing page or component**

#### [MODIFY] [App.jsx](file:///c:/Projects/Music_Player/client/src/App.jsx)

Wrap providers so `AuthProvider` is outermost. Conditionally render `AuthPage` vs `AppShell` based on `currentUser`.

---

### Frontend — Auth-aware AppContext changes

#### [MODIFY] [AppContext.jsx](file:///c:/Projects/Music_Player/client/src/context/AppContext.jsx)

- On logout: clear all state (`playlists`, `favorites`, `playHistory`, `localTracks`, `externalTracks`)
- On login/user-change: re-trigger bootstrap load
- Pass `accessToken` to all API calls

---

### Frontend — Player state clear on logout

#### [MODIFY] [PlayerContext.jsx](file:///c:/Projects/Music_Player/client/src/context/PlayerContext.jsx)

- On logout: clear `currentTrack`, `queue`, `resolvedCache`
- Clear localStorage keys (`auralis:lastTrack`, `auralis:lastPosition`, `auralis:streamCache`)

---

### Frontend — Clear local storage on account switch

The `AuthContext.logout()` will clear all `auralis:*` localStorage keys to prevent data leakage between sessions.

---

### Security

| Concern | Implementation |
|---------|----------------|
| Password storage | bcrypt with salt rounds 12 |
| Access token | JWT, 15-min TTL, in-memory only |
| Refresh token | JWT, 7-day TTL, HTTP-only Secure SameSite=Strict cookie |
| Token revocation | Hashed refresh tokens stored in DB, cleared on logout |
| userId from request | Always from JWT payload, never from request body |
| Ownership checks | Every playlist operation checks `userId` match |
| CORS | Already configured; will verify credentials mode |

---

## Verification Plan

### Automated Tests
- `node --check server/index.js` — syntax check
- `npm run build` (client) — ensure frontend builds

### Manual Verification Checklist
1. Register User A → verify login works, token returned
2. Register User B → verify login works
3. User A: create playlist "A-Playlist", like 3 songs, play 5 songs
4. Log out User A → verify localStorage cleared, no data shown
5. Log in User B → verify empty playlists, no history, no favorites
6. Attempt `GET /api/playlists` without token → 401
7. Attempt access User A's playlist ID as User B → 403
8. Log back in as User A → verify all User A's data is restored
9. Verify preferences are user-specific (change theme as User A, switch to User B, different theme)
10. Verify existing features still work: search, streaming, trending

