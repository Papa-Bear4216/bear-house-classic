// Minimal swipe-left/right detection via raw touch events — no gesture
// library needed for something this simple. Returns handlers to spread
// onto the swipeable row, plus the live horizontal offset (for a visual
// drag-follow effect) and a reset.
import { useState, useRef } from 'react';

const SWIPE_THRESHOLD = 80; // px horizontal movement to count as a swipe
const MAX_VERTICAL_DRIFT = 50; // px — beyond this, treat it as a scroll, not a swipe

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function useSwipe({ onSwipeLeft, onSwipeRight }: UseSwipeOptions) {
  const [offsetX, setOffsetX] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancelled = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    cancelled.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current || cancelled.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (Math.abs(dy) > MAX_VERTICAL_DRIFT) {
      cancelled.current = true; // vertical scroll — bail out of swipe tracking
      setOffsetX(0);
      return;
    }
    setOffsetX(dx);
  };

  const onTouchEnd = () => {
    if (!cancelled.current) {
      if (offsetX <= -SWIPE_THRESHOLD) onSwipeLeft?.();
      else if (offsetX >= SWIPE_THRESHOLD) onSwipeRight?.();
    }
    start.current = null;
    setOffsetX(0);
  };

  return { offsetX, onTouchStart, onTouchMove, onTouchEnd };
}
