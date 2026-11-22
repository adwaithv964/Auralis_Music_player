/**
 * hooks/useLyricsHighlight.js
 *
 * Pure calculation hook — no DOM side effects, no subscriptions.
 *
 * Given a line's index and the current activeIndex, returns a style
 * descriptor that drives the proximity-based visual hierarchy of each
 * lyric line (opacity, scale, font-weight).
 *
 * Visual hierarchy (mirrors Spotify's approach):
 *
 *   Distance  │ opacity │ scale  │ weight
 *   ──────────┼─────────┼────────┼───────
 *   0 (active)│ 1.00    │ 1.05   │ 700
 *   ±1        │ 0.65    │ 0.99   │ 500
 *   ±2        │ 0.42    │ 0.96   │ 400
 *   ±3        │ 0.26    │ 0.94   │ 400
 *   >±3       │ 0.18    │ 0.92   │ 400
 *
 * Returns CSS custom-property values that the LyricsLine component
 * applies via inline style so CSS transitions on opacity/transform
 * handle the animation entirely on the GPU.
 *
 * @param {number} index       - This line's index
 * @param {number} activeIndex - Currently active line index (-1 = before start)
 * @returns {{ isActive: boolean, opacity: number, scale: number, fontWeight: number }}
 */
export function useLyricsHighlight(index, activeIndex) {
  // Before playback starts every line shows at low opacity
  if (activeIndex < 0) {
    return { isActive: false, opacity: 0.35, scale: 0.96, fontWeight: 400 };
  }

  const distance = Math.abs(index - activeIndex);

  if (distance === 0) return { isActive: true,  opacity: 1.00, scale: 1.05, fontWeight: 700 };
  if (distance === 1) return { isActive: false, opacity: 0.65, scale: 0.99, fontWeight: 500 };
  if (distance === 2) return { isActive: false, opacity: 0.42, scale: 0.96, fontWeight: 400 };
  if (distance === 3) return { isActive: false, opacity: 0.26, scale: 0.94, fontWeight: 400 };
  return               { isActive: false, opacity: 0.18, scale: 0.92, fontWeight: 400 };
}
