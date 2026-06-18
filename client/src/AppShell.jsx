/**
 * AppShell.jsx
 *
 * The top-level layout container. Renders the CSS grid:
 *   [Sidebar] [main: Home|Search|Library] [NowPlaying]
 *   [Player (desktop)]
 *   [BottomNav (mobile)]
 *
 * View switching is handled by the `view` state in AppContext
 * (Spotify-style SPA — no URL changes).
 */
import { useApp }      from './context/AppContext';
import { Sidebar }     from './components/Sidebar/Sidebar';
import { NowPlaying }  from './components/NowPlaying/NowPlaying';
import { PlayerBar }   from './components/PlayerBar/PlayerBar';
import { BottomNav }   from './components/BottomNav/BottomNav';
import { PlaylistModal } from './components/PlaylistModal/PlaylistModal';
import { Home }        from './pages/Home/Home';
import { Search }      from './pages/Search/Search';
import { Library }     from './pages/Library/Library';
import { Preferences } from './Preferences';
import { SvgSprite }   from './components/Icons';


export function AppShell() {
  const { view, showPrefs, setShowPrefs, prefs, setPrefs } = useApp();

  return (
    <>
      <SvgSprite />
      <div className="ambient-layer" aria-hidden="true" />

      <div className="app-shell">

        {/* ── Left: Sidebar nav ── */}
        <Sidebar />

        {/* ── Centre: Main content area ── */}
        <main className="main-area">
          {view === 'home'    && <Home />}
          {view === 'search'  && <Search />}
          {view === 'library' && <Library />}
        </main>

        {/* ── Right: Now Playing panel (desktop) / Sheet (mobile) ── */}
        <NowPlaying />

        {/* ── Bottom: Desktop player bar ── */}
        <PlayerBar />

        {/* ── Bottom: Mobile nav + mini-strip ── */}
        <BottomNav />

      </div>

      {/* ── Preferences modal overlay ── */}
      {showPrefs && (
        <Preferences
          prefs={prefs}
          setPrefs={setPrefs}
          onClose={() => setShowPrefs(false)}
        />
      )}

      {/* ── Playlist picker modal (global, rendered at root) ── */}
      <PlaylistModal />
    </>
  );
}
