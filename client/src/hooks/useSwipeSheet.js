/**
 * useSwipeSheet.js
 *
 * Native swipe gesture for the mobile Now Playing bottom sheet.
 *
 * role='mini'  — attach to the mini-player strip; swipe UP opens the sheet
 * role='sheet' — attach to the full sheet; swipe DOWN closes it
 *
 * Uses addEventListener directly (not React synthetic events) so we can call
 * e.preventDefault() on touchmove, which requires { passive: false }.
 * All animation is done via direct DOM style manipulation + requestAnimationFrame
 * so there are ZERO React re-renders during dragging.
 */
import { useRef, useEffect, useCallback } from 'react';

// ── Configurable thresholds ────────────────────────────────────
const OPEN_DIST_PX   = 80;   // upward drag distance → open
const CLOSE_DIST_PX  = 100;  // downward drag distance → close
const VELOCITY_PX_MS = 0.4;  // fast flick threshold (px/ms)

/** Returns the .now-panel DOM element */
const getPanel = () => document.querySelector('.now-panel');

export function useSwipeSheet({ role, isOpen, onOpen, onClose }) {
  const elRef   = useRef(null);   // element this hook is attached to
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Drag state — plain object in a ref (no setState = no re-renders)
  const drag = useRef({ active: false, startY: 0, startTime: 0, lastY: 0, rafId: null });

  // ── Snap helper ───────────────────────────────────────────────
  const snap = useCallback((toOpen) => {
    const panel = getPanel();
    if (!panel) return;
    panel.classList.remove('now-panel--dragging');
    // Set explicit transform so CSS transition animates from current position
    if (toOpen) {
      panel.style.transform = 'translateY(0)';
      onOpen();
    } else {
      panel.style.transform = 'translateY(110%)';
      onClose();
    }
    // After transition finishes, clear inline style so CSS class rules take over
    panel.addEventListener('transitionend', () => {
      panel.style.transform = '';
    }, { once: true });
  }, [onOpen, onClose]);

  // ── Build handlers based on role ──────────────────────────────
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    // ── MINI (swipe UP to open) ──────────────────────────────
    if (role === 'mini') {
      const onStart = (e) => {
        if (e.touches.length !== 1 || isOpenRef.current) return;
        drag.current = {
          active: true,
          startY: e.touches[0].clientY,
          startTime: Date.now(),
          lastY: e.touches[0].clientY,
          rafId: null,
        };
        const panel = getPanel();
        if (panel) panel.classList.add('now-panel--dragging');
      };

      const onMove = (e) => {
        const d = drag.current;
        if (!d.active || e.touches.length !== 1) return;
        const dy = d.startY - e.touches[0].clientY; // positive = upward
        d.lastY = e.touches[0].clientY;
        if (dy < 4) return;           // ignore tiny jitter
        e.preventDefault();           // prevent page scroll while swiping up
        const panel = getPanel();
        if (!panel) return;
        const vh = window.innerHeight;
        const y = Math.max(0, vh * 1.1 - dy);
        cancelAnimationFrame(d.rafId);
        d.rafId = requestAnimationFrame(() => {
          panel.style.transform = `translateY(${y}px)`;
        });
      };

      const onEnd = () => {
        const d = drag.current;
        if (!d.active) return;
        d.active = false;
        const dy  = d.startY - d.lastY;                        // positive = up
        const vel = dy / Math.max(1, Date.now() - d.startTime);
        snap(dy > OPEN_DIST_PX || vel > VELOCITY_PX_MS);
      };

      el.addEventListener('touchstart', onStart, { passive: true });
      el.addEventListener('touchmove',  onMove,  { passive: false });
      el.addEventListener('touchend',   onEnd);
      el.addEventListener('touchcancel',onEnd);
      return () => {
        el.removeEventListener('touchstart', onStart);
        el.removeEventListener('touchmove',  onMove);
        el.removeEventListener('touchend',   onEnd);
        el.removeEventListener('touchcancel',onEnd);
      };
    }

    // ── SHEET (swipe DOWN to close) ──────────────────────────
    if (role === 'sheet') {
      const onStart = (e) => {
        if (e.touches.length !== 1 || !isOpenRef.current) return;
        // Don't intercept touches on range sliders (seek / volume)
        if (e.target.closest('input[type="range"]')) return;
        drag.current = {
          active: true,
          startY: e.touches[0].clientY,
          startTime: Date.now(),
          lastY: e.touches[0].clientY,
          rafId: null,
        };
        el.classList.add('now-panel--dragging');
      };

      const onMove = (e) => {
        const d = drag.current;
        if (!d.active || e.touches.length !== 1) return;
        const dy = e.touches[0].clientY - d.startY; // positive = downward
        d.lastY = e.touches[0].clientY;
        if (dy < 4) return;
        e.preventDefault();
        cancelAnimationFrame(d.rafId);
        d.rafId = requestAnimationFrame(() => {
          el.style.transform = `translateY(${dy}px)`;
        });
      };

      const onEnd = () => {
        const d = drag.current;
        if (!d.active) return;
        d.active = false;
        const dy  = d.lastY - d.startY;                        // positive = down
        const vel = dy / Math.max(1, Date.now() - d.startTime);
        // Keep open unless user dragged enough downward / fast enough
        snap(!(dy > CLOSE_DIST_PX || vel > VELOCITY_PX_MS));
      };

      el.addEventListener('touchstart', onStart, { passive: true });
      el.addEventListener('touchmove',  onMove,  { passive: false });
      el.addEventListener('touchend',   onEnd);
      el.addEventListener('touchcancel',onEnd);
      return () => {
        el.removeEventListener('touchstart', onStart);
        el.removeEventListener('touchmove',  onMove);
        el.removeEventListener('touchend',   onEnd);
        el.removeEventListener('touchcancel',onEnd);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, snap]); // isOpen intentionally via ref — avoid re-binding handlers

  return elRef;
}
