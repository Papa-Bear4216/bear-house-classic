import React, { useEffect, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';

// Canvas-based trail — zero React re-renders during animation.
// A single rAF loop owns all drawing; the character emoji is one DOM element
// positioned via direct style mutation (no setState).

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
  char: string; // single unicode glyph
}

const CFG_BY_ROLE = {
  admin: {
    emoji: '🐼',
    sparkles: ['✦', '✧', '⊹', '✸', '✺'],
    colors: ['#a5b4fc', '#c4b5fd', '#fbbf24', '#34d399', '#818cf8'],
    hearts: false,
  },
  superadmin: {
    emoji: '🐼',
    sparkles: ['✦', '✧', '⊹', '✸', '✺'],
    colors: ['#f9a8d4', '#e879f9', '#fde68a', '#fbcfe8', '#f0abfc'],
    hearts: false,
  },
  child: {
    emoji: '💖',
    sparkles: ['♥', '♡', '❤', '♥'],
    colors: ['#93c5fd', '#f9a8d4', '#6ee7b7', '#c4b5fd', '#fce7f3'],
    hearts: true,
  },
} as const;

export const MagicTrail: React.FC = () => {
  const { currentRole } = useAppContext();
  const cfg = currentRole ? CFG_BY_ROLE[currentRole as keyof typeof CFG_BY_ROLE] : undefined;

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const charRef    = useRef<HTMLDivElement>(null);
  const stateRef   = useRef({
    particles: [] as Particle[],
    cx: -200, cy: -200,      // current cursor
    lx: -200, ly: -200,      // last cursor (for velocity)
    lastSpawn: 0,
    raf: 0,
  });

  useEffect(() => {
    if (!cfg) return;

    const canvas  = canvasRef.current!;
    const charEl  = charRef.current!;
    const ctx     = canvas.getContext('2d')!;
    const state   = stateRef.current;

    // Size canvas to viewport
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Input handling (direct DOM, never touches React state) ──────────────
    const onMove = (x: number, y: number) => {
      const now = performance.now();
      const vx  = x - state.lx;
      const vy  = y - state.ly;
      state.lx  = state.cx;
      state.ly  = state.cy;
      state.cx  = x;
      state.cy  = y;

      // Position the character element
      charEl.style.left      = `${x - 14}px`;
      charEl.style.top       = `${y - 28}px`;
      charEl.style.transform = vx < -2 ? 'scaleX(-1)' : 'scaleX(1)';

      // Spawn particles at ≤25fps to stay cheap
      if (now - state.lastSpawn < 40) return;
      state.lastSpawn = now;

      for (let i = 0; i < 3; i++) {
        state.particles.push({
          x: x + (Math.random() - 0.5) * 16,
          y: y + (Math.random() - 0.5) * 16,
          vx: cfg.hearts
            ? (Math.random() - 0.5) * 1.2
            : (-vx * 0.15 + (Math.random() - 0.5) * 1.5),
          vy: cfg.hearts
            ? -(0.8 + Math.random() * 1.5)
            : (-vy * 0.15 + (Math.random() - 0.5) * 1.2),
          alpha: 0.9,
          size: 11 + Math.random() * 9,
          color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
          char:  cfg.sparkles[Math.floor(Math.random() * cfg.sparkles.length)],
        });
      }

      // Hard cap to prevent accumulation
      if (state.particles.length > 80) state.particles.splice(0, state.particles.length - 80);
    };

    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { const t = e.touches[0]; onMove(t.clientX, t.clientY); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('touchmove', tm, { passive: true });

    // ── rAF draw loop ────────────────────────────────────────────────────────
    const draw = () => {
      state.raf = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const fade  = 0.06; // alpha decrement per frame (~60fps → ~15 frames to die)
      const alive: Particle[] = [];

      for (const p of state.particles) {
        p.alpha -= fade;
        if (p.alpha <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.font        = `${p.size}px serif`;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.char, p.x, p.y);
        ctx.restore();

        alive.push(p);
      }

      state.particles = alive;
    };
    draw();

    return () => {
      cancelAnimationFrame(state.raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('touchmove', tm);
    };
  }, [cfg]);

  if (!cfg) return null;

  return (
    <>
      {/* Canvas for the particle trail */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      />
      {/* Character emoji — positioned directly, never re-rendered */}
      <div
        ref={charRef}
        style={{
          position: 'fixed',
          left: -200, top: -200,
          fontSize: '26px',
          lineHeight: 1,
          userSelect: 'none',
          pointerEvents: 'none',
          zIndex: 9999,
          willChange: 'left, top',
        }}
      >
        {cfg.emoji}
      </div>
    </>
  );
};

export default MagicTrail;
