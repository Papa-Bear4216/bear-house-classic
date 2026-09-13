import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Sparkles, ArrowLeft, ArrowRight, Zap, Crosshair } from 'lucide-react';
import { calculateDeltaTime, wrapCoordinate, circlesOverlap } from '@/lib/arcadeEngine';
import { audioSynth, triggerConfetti } from '@/lib/audio';

interface Props {
  selectedMemberId: string;
  playerName: string;
  soundEnabled: boolean;
  onScoreEarned: (points: number) => void;
  dailyClaimRemaining: number;
}

interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // in radians
  shieldTimeSec: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeSec: number;
}

interface Debris {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: 1 | 2 | 3; // 3 = Large, 2 = Medium, 1 = Small
  radius: number;
  points: number;
}

const CANVAS_W = 460;
const CANVAS_H = 360;

const ROTATE_SPEED = Math.PI * 1.5; // ~270 deg/sec
const THRUST_ACCEL = 320; // px/sec^2
const MAX_VELOCITY = 280;
const BULLET_SPEED = 420;

export const CosmicClutterGame: React.FC<Props> = ({
  selectedMemberId,
  playerName,
  soundEnabled,
  onScoreEarned,
  dailyClaimRemaining,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [claimedNotice, setClaimedNotice] = useState<string | null>(null);

  // Input states
  const keysRef = useRef<{ left: boolean; right: boolean; thrust: boolean; fire: boolean }>({
    left: false,
    right: false,
    thrust: false,
    fire: false,
  });

  const shipRef = useRef<Ship>({
    x: CANVAS_W / 2,
    y: CANVAS_H / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    shieldTimeSec: 3.5,
  });

  const bulletsRef = useRef<Bullet[]>([]);
  const debrisListRef = useRef<Debris[]>([]);
  const nextIdRef = useRef<number>(1);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const fireCooldownRef = useRef<number>(0);

  // Load High Score
  useEffect(() => {
    if (!selectedMemberId) return;
    const hs = localStorage.getItem(`arcade_cosmic_hs_${selectedMemberId}`);
    setHighScore(hs ? parseInt(hs, 10) : 0);
  }, [selectedMemberId]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysRef.current.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysRef.current.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') keysRef.current.thrust = true;
      if (e.code === 'Space') {
        e.preventDefault();
        keysRef.current.fire = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysRef.current.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysRef.current.right = false;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') keysRef.current.thrust = false;
      if (e.code === 'Space') keysRef.current.fire = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const spawnDebrisWave = (count = 4) => {
    const list: Debris[] = [];
    for (let i = 0; i < count; i++) {
      // Spawn around outer border
      const edge = Math.floor(Math.random() * 4);
      let x = 0;
      let y = 0;
      if (edge === 0) { x = Math.random() * CANVAS_W; y = 10; }
      else if (edge === 1) { x = CANVAS_W - 10; y = Math.random() * CANVAS_H; }
      else if (edge === 2) { x = Math.random() * CANVAS_W; y = CANVAS_H - 10; }
      else { x = 10; y = Math.random() * CANVAS_H; }

      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 50;

      list.push({
        id: nextIdRef.current++,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3,
        radius: 24,
        points: 20,
      });
    }
    debrisListRef.current = list;
  };

  const fireLaser = () => {
    const ship = shipRef.current;
    const noseX = ship.x + Math.cos(ship.angle) * 18;
    const noseY = ship.y + Math.sin(ship.angle) * 18;

    bulletsRef.current.push({
      x: noseX,
      y: noseY,
      vx: Math.cos(ship.angle) * BULLET_SPEED,
      vy: Math.sin(ship.angle) * BULLET_SPEED,
      lifeSec: 1.1,
    });

    if (soundEnabled) {
      audioSynth.playCheckmark();
    }
  };

  const splitDebris = (target: Debris) => {
    const list = debrisListRef.current.filter((d) => d.id !== target.id);

    if (target.size > 1) {
      const nextSize = (target.size - 1) as 1 | 2;
      const radius = nextSize === 2 ? 16 : 9;
      const pts = nextSize === 2 ? 40 : 80;

      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 60;
        list.push({
          id: nextIdRef.current++,
          x: target.x,
          y: target.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: nextSize,
          radius,
          points: pts,
        });
      }
    }

    debrisListRef.current = list;

    // Check if wave cleared
    if (list.length === 0) {
      spawnDebrisWave(5);
    }
  };

  const gameLoop = (timestamp: number) => {
    const { dt, nextTime } = calculateDeltaTime(timestamp, lastTimeRef.current);
    lastTimeRef.current = nextTime;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ship = shipRef.current;
    const keys = keysRef.current;

    // 1. Update Ship rotation & thrust
    if (keys.left) ship.angle -= ROTATE_SPEED * dt;
    if (keys.right) ship.angle += ROTATE_SPEED * dt;

    if (keys.thrust) {
      ship.vx += Math.cos(ship.angle) * THRUST_ACCEL * dt;
      ship.vy += Math.sin(ship.angle) * THRUST_ACCEL * dt;

      // Cap max velocity
      const currentSpeed = Math.hypot(ship.vx, ship.vy);
      if (currentSpeed > MAX_VELOCITY) {
        ship.vx = (ship.vx / currentSpeed) * MAX_VELOCITY;
        ship.vy = (ship.vy / currentSpeed) * MAX_VELOCITY;
      }
    } else {
      // Natural drag
      ship.vx *= Math.pow(0.98, dt * 60);
      ship.vy *= Math.pow(0.98, dt * 60);
    }

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    ship.x = wrapCoordinate(ship.x, CANVAS_W);
    ship.y = wrapCoordinate(ship.y, CANVAS_H);

    if (ship.shieldTimeSec > 0) {
      ship.shieldTimeSec -= dt;
    }

    // 2. Firing
    fireCooldownRef.current -= dt;
    if (keys.fire && fireCooldownRef.current <= 0) {
      fireLaser();
      fireCooldownRef.current = 0.22; // max ~4.5 shots/sec
    }

    // 3. Update Bullets
    bulletsRef.current.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.x = wrapCoordinate(b.x, CANVAS_W);
      b.y = wrapCoordinate(b.y, CANVAS_H);
      b.lifeSec -= dt;
    });
    bulletsRef.current = bulletsRef.current.filter((b) => b.lifeSec > 0);

    // 4. Update Debris
    debrisListRef.current.forEach((d) => {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.x = wrapCoordinate(d.x, CANVAS_W);
      d.y = wrapCoordinate(d.y, CANVAS_H);
    });

    // 5. Check Bullet-Debris Collisions
    bulletsRef.current.forEach((b) => {
      debrisListRef.current.forEach((d) => {
        if (circlesOverlap(b.x, b.y, 4, d.x, d.y, d.radius, 1.0)) {
          b.lifeSec = 0; // Destroy bullet
          splitDebris(d);
          setScore((s) => {
            const next = s + d.points;
            if (next > highScore) {
              setHighScore(next);
              localStorage.setItem(`arcade_cosmic_hs_${selectedMemberId}`, next.toString());
            }
            return next;
          });
        }
      });
    });

    // 6. Check Ship-Debris Collisions (if shield expired)
    if (ship.shieldTimeSec <= 0) {
      for (const d of debrisListRef.current) {
        if (circlesOverlap(ship.x, ship.y, 14, d.x, d.y, d.radius, 0.8)) {
          setGameState('gameover');
          if (soundEnabled) {
            audioSynth.playTimerAlert();
          }
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
          return;
        }
      }
    }

    // --- RENDERING ---
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Starry space dust background
    ctx.fillStyle = '#334155';
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 73 + 17) % CANVAS_W);
      const sy = ((i * 97 + 29) % CANVAS_H);
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    // Draw Debris (Clutter)
    debrisListRef.current.forEach((d) => {
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.size === 3) {
        // Large clump
        ctx.fillStyle = '#f87171';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (d.size === 2) {
        // Medium clutter
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-d.radius, -d.radius, d.radius * 2, d.radius * 2, 4);
        ctx.fill();
        ctx.stroke();
      } else {
        // Small debris
        ctx.fillStyle = '#a78bfa';
        ctx.beginPath();
        ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // Draw Bullets (Laser Beams)
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1;
    bulletsRef.current.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Draw Ship (Chore Bot Vacuum)
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    // Thrust flame
    if (keys.thrust) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-20 - Math.random() * 6, 0);
      ctx.lineTo(-12, 4);
      ctx.closePath();
      ctx.fill();
    }

    // Ship Triangle Body
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shield Bubble (if active)
    if (ship.shieldTimeSec > 0) {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const startGame = () => {
    shipRef.current = {
      x: CANVAS_W / 2,
      y: CANVAS_H / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      shieldTimeSec: 3.5,
    };
    bulletsRef.current = [];
    keysRef.current = { left: false, right: false, thrust: false, fire: false };
    setScore(0);
    setClaimedNotice(null);
    setGameState('playing');
    spawnDebrisWave(4);

    if (soundEnabled) {
      audioSynth.playLevelUp();
    }

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const handleClaim = () => {
    const pts = Math.floor(score / 50);
    if (pts <= 0) return;
    const actual = Math.min(pts, dailyClaimRemaining);
    onScoreEarned(actual);
    setClaimedNotice(`+${actual} Stars added to Reward Store!`);
    if (soundEnabled) {
      triggerConfetti();
      audioSynth.playLevelUp();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-center justify-center">
      {/* Canvas Area */}
      <div className="relative bg-slate-950 p-4 rounded-3xl border-2 border-slate-800 shadow-2xl flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="rounded-2xl bg-slate-950 border border-slate-800 touch-none max-w-full"
        />

        {gameState === 'idle' && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 text-center">
            <h3 className="text-2xl font-black text-white tracking-wide mb-1">Cosmic Clutter</h3>
            <p className="text-xs text-slate-400 mb-6 max-w-xs">
              Pilot your room vacuum bot through deep space. Blast clutter debris and pop them into cosmic dust!
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg transition active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" /> Launch Ship
            </button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 text-center">
            <div className="text-4xl mb-2">💥</div>
            <h3 className="text-2xl font-black text-rose-400 mb-1">Ship Hit!</h3>
            <p className="text-sm text-slate-300 mb-1">Final Score: <span className="font-bold text-white text-base">{score}</span></p>
            {claimedNotice && (
              <p className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg mb-3">
                {claimedNotice}
              </p>
            )}
            <div className="flex gap-2.5 mt-2">
              <button
                onClick={startGame}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-slate-700 transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Re-launch
              </button>
              <button
                onClick={handleClaim}
                disabled={score < 50 || dailyClaimRemaining <= 0 || !!claimedNotice}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" /> Claim (+{Math.floor(score / 50)})
              </button>
            </div>
          </div>
        )}

        {/* Mobile On-Screen Touch Controls */}
        <div className="mt-4 flex justify-between items-center w-full max-w-sm px-2 sm:hidden">
          {/* Turn Steering */}
          <div className="flex gap-2">
            <button
              onTouchStart={() => { keysRef.current.left = true; }}
              onTouchEnd={() => { keysRef.current.left = false; }}
              onMouseDown={() => { keysRef.current.left = true; }}
              onMouseUp={() => { keysRef.current.left = false; }}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white select-none"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onTouchStart={() => { keysRef.current.right = true; }}
              onTouchEnd={() => { keysRef.current.right = false; }}
              onMouseDown={() => { keysRef.current.right = true; }}
              onMouseUp={() => { keysRef.current.right = false; }}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white select-none"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>

          {/* Action Buttons: Thrust & Fire */}
          <div className="flex gap-2">
            <button
              onTouchStart={() => { keysRef.current.thrust = true; }}
              onTouchEnd={() => { keysRef.current.thrust = false; }}
              onMouseDown={() => { keysRef.current.thrust = true; }}
              onMouseUp={() => { keysRef.current.thrust = false; }}
              className="w-12 h-12 bg-amber-500/20 active:bg-amber-500/40 border border-amber-500/40 text-amber-400 rounded-xl flex items-center justify-center select-none"
              title="Thrust"
            >
              <Zap className="w-5 h-5 fill-current" />
            </button>
            <button
              onTouchStart={() => { keysRef.current.fire = true; }}
              onTouchEnd={() => { keysRef.current.fire = false; }}
              onMouseDown={() => { keysRef.current.fire = true; }}
              onMouseUp={() => { keysRef.current.fire = false; }}
              className="w-14 h-12 bg-sky-500 active:bg-sky-400 text-slate-950 font-black rounded-xl flex items-center justify-center select-none shadow-md"
              title="Fire Laser"
            >
              <Crosshair className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="w-full lg:w-72 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Score</div>
          <div className="text-3xl font-black text-sky-400">{score}</div>
          <div className="text-xs text-slate-500">High Score: {highScore} ({playerName})</div>
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-800 text-xs text-slate-300">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1.5">
            <div className="font-bold text-sky-300">Debris Splitting:</div>
            <div className="text-[11px] text-slate-400">• Red clutters split into 2 yellow pieces.</div>
            <div className="text-[11px] text-slate-400">• Yellow pieces split into small purple dust.</div>
            <div className="text-[11px] text-slate-400">• Green dotted circle gives 3s spawn shield.</div>
          </div>
        </div>

        <div className="mt-auto bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
          <span className="text-sky-300 font-semibold">Controls:</span> Left/Right arrows to rotate, Up to thrust, Space to shoot (or use the on-screen buttons on phone).
        </div>
      </div>
    </div>
  );
};

export default CosmicClutterGame;
