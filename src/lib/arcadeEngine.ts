// src/lib/arcadeEngine.ts
// Shared physics, delta-time normalization, and mobile touch helpers for the Retro Arcade Suite

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Normalizes frame timing across 60Hz, 90Hz, and 120Hz displays.
 * Caps delta-time at 100ms to prevent giant leaps if the browser tab was backgrounded.
 */
export function calculateDeltaTime(
  nowMs: number,
  lastTimeMs: number,
  maxDeltaSec = 0.1
): { dt: number; nextTime: number } {
  if (lastTimeMs === 0) {
    return { dt: 1 / 60, nextTime: nowMs };
  }
  const rawDt = (nowMs - lastTimeMs) / 1000;
  const dt = Math.min(rawDt, maxDeltaSec);
  return { dt, nextTime: nowMs };
}

/**
 * Attaches touch swipe recognition to an HTML element (Canvas or game wrapper).
 * Returns a cleanup function to remove event listeners.
 */
export function attachSwipeDetector(
  element: HTMLElement,
  onSwipe: (direction: Direction) => void,
  minDistancePx = 25
): () => void {
  let startX = 0;
  let startY = 0;
  let startTime = 0;

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.changedTouches.length !== 1) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = endY - startY;
    const elapsed = Date.now() - startTime;

    // Reject long drags or tiny movements
    if (elapsed > 800) return;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < minDistancePx) return;

    if (absX > absY) {
      onSwipe(dx > 0 ? 'right' : 'left');
    } else {
      onSwipe(dy > 0 ? 'down' : 'up');
    }
  };

  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });

  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchend', handleTouchEnd);
  };
}

/**
 * Circle collision detection with optional hit forgiveness padding
 */
export function circlesOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
  forgivenessFactor = 0.85
): boolean {
  const dist = Math.hypot(x1 - x2, y1 - y2);
  return dist < (r1 + r2) * forgivenessFactor;
}

/**
 * Wraps coordinate around toroidal screen bounds (Asteroids wraparound)
 */
export function wrapCoordinate(val: number, max: number, margin = 20): number {
  if (val < -margin) return max + margin;
  if (val > max + margin) return -margin;
  return val;
}
