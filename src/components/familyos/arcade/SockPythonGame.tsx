import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Sparkles, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ShieldCheck, ShieldAlert } from 'lucide-react';
import { attachSwipeDetector, Direction } from '@/lib/arcadeEngine';
import { audioSynth, triggerConfetti } from '@/lib/audio';

interface Props {
  selectedMemberId: string;
  playerName: string;
  soundEnabled: boolean;
  onScoreEarned: (points: number) => void;
  dailyClaimRemaining: number;
}

interface Point {
  x: number;
  y: number;
}

const GRID_SIZE = 20; // 20x20 tiles
const TILE_PX = 20; // 400x400 canvas

const SPEEDS = {
  relaxed: 150,
  normal: 105,
  turbo: 70,
};

type SpeedKey = keyof typeof SPEEDS;

export const SockPythonGame: React.FC<Props> = ({
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
  const [speed, setSpeed] = useState<SpeedKey>('normal');
  const [wraparound, setWraparound] = useState<boolean>(true);
  const [claimedNotice, setClaimedNotice] = useState<string | null>(null);

  const snakeRef = useRef<Point[]>([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]);
  const dirRef = useRef<Direction>('right');
  const nextDirRef = useRef<Direction>('right');
  const foodRef = useRef<Point>({ x: 15, y: 10 });
  const isBonusFoodRef = useRef<boolean>(false);
  const intervalRef = useRef<number | null>(null);

  // Load High Score
  useEffect(() => {
    if (!selectedMemberId) return;
    const hs = localStorage.getItem(`arcade_sockpython_hs_${selectedMemberId}`);
    setHighScore(hs ? parseInt(hs, 10) : 0);
  }, [selectedMemberId]);

  const changeDirection = useCallback((newDir: Direction) => {
    const current = dirRef.current;
    if (
      (newDir === 'up' && current !== 'down') ||
      (newDir === 'down' && current !== 'up') ||
      (newDir === 'left' && current !== 'right') ||
      (newDir === 'right' && current !== 'left')
    ) {
      nextDirRef.current = newDir;
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        changeDirection('up');
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        changeDirection('down');
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        changeDirection('left');
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        changeDirection('right');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [changeDirection]);

  // Touch Swipe navigation on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return attachSwipeDetector(canvas, (dir) => changeDirection(dir));
  }, [changeDirection]);

  const spawnFood = (currentSnake: Point[]) => {
    let newPos: Point;
    let collision: boolean;
    do {
      newPos = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      collision = currentSnake.some((p) => p.x === newPos.x && p.y === newPos.y);
    } while (collision);

    foodRef.current = newPos;
    isBonusFoodRef.current = Math.random() < 0.25; // 25% chance of bonus star food
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle Grid pattern
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * TILE_PX, 0);
      ctx.lineTo(i * TILE_PX, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * TILE_PX);
      ctx.lineTo(canvas.width, i * TILE_PX);
      ctx.stroke();
    }

    // Border if not wraparound
    if (!wraparound) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
    }

    // Draw Food
    const food = foodRef.current;
    if (isBonusFoodRef.current) {
      // Golden star
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc((food.x + 0.5) * TILE_PX, (food.y + 0.5) * TILE_PX, TILE_PX * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Clean rolled sock
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(food.x * TILE_PX + 2, food.y * TILE_PX + 2, TILE_PX - 4, TILE_PX - 4, 6);
      ctx.fill();
    }

    // Draw Snake (Sock Python)
    const snake = snakeRef.current;
    snake.forEach((seg, idx) => {
      const isHead = idx === 0;
      if (isHead) {
        ctx.fillStyle = '#fbbf24'; // Golden head
      } else {
        // Alternating sock stripes
        ctx.fillStyle = idx % 2 === 0 ? '#34d399' : '#10b981';
      }

      ctx.beginPath();
      ctx.roundRect(seg.x * TILE_PX + 1, seg.y * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2, isHead ? 6 : 4);
      ctx.fill();

      // Draw eyes on head
      if (isHead) {
        ctx.fillStyle = '#0f172a';
        const cx = (seg.x + 0.5) * TILE_PX;
        const cy = (seg.y + 0.5) * TILE_PX;
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 3, 2, 0, Math.PI * 2);
        ctx.arc(cx + 3, cy - 3, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };

  const tick = () => {
    dirRef.current = nextDirRef.current;
    const dir = dirRef.current;
    const snake = [...snakeRef.current];
    const head = { ...snake[0] };

    if (dir === 'up') head.y -= 1;
    if (dir === 'down') head.y += 1;
    if (dir === 'left') head.x -= 1;
    if (dir === 'right') head.x += 1;

    // Handle Bounds
    if (wraparound) {
      if (head.x < 0) head.x = GRID_SIZE - 1;
      if (head.x >= GRID_SIZE) head.x = 0;
      if (head.y < 0) head.y = GRID_SIZE - 1;
      if (head.y >= GRID_SIZE) head.y = 0;
    } else {
      if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        gameOver();
        return;
      }
    }

    // Self-Collision Check
    if (snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
      gameOver();
      return;
    }

    snake.unshift(head);

    // Food Collision Check
    const food = foodRef.current;
    if (head.x === food.x && head.y === food.y) {
      const earned = isBonusFoodRef.current ? 25 : 10;
      setScore((s) => {
        const next = s + earned;
        if (next > highScore) {
          setHighScore(next);
          localStorage.setItem(`arcade_sockpython_hs_${selectedMemberId}`, next.toString());
        }
        return next;
      });

      if (soundEnabled) {
        audioSynth.playCheckmark();
      }
      spawnFood(snake);
    } else {
      snake.pop();
    }

    snakeRef.current = snake;
    draw();
  };

  const startGame = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    snakeRef.current = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    dirRef.current = 'right';
    nextDirRef.current = 'right';
    setScore(0);
    setClaimedNotice(null);
    setGameState('playing');
    spawnFood(snakeRef.current);

    if (soundEnabled) {
      audioSynth.playLevelUp();
    }

    draw();
    intervalRef.current = window.setInterval(tick, SPEEDS[speed]);
  };

  const gameOver = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setGameState('gameover');
    if (soundEnabled) {
      audioSynth.playTimerAlert();
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
      {/* Canvas Screen */}
      <div className="relative bg-slate-950 p-4 rounded-3xl border-2 border-slate-800 shadow-2xl flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="rounded-2xl bg-slate-900 border border-slate-800 cursor-pointer touch-none max-w-full"
        />

        {gameState === 'idle' && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 text-center">
            <h3 className="text-2xl font-black text-white tracking-wide mb-1">Sock Python</h3>
            <p className="text-xs text-slate-400 mb-6 max-w-xs">
              Guide the hungry laundry sock around the rug. Grab missing socks and golden stars!
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg transition active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" /> Start Game
            </button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 text-center">
            <div className="text-4xl mb-2">🧺</div>
            <h3 className="text-2xl font-black text-rose-400 mb-1">Sock Tangled!</h3>
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

        {/* Mobile Virtual D-Pad */}
        <div className="mt-4 flex flex-col items-center gap-1.5 sm:hidden">
          <button
            onClick={() => changeDirection('up')}
            className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
          >
            <ArrowUp className="w-6 h-6" />
          </button>
          <div className="flex gap-4">
            <button
              onClick={() => changeDirection('left')}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => changeDirection('down')}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
            >
              <ArrowDown className="w-6 h-6" />
            </button>
            <button
              onClick={() => changeDirection('right')}
              className="w-12 h-12 bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center border border-slate-700 text-white"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Settings & Stats */}
      <div className="w-full lg:w-72 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Score</div>
          <div className="text-3xl font-black text-amber-400">{score}</div>
          <div className="text-xs text-slate-500">High Score: {highScore} ({playerName})</div>
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-800">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Wall Physics</label>
            <button
              onClick={() => setWraparound((w) => !w)}
              className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition ${
                wraparound
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <span>{wraparound ? 'Chill (Wraparound)' : 'Arcade (Solid Walls)'}</span>
              {wraparound ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Speed</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['relaxed', 'normal', 'turbo'] as SpeedKey[]).map((sp) => (
                <button
                  key={sp}
                  onClick={() => setSpeed(sp)}
                  className={`py-1.5 text-[11px] font-bold uppercase rounded-lg border transition ${
                    speed === sp
                      ? 'bg-amber-400 border-amber-300 text-slate-950'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
          <span className="text-amber-300 font-semibold">Controls:</span> Swipe anywhere on screen or use on-screen arrows (or Arrow/WASD keys on keyboard).
        </div>
      </div>
    </div>
  );
};

export default SockPythonGame;
