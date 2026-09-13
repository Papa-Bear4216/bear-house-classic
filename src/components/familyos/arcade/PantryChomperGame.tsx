import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Sparkles, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { calculateDeltaTime, attachSwipeDetector, Direction } from '@/lib/arcadeEngine';
import { audioSynth, triggerConfetti } from '@/lib/audio';

interface Props {
  selectedMemberId: string;
  playerName: string;
  soundEnabled: boolean;
  onScoreEarned: (points: number) => void;
  dailyClaimRemaining: number;
}

// 19x19 Maze Grid:
// 1 = Wall, 0 = Dot, 2 = Power Apple, 3 = Empty/Ghost House
const MAZE_MAP: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,3,1,3,1,1,1,0,1,1,1,1],
  [3,3,3,1,0,1,3,3,3,3,3,3,3,1,0,1,3,3,3], // Side Tunnel wraparound
  [1,1,1,1,0,1,3,1,1,3,1,1,3,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,0,1],
  [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
  [1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const ROWS = MAZE_MAP.length;
const COLS = MAZE_MAP[0].length;
const TILE_SZ = 20;
const CANVAS_W = COLS * TILE_SZ; // 380px
const CANVAS_H = ROWS * TILE_SZ; // 360px

interface Character {
  x: number;
  y: number;
  dir: Direction;
  nextDir: Direction;
}

interface Monster {
  x: number;
  y: number;
  dir: Direction;
  color: string;
  name: string;
  isFrightened: boolean;
}

export const PantryChomperGame: React.FC<Props> = ({
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
  const [frightenedSec, setFrightenedSec] = useState<number>(0);
  const [claimedNotice, setClaimedNotice] = useState<string | null>(null);

  const gridRef = useRef<number[][]>([]);
  const pacRef = useRef<Character>({ x: 9 * TILE_SZ, y: 14 * TILE_SZ, dir: 'left', nextDir: 'left' });
  const monstersRef = useRef<Monster[]>([
    { x: 9 * TILE_SZ, y: 8 * TILE_SZ, dir: 'up', color: '#ef4444', name: 'Dusty', isFrightened: false },
    { x: 8 * TILE_SZ, y: 8 * TILE_SZ, dir: 'up', color: '#f472b6', name: 'Sticky', isFrightened: false },
    { x: 10 * TILE_SZ, y: 8 * TILE_SZ, dir: 'up', color: '#38bdf8', name: 'Clutter', isFrightened: false },
  ]);

  const mouthAngleRef = useRef<number>(0.2);
  const mouthDirRef = useRef<number>(1);
  const lastTimeRef = useRef<number>(0);
  const requestRef = useRef<number | null>(null);

  // Load High Score
  useEffect(() => {
    if (!selectedMemberId) return;
    const hs = localStorage.getItem(`arcade_pantry_hs_${selectedMemberId}`);
    setHighScore(hs ? parseInt(hs, 10) : 0);
  }, [selectedMemberId]);

  const queueDirection = useCallback((d: Direction) => {
    pacRef.current.nextDir = d;
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        queueDirection('up');
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        queueDirection('down');
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        queueDirection('left');
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        queueDirection('right');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [queueDirection]);

  // Touch Swipe
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return attachSwipeDetector(canvas, (dir) => queueDirection(dir));
  }, [queueDirection]);

  const isWall = (col: number, row: number): boolean => {
    if (col < 0 || col >= COLS) return false; // tunnel wraparound
    if (row < 0 || row >= ROWS) return true;
    return gridRef.current[row]?.[col] === 1;
  };

  const canMove = (x: number, y: number, dir: Direction): boolean => {
    const step = 4;
    let targetX = x;
    let targetY = y;
    if (dir === 'up') targetY -= step;
    if (dir === 'down') targetY += step;
    if (dir === 'left') targetX -= step;
    if (dir === 'right') targetX += step;

    // Check corners of bounding box (16x16 inside 20x20 tile)
    const margin = 2;
    const left = Math.floor((targetX + margin) / TILE_SZ);
    const right = Math.floor((targetX + TILE_SZ - 1 - margin) / TILE_SZ);
    const top = Math.floor((targetY + margin) / TILE_SZ);
    const bottom = Math.floor((targetY + TILE_SZ - 1 - margin) / TILE_SZ);

    return !isWall(left, top) && !isWall(right, top) && !isWall(left, bottom) && !isWall(right, bottom);
  };

  const gameLoop = (timestamp: number) => {
    const { dt, nextTime } = calculateDeltaTime(timestamp, lastTimeRef.current);
    lastTimeRef.current = nextTime;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pac = pacRef.current;
    const speedPx = 105 * dt;

    // Try queued direction if aligned with grid
    if (canMove(pac.x, pac.y, pac.nextDir)) {
      pac.dir = pac.nextDir;
    }

    // Move Pac
    if (canMove(pac.x, pac.y, pac.dir)) {
      if (pac.dir === 'up') pac.y -= speedPx;
      if (pac.dir === 'down') pac.y += speedPx;
      if (pac.dir === 'left') pac.x -= speedPx;
      if (pac.dir === 'right') pac.x += speedPx;
    }

    // Tunnel wraparound
    if (pac.x < -TILE_SZ) pac.x = CANVAS_W;
    if (pac.x > CANVAS_W) pac.x = -TILE_SZ;

    // Eat Dot / Power Apple
    const centerCol = Math.floor((pac.x + TILE_SZ / 2) / TILE_SZ);
    const centerRow = Math.floor((pac.y + TILE_SZ / 2) / TILE_SZ);

    if (centerRow >= 0 && centerRow < ROWS && centerCol >= 0 && centerCol < COLS) {
      const cell = gridRef.current[centerRow][centerCol];
      if (cell === 0) {
        // Dot
        gridRef.current[centerRow][centerCol] = 3;
        setScore((s) => {
          const next = s + 10;
          if (next > highScore) {
            setHighScore(next);
            localStorage.setItem(`arcade_pantry_hs_${selectedMemberId}`, next.toString());
          }
          return next;
        });
        if (soundEnabled && Math.random() < 0.3) {
          audioSynth.playCheckmark();
        }
      } else if (cell === 2) {
        // Power Apple
        gridRef.current[centerRow][centerCol] = 3;
        setFrightenedSec(7); // 7 seconds of monster vulnerability
        setScore((s) => s + 50);
        if (soundEnabled) {
          audioSynth.playLevelUp();
        }
      }
    }

    // Update Frightened Timer
    setFrightenedSec((prev) => Math.max(0, prev - dt));

    // Update Monsters
    const isScared = frightenedSec > 0;
    const monsterSpeed = (isScared ? 55 : 85) * dt;

    monstersRef.current.forEach((m) => {
      m.isFrightened = isScared;

      // Random AI turn at intersections
      const possibleDirs: Direction[] = [];
      (['up', 'down', 'left', 'right'] as Direction[]).forEach((d) => {
        if (canMove(m.x, m.y, d)) possibleDirs.push(d);
      });

      if (possibleDirs.length > 0 && Math.random() < 0.08) {
        m.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
      } else if (!canMove(m.x, m.y, m.dir) && possibleDirs.length > 0) {
        m.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
      }

      if (canMove(m.x, m.y, m.dir)) {
        if (m.dir === 'up') m.y -= monsterSpeed;
        if (m.dir === 'down') m.y += monsterSpeed;
        if (m.dir === 'left') m.x -= monsterSpeed;
        if (m.dir === 'right') m.x += monsterSpeed;
      }

      // Check collision with Pac
      const dist = Math.hypot(pac.x - m.x, pac.y - m.y);
      if (dist < 14) {
        if (m.isFrightened) {
          // Eat monster
          m.x = 9 * TILE_SZ;
          m.y = 8 * TILE_SZ;
          setScore((s) => s + 100);
          if (soundEnabled) {
            audioSynth.playLevelUp();
          }
        } else {
          // Pac caught! Game Over
          setGameState('gameover');
          if (soundEnabled) {
            audioSynth.playTimerAlert();
          }
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
      }
    });

    // Mouth animation
    mouthAngleRef.current += 0.08 * mouthDirRef.current;
    if (mouthAngleRef.current > 0.45 || mouthAngleRef.current < 0.05) {
      mouthDirRef.current *= -1;
    }

    // --- RENDER ---
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw Maze Walls & Items
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const type = gridRef.current[r][c];
        const x = c * TILE_SZ;
        const y = r * TILE_SZ;

        if (type === 1) {
          // Wall
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.fillRect(x + 1, y + 1, TILE_SZ - 2, TILE_SZ - 2);
          ctx.strokeRect(x + 1, y + 1, TILE_SZ - 2, TILE_SZ - 2);
        } else if (type === 0) {
          // Dot
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(x + TILE_SZ / 2, y + TILE_SZ / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (type === 2) {
          // Power Apple
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(x + TILE_SZ / 2, y + TILE_SZ / 2, 6, 0, Math.PI * 2);
          ctx.fill();
          // Stem
          ctx.fillStyle = '#84cc16';
          ctx.fillRect(x + TILE_SZ / 2 - 1, y + TILE_SZ / 2 - 7, 2, 3);
        }
      }
    }

    // Draw Pac-Bear
    const pacRadius = 8;
    const pcX = pac.x + TILE_SZ / 2;
    const pcY = pac.y + TILE_SZ / 2;
    let baseAngle = 0;
    if (pac.dir === 'right') baseAngle = 0;
    if (pac.dir === 'down') baseAngle = Math.PI * 0.5;
    if (pac.dir === 'left') baseAngle = Math.PI;
    if (pac.dir === 'up') baseAngle = Math.PI * 1.5;

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(
      pcX,
      pcY,
      pacRadius,
      baseAngle + mouthAngleRef.current * Math.PI,
      baseAngle + (2 - mouthAngleRef.current) * Math.PI
    );
    ctx.lineTo(pcX, pcY);
    ctx.closePath();
    ctx.fill();

    // Draw Monsters
    monstersRef.current.forEach((m) => {
      const mx = m.x + TILE_SZ / 2;
      const my = m.y + TILE_SZ / 2;

      ctx.fillStyle = m.isFrightened ? '#38bdf8' : m.color;
      ctx.beginPath();
      ctx.arc(mx, my - 2, 7, Math.PI, 0, false);
      ctx.lineTo(mx + 7, my + 6);
      ctx.lineTo(mx + 3, my + 4);
      ctx.lineTo(mx, my + 6);
      ctx.lineTo(mx - 3, my + 4);
      ctx.lineTo(mx - 7, my + 6);
      ctx.closePath();
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx - 2.5, my - 2, 2, 0, Math.PI * 2);
      ctx.arc(mx + 2.5, my - 2, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(mx - 2.5, my - 2, 1, 0, Math.PI * 2);
      ctx.arc(mx + 2.5, my - 2, 1, 0, Math.PI * 2);
      ctx.fill();
    });

    if (gameState !== 'gameover') {
      requestRef.current = requestAnimationFrame(gameLoop);
    }
  };

  const startGame = () => {
    gridRef.current = MAZE_MAP.map((r) => [...r]);
    pacRef.current = { x: 9 * TILE_SZ, y: 14 * TILE_SZ, dir: 'left', nextDir: 'left' };
    monstersRef.current = [
      { x: 9 * TILE_SZ, y: 8 * TILE_SZ, dir: 'up', color: '#ef4444', name: 'Dusty', isFrightened: false },
      { x: 8 * TILE_SZ, y: 8 * TILE_SZ, dir: 'up', color: '#f472b6', name: 'Sticky', isFrightened: false },
      { x: 10 * TILE_SZ, y: 8 * TILE_SZ, dir: 'up', color: '#38bdf8', name: 'Clutter', isFrightened: false },
    ];
    setScore(0);
    setFrightenedSec(0);
    setClaimedNotice(null);
    setGameState('playing');

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
      {/* Maze Screen */}
      <div className="relative bg-slate-950 p-4 rounded-3xl border-2 border-slate-800 shadow-2xl flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="rounded-2xl bg-slate-950 border border-slate-800 touch-none max-w-full"
        />

        {gameState === 'idle' && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 text-center">
            <h3 className="text-2xl font-black text-white tracking-wide mb-1">Pantry Chomper</h3>
            <p className="text-xs text-slate-400 mb-6 max-w-xs">
              Munch through the pantry maze! Chomp red Power Apples to chase away the Mess Monsters.
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg transition active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" /> Chomp Away
            </button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 text-center">
            <div className="text-4xl mb-2">👻</div>
            <h3 className="text-2xl font-black text-rose-400 mb-1">Caught by Clutter!</h3>
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
                <RotateCcw className="w-3.5 h-3.5" /> Play Again
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

        {/* Mobile On-Screen D-Pad */}
        <div className="mt-4 flex flex-col items-center gap-1.5 sm:hidden">
          <button
            onClick={() => queueDirection('up')}
            className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
          >
            <ArrowUp className="w-6 h-6" />
          </button>
          <div className="flex gap-4">
            <button
              onClick={() => queueDirection('left')}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => queueDirection('down')}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
            >
              <ArrowDown className="w-6 h-6" />
            </button>
            <button
              onClick={() => queueDirection('right')}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Info & Stats Panel */}
      <div className="w-full lg:w-72 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Score</div>
          <div className="text-3xl font-black text-yellow-400">{score}</div>
          <div className="text-xs text-slate-500">High Score: {highScore} ({playerName})</div>
        </div>

        {frightenedSec > 0 && (
          <div className="bg-sky-500/20 border border-sky-500/40 p-3 rounded-2xl text-xs font-bold text-sky-300 animate-pulse flex items-center justify-between">
            <span>⚡ CHOMP MONSTERS!</span>
            <span>{Math.ceil(frightenedSec)}s</span>
          </div>
        )}

        <div className="space-y-2 pt-3 border-t border-slate-800 text-xs text-slate-300">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="font-bold text-yellow-300">Pantry Tips:</div>
            <div className="text-[11px] text-slate-400">• Dots give +10 points each.</div>
            <div className="text-[11px] text-slate-400">• 4 Red Apples scare monsters for 7s.</div>
            <div className="text-[11px] text-slate-400">• Chomping a scared monster gives +100.</div>
            <div className="text-[11px] text-slate-400">• Left & right tunnels wrap around!</div>
          </div>
        </div>

        <div className="mt-auto bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
          <span className="text-yellow-300 font-semibold">Controls:</span> Swipe anywhere on screen or use on-screen arrows (or Arrow/WASD keys on keyboard).
        </div>
      </div>
    </div>
  );
};

export default PantryChomperGame;
