'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';

interface Point {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
}

const COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff'];

export function HeartTrail() {
  const [points, setPoints] = useState<Point[]>([]);

  const addPoint = useCallback((x: number, y: number) => {
    const newPoint: Point = {
      id: Date.now() + Math.random(),
      x,
      y,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: Math.random() * 20 + 10,
      rotation: Math.random() * 360,
    };
    
    setPoints(prev => [...prev.slice(-15), newPoint]);
  }, []);

  useEffect(() => {
    let lastTime = 0;
    const throttleDelay = 50; // ms

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastTime > throttleDelay) {
        addPoint(e.clientX, e.clientY);
        lastTime = now;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const now = Date.now();
      if (e.touches[0] && now - lastTime > throttleDelay) {
        addPoint(e.touches[0].clientX, e.touches[0].clientY);
        lastTime = now;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [addPoint]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <AnimatePresence>
        {points.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, scale: 0.5, x: p.x - 10, y: p.y - 10, rotate: p.rotation }}
            animate={{ opacity: 0, scale: 1.5, y: p.y - 100, rotate: p.rotation + 45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            onAnimationComplete={() => {
              setPoints(prev => prev.filter(point => point.id !== p.id));
            }}
            className="absolute"
          >
            <Heart 
              fill={p.color} 
              color={p.color} 
              size={p.size} 
              className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
