/**
 * hooks/useKeyboardShortcuts.js
 * Global Keyboard Shortcuts for Auralis Music.
 * 
 * Shortcuts:
 *   - Space / K       : Play / Pause
 *   - N / Shift + →   : Next Track
 *   - P / Shift + ←   : Previous Track
 *   - S               : Toggle Shuffle
 *   - R               : Toggle Repeat
 *   - D               : Toggle Audio Experience (DSP Studio)
 *   - ↑ (ArrowUp)     : Volume Up (+5%)
 *   - ↓ (ArrowDown)   : Volume Down (-5%)
 *   - M               : Mute / Unmute
 *   - → (ArrowRight)  : Seek Forward (5s)
 *   - ← (ArrowLeft)   : Seek Backward (5s)
 *   - Escape          : Close DSP / Preferences modal
 */

import { useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useApp } from '../context/AppContext';
import { useAudioEngineContext } from '../audio/AudioEngineContext';

export function useKeyboardShortcuts() {
  const {
    togglePlay,
    handlePrev,
    handleNext,
    setShuffle,
    setRepeat,
    seek,
    displayElapsed,
    displayDuration,
  } = usePlayer();

  const { prefs, setPrefs, setShowPrefs, showPrefs } = useApp();
  const { openAudioExperience, closeAudioExperience, isModalOpen } = useAudioEngineContext();

  const prevVolume = useRef(prefs.volume ?? 62);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Never intercept when user is typing in an input, textarea, or contentEditable element
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
        activeEl.isContentEditable
      );
      if (isInput) return;

      // 2. Ignore modifier combinations (Ctrl/Cmd/Alt) to avoid breaking browser shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.code) {
        // ── Play / Pause ──
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          break;

        // ── Next Track ──
        case 'KeyN':
          e.preventDefault();
          handleNext();
          break;

        // ── Previous Track ──
        case 'KeyP':
          e.preventDefault();
          handlePrev();
          break;

        // ── Toggle Shuffle ──
        case 'KeyS':
          e.preventDefault();
          setShuffle(prev => !prev);
          break;

        // ── Toggle Repeat ──
        case 'KeyR':
          e.preventDefault();
          setRepeat(prev => !prev);
          break;

        // ── Toggle Audio Experience (DSP Studio) ──
        case 'KeyD':
          e.preventDefault();
          if (isModalOpen) {
            closeAudioExperience();
          } else {
            openAudioExperience('engine');
          }
          break;

        // ── Volume Up (+5%) ──
        case 'ArrowUp':
          e.preventDefault();
          setPrefs(prev => ({
            ...prev,
            volume: Math.min(100, Math.round(((prev.volume ?? 62) + 5) / 5) * 5),
          }));
          break;

        // ── Volume Down (-5%) ──
        case 'ArrowDown':
          e.preventDefault();
          setPrefs(prev => ({
            ...prev,
            volume: Math.max(0, Math.round(((prev.volume ?? 62) - 5) / 5) * 5),
          }));
          break;

        // ── Mute / Unmute ──
        case 'KeyM':
          e.preventDefault();
          setPrefs(prev => {
            const cur = prev.volume ?? 62;
            if (cur > 0) {
              prevVolume.current = cur;
              return { ...prev, volume: 0 };
            } else {
              return { ...prev, volume: prevVolume.current > 0 ? prevVolume.current : 62 };
            }
          });
          break;

        // ── Seek Forward / Next (Shift + ArrowRight) ──
        case 'ArrowRight':
          if (e.shiftKey) {
            e.preventDefault();
            handleNext();
          } else if (displayDuration > 0) {
            e.preventDefault();
            const targetSec = Math.min(displayDuration, displayElapsed + 5);
            seek((targetSec / displayDuration) * 100);
          }
          break;

        // ── Seek Backward / Previous (Shift + ArrowLeft) ──
        case 'ArrowLeft':
          if (e.shiftKey) {
            e.preventDefault();
            handlePrev();
          } else if (displayDuration > 0) {
            e.preventDefault();
            const targetSec = Math.max(0, displayElapsed - 5);
            seek((targetSec / displayDuration) * 100);
          }
          break;

        // ── Escape: Close DSP or Preferences modal ──
        case 'Escape':
          if (isModalOpen) {
            e.preventDefault();
            closeAudioExperience();
          } else if (showPrefs) {
            e.preventDefault();
            setShowPrefs(false);
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlay,
    handlePrev,
    handleNext,
    setShuffle,
    setRepeat,
    openAudioExperience,
    closeAudioExperience,
    isModalOpen,
    setPrefs,
    setShowPrefs,
    showPrefs,
    seek,
    displayElapsed,
    displayDuration,
  ]);
}
