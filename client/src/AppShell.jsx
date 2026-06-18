import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp }        from './context/AppContext';
import { Sidebar }       from './components/Sidebar/Sidebar';
import { NowPlaying }    from './components/NowPlaying/NowPlaying';
import { PlayerBar }     from './components/PlayerBar/PlayerBar';
import { BottomNav }     from './components/BottomNav/BottomNav';
import { PlaylistModal } from './components/PlaylistModal/PlaylistModal';
import { Home }          from './pages/Home/Home';
import { Search }        from './pages/Search/Search';
import { Library }       from './pages/Library/Library';
import { Preferences }   from './Preferences';
import { SvgSprite }     from './components/Icons';

const NOW_MIN  = 240;   // px — right panel minimum width
const NOW_MAX  = 520;   // px — right panel maximum width
const NOW_DEF  = 320;   // px — default right panel width
const NAV_FULL = 186;   // px — sidebar expanded width
const NAV_COLL = 62;    // px — sidebar collapsed (icon-only) width

export function AppShell() {
  const { view, showPrefs, setShowPrefs, prefs, setPrefs } = useApp();

  // ── Left sidebar collapse ────────────────────────────────────
  const [collapsed, setCollapsed] = useState(false);

  // ── Right panel drag-resize ──────────────────────────────────
  const [nowWidth, setNowWidth] = useState(NOW_DEF);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  const onDragStart = useCallback((e) => {
    isDragging.current  = true;
    dragStartX.current  = e.clientX;
    dragStartW.current  = nowWidth;
    document.body.style.cursor      = 'ew-resize';
    document.body.style.userSelect  = 'none';
  }, [nowWidth]);

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;   // drag LEFT = wider
      const next  = Math.min(NOW_MAX, Math.max(NOW_MIN, dragStartW.current + delta));
      setNowWidth(next);
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current            = false;
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  const navWidth = collapsed ? NAV_COLL : NAV_FULL;

  return (
    <>
      <SvgSprite />
      <div className="ambient-layer" aria-hidden="true" />

      <div
        className="app-shell"
        style={{
          '--nav-width': `${navWidth}px`,
          '--now-width': `${nowWidth}px`,
        }}
      >
        {/* ── Left: Sidebar nav ── */}
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />

        {/* ── Centre: Main content area ── */}
        <main className="main-area">
          {view === 'home'    && <Home />}
          {view === 'search'  && <Search />}
          {view === 'library' && <Library />}
        </main>

        {/* ── Drag handle between main and right panel ── */}
        <div
          className="panel-drag-handle"
          onMouseDown={onDragStart}
          title="Drag to resize"
        >
          <div className="panel-drag-grip" />
        </div>

        {/* ── Right: Now Playing panel ── */}
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
