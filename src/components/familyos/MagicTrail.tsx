import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';

interface Particle {
  id: number;
  x: number;
  y: number;
  char: string;
  color: string;
  size: number;
  dx: number;
  dy: number;
}

const SPARKLE_CHARS = ['✦', '✧', '⊹', '✸', '✺', '✹', '·'];
const HEART_CHARS   = ['♥', '♥', '❤', '♡', '♥', '❤'];

const USER_CFG: Record<string, { broom: boolean; emoji: string; chars: string[]; colors: string[] }> = {
  daddy: {
    broom: true,
    emoji: '🧙‍♂️',
    chars: SPARKLE_CHARS,
    colors: ['#a5b4fc', '#c4b5fd', '#fbbf24', '#34d399', '#818cf8', '#e0e7ff', '#fde68a'],
  },
  mommy: {
    broom: true,
    emoji: '🧙‍♀️',
    chars: SPARKLE_CHARS,
    colors: ['#f9a8d4', '#e879f9', '#fde68a', '#fbcfe8', '#f0abfc', '#fca5a5', '#c4b5fd'],
  },
  julia: {
    broom: false,
    emoji: '💖',
    chars: HEART_CHARS,
    colors: ['#93c5fd', '#f9a8d4', '#6ee7b7', '#c4b5fd', '#bfdbfe', '#fce7f3', '#f472b6'],
  },
  abriana: {
    broom: false,
    emoji: '💜',
    chars: HEART_CHARS,
    colors: ['#c084fc', '#f472b6', '#818cf8', '#f0abfc', '#a78bfa', '#e879f9', '#f9a8d4'],
  },
};

const TRAIL_CSS = `
@keyframes sparkle-out {
  0%   { opacity: 1; transform: translate(0px, 0px) scale(1) rotate(0deg); }
  100% { opacity: 0; transform: translate(var(--pdx), var(--pdy)) scale(0.15) rotate(var(--prot)); }
}
@keyframes heart-float {
  0%   { opacity: 0.9; transform: translate(0px, 0px) scale(1); }
  60%  { opacity: 0.6; }
  100% { opacity: 0;   transform: translate(var(--pdx), var(--pdy)) scale(0.3); }
}
`;

let _pid = 0;

export const MagicTrail: React.FC = () => {
  const { currentUser } = useAppContext();
  const cfg = currentUser ? USER_CFG[currentUser.id] : null;

  const [particles, setParticles] = useState<Particle[]>([]);
  const charRef   = useRef<HTMLDivElement>(null);
  const lastAddRef = useRef(0);
  const velRef     = useRef({ vx: 0, vy: 0, lx: -200, ly: -200 });

  const addParticles = useCallback((x: number, y: number) => {
    if (!cfg) return;
    const now = Date.now();
    if (now - lastAddRef.current < 35) return;
    lastAddRef.current = now;

    const { vx, vy } = velRef.current;
    const newOnes: Particle[] = Array.from({ length: 3 }, () => ({
      id: _pid++,
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 14,
      char:  cfg.chars[Math.floor(Math.random() * cfg.chars.length)],
      color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
      size:  10 + Math.random() * 12,
      dx: cfg.broom ? (-vx * 0.5 + (Math.random() - 0.5) * 35) : ((Math.random() - 0.5) * 28),
      dy: cfg.broom ? (-vy * 0.5 + (Math.random() - 0.5) * 25) : (-(18 + Math.random() * 40)),
    }));

    setParticles(prev => [...prev.slice(-60), ...newOnes]);
  }, [cfg]);

  const onMove = useCallback((x: number, y: number) => {
    const { lx, ly } = velRef.current;
    velRef.current = { vx: x - lx, vy: y - ly, lx: x, ly: y };

    if (charRef.current) {
      const flipX = cfg?.broom && (x - lx) < -1 ? 'scaleX(-1)' : 'scaleX(1)';
      charRef.current.style.left = `${x - 18}px`;
      charRef.current.style.top  = `${y - 28}px`;
      charRef.current.style.transform = flipX;
    }

    addParticles(x, y);
  }, [cfg, addParticles]);

  useEffect(() => {
    if (!cfg) return;
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { const t = e.touches[0]; onMove(t.clientX, t.clientY); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('touchmove', tm, { passive: true });
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('touchmove', tm);
    };
  }, [cfg, onMove]);

  const remove = useCallback((id: number) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  }, []);

  if (!cfg) return null;

  const anim = cfg.broom ? 'sparkle-out' : 'heart-float';

  return (
    <>
      <style>{TRAIL_CSS}</style>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 9999 }}>
        {/* Cursor character */}
        <div
          ref={charRef}
          style={{
            position: 'absolute',
            left: -200,
            top: -200,
            lineHeight: 1,
            userSelect: 'none',
            willChange: 'left, top',
            fontSize: cfg.broom ? '28px' : '22px',
          }}
        >
          {cfg.broom ? (
            <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '0px' }}>
              <span style={{ fontSize: '26px' }}>{cfg.emoji}</span>
              <span style={{ fontSize: '20px', marginLeft: '-4px', marginBottom: '-2px' }}>🧹</span>
            </span>
          ) : (
            <span>{cfg.emoji}</span>
          )}
        </div>

        {/* Particles */}
        {particles.map(p => (
          <div
            key={p.id}
            onAnimationEnd={() => remove(p.id)}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              color: p.color,
              fontSize: `${p.size}px`,
              lineHeight: 1,
              userSelect: 'none',
              animation: `${anim} 0.85s ease-out forwards`,
              '--pdx': `${p.dx}px`,
              '--pdy': `${p.dy}px`,
              '--prot': `${Math.random() > 0.5 ? 180 : -180}deg`,
            } as React.CSSProperties}
          >
            {p.char}
          </div>
        ))}
      </div>
    </>
  );
};

export default MagicTrail;
