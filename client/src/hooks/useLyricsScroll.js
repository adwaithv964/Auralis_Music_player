/**
 * hooks/useLyricsScroll.js
 *
 * Manages auto-scroll behaviour for the lyrics panel.
 *
 * Behaviour:
 *   - When activeIndex changes, smoothly scrolls the active lyric line into
 *     the vertical centre of the scroll container.
 *   - Detects manual user interaction (wheel / touchmove / mousedown on the
 *     scroll container) and pauses auto-scroll temporarily.
 *   - After RESUME_DELAY ms of inactivity, auto-scroll resumes.
 *   - All listeners are removed on unmount — no memory leaks.
 *
 * Performance notes:
 *   - Uses scrollTo({ behavior:'smooth' }) → compositor-driven, no layout
 *     thrashing.
 *   - The resume timer is cleared and reset on every interaction event so
 *     we never accumulate redundant timers.
 *   - offsetTop reads are cached via a ref; only updated when activeIndex
 *     changes (not on every frame).
 *
 * @param {React.RefObject<HTMLElement>} scrollRef  - The scrollable container
 * @param {number}                       activeIndex - Current active line index
 */

import { useEffect, useRef, useCallback } from 'react';

/** ms of user inactivity before auto-scroll resumes */
const RESUME_DELAY = 3000;

export function useLyricsScroll(scrollRef, activeIndex) {
  /** true while the user is manually scrolling */
  const userScrolling  = useRef(false);
  /** setTimeout handle for the resume timer */
  const resumeTimer    = useRef(null);
  /** last activeIndex we successfully scrolled to */
  const lastScrolledTo = useRef(-1);

  // ── Reset auto-scroll gate whenever the track changes (activeIndex→-1) ──
  useEffect(() => {
    if (activeIndex === -1) {
      userScrolling.current  = false;
      lastScrolledTo.current = -1;
      clearTimeout(resumeTimer.current);
    }
  }, [activeIndex === -1]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll to active line ────────────────────────────────────────────
  useEffect(() => {
    if (activeIndex < 0) return;
    if (userScrolling.current) return;
    if (activeIndex === lastScrolledTo.current) return;

    const container = scrollRef.current;
    if (!container) return;

    // Query the active line element by data attribute
    const activeEl = container.querySelector(`[data-lyric-index="${activeIndex}"]`);
    if (!activeEl) return;

    // Calculate scroll position to vertically centre the active element
    const containerHeight = container.clientHeight;
    const elTop           = activeEl.offsetTop;
    const elHeight        = activeEl.offsetHeight;
    const targetScroll    = elTop - containerHeight / 2 + elHeight / 2;

    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    lastScrolledTo.current = activeIndex;
  }, [activeIndex, scrollRef]);

  // ── Manual-scroll detection ───────────────────────────────────────────────
  const handleManualScroll = useCallback(() => {
    userScrolling.current = true;
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      userScrolling.current = false;
    }, RESUME_DELAY);
  }, []);

  // Attach listeners once on mount, remove on unmount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('wheel',     handleManualScroll, { passive: true });
    el.addEventListener('touchmove', handleManualScroll, { passive: true });
    el.addEventListener('mousedown', handleManualScroll, { passive: true });

    return () => {
      el.removeEventListener('wheel',     handleManualScroll);
      el.removeEventListener('touchmove', handleManualScroll);
      el.removeEventListener('mousedown', handleManualScroll);
      clearTimeout(resumeTimer.current);
    };
  }, [scrollRef, handleManualScroll]);
}
