/**
 * App.jsx — Entry shell
 *
 * Wraps the entire app in context providers (order matters):
 *   AppProvider  → all non-audio state (language, mood, tracks, prefs…)
 *   PlayerProvider → consumes AppContext; owns audio engine + playback
 *   AppShell     → layout + pages
 *
 * This file is intentionally thin. All logic lives in context/ and pages/.
 */
import { AppProvider }    from './context/AppContext';
import { PlayerProvider } from './context/PlayerContext';
import { AppShell }       from './AppShell';
import './index.css';

export default function App() {
  return (
    <AppProvider>
      <PlayerProvider>
        <AppShell />
      </PlayerProvider>
    </AppProvider>
  );
}
