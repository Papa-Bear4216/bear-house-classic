import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Gamepad2, Play, RotateCcw, Trophy, Settings, Sparkles,
  Zap, Volume2, VolumeX
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { awardPoints, loadPointsBalance } from '@/lib/familyos';
import { audioSynth, triggerConfetti } from '@/lib/audio';

type CollectibleType = 'star' | 'cookie' | 'diamond';
type ObstacleType = 'sock' | 'clock' | 'homework';
type SpeedLevel = 'easy' | 'medium' | 'hard';
type GameState = 'idle' | 'playing' | 'gameover';

const SPEEDS: Record<SpeedLevel, number> = { easy: 4, medium: 6, hard: 8.5 };
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const DAILY_LIMIT = 50; // max points that can be claimed per member per day

const MEMBER_COLORS: Record<string, string> = {
  indigo: '#818cf8',
  pink: '#f472b6',
  purple: '#c084fc',
  blue: '#60a5fa',
  orange: '#fb923c',
  rose: '#fb7185',
  emerald: '#34d399',
  slate: '#94a3b8',
};

export const ChoreRunnerGame: React.FC = () => {
  const { householdMembers, currentUser } = useAppContext();

  // Player selection
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(() => {
    return currentUser?.id || householdMembers[0]?.id || '';
  });

  // Config settings
  const [collectible, setCollectible] = useState<CollectibleType>('star');
  const [obstacle, setObstacle] = useState<ObstacleType>('sock');
  const [speedSetting, setSpeedSetting] = useState<SpeedLevel>('medium');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Game Engine state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [pointsClaimedToday, setPointsClaimedToday] = useState<number>(0);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);

  const requestRef = useRef<number | null>(null);
  const isJumpingRef = useRef<boolean>(false);
  const triggerJumpRef = useRef<() => void>(() => {});

  // Update selectedPlayerId if currentUser becomes available
  useEffect(() => {
    if (currentUser?.id && !selectedPlayerId) {
      setSelectedPlayerId(currentUser.id);
    }
  }, [currentUser, selectedPlayerId]);

  // Load High Score & Daily Claims for selected member
  useEffect(() => {
    if (!selectedPlayerId) return;

    const hsKey = `bearhouse_game_highscore_${selectedPlayerId}`;
    const savedHS = localStorage.getItem(hsKey);
    setHighScore(savedHS ? parseInt(savedHS, 10) : 0);

    const today = new Date().toDateString();
    const dateKey = `bearhouse_claim_date_${selectedPlayerId}`;
    const claimKey = `bearhouse_claim_points_${selectedPlayerId}`;

    const savedDate = localStorage.getItem(dateKey);
    if (savedDate === today) {
      const savedClaim = localStorage.getItem(claimKey);
      setPointsClaimedToday(savedClaim ? parseInt(savedClaim, 10) : 0);
    } else {
      localStorage.setItem(dateKey, today);
      localStorage.setItem(claimKey, '0');
      setPointsClaimedToday(0);
    }
  }, [selectedPlayerId]);

  // Cleanup game loop on unmount
  useEffect(() => {
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const selectedMember = householdMembers.find((m) => m.id === selectedPlayerId);
  const playerName = selectedMember?.name || currentUser?.name || 'Player';
  const playerColorHex = selectedMember?.color ? (MEMBER_COLORS[selectedMember.color] || '#60a5fa') : '#60a5fa';

  // Jump handler
  const jump = useCallback(() => {
    if (!isJumpingRef.current) {
      triggerJumpRef.current();
      if (soundEnabled) {
        audioSynth.playCheckmark();
      }
    }
  }, [soundEnabled]);

  // Main Game Loop
  const startGame = () => {
    setGameState('playing');
    setScore(0);
    setClaimFeedback(null);
    if (soundEnabled) {
      audioSynth.playLevelUp();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Entities
    const player = {
      x: 50,
      y: canvas.height - 60,
      vy: 0,
      width: 40,
      height: 40,
      isJumping: false,
      color: playerColorHex,
      initial: playerName.charAt(0).toUpperCase() || 'P',
    };

    let obstacleList: { x: number; y: number; width: number; height: number }[] = [];
    let collectibleList: { x: number; y: number; size: number; active: boolean }[] = [];

    let frame = 0;
    let currentScore = 0;
    const currentSpeed = SPEEDS[speedSetting];

    triggerJumpRef.current = () => {
      if (!player.isJumping) {
        player.vy = JUMP_FORCE;
        player.isJumping = true;
        isJumpingRef.current = true;
      }
    };

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Touch/Click control on canvas
    const handleCanvasClick = (e: Event) => {
      e.preventDefault();
      jump();
    };
    canvas.addEventListener('mousedown', handleCanvasClick);
    canvas.addEventListener('touchstart', handleCanvasClick, { passive: false });

    const loop = () => {
      frame++;

      // Clear Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Background Grid (Subtle Dark Mode Compatible)
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw Floor line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 20);
      ctx.lineTo(canvas.width, canvas.height - 20);
      ctx.stroke();

      // Apply Gravity
      player.vy += GRAVITY;
      player.y += player.vy;

      // Ground Collision
      if (player.y >= canvas.height - 60) {
        player.y = canvas.height - 60;
        player.vy = 0;
        player.isJumping = false;
        isJumpingRef.current = false;
      }

      // Draw Player
      ctx.fillStyle = player.color;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x + 20, player.y + 20, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner text letter
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.initial, player.x + 20, player.y + 21);

      // Spawn Obstacles
      if (frame % 95 === 0) {
        obstacleList.push({
          x: canvas.width,
          y: canvas.height - 52,
          width: 32,
          height: 32,
        });
      }

      // Spawn Collectibles
      if (frame % 65 === 0) {
        collectibleList.push({
          x: canvas.width,
          y: canvas.height - 110 - Math.random() * 50,
          size: 10,
          active: true,
        });
      }

      // Draw & Move Obstacles
      obstacleList.forEach((obs) => {
        obs.x -= currentSpeed;

        if (obstacle === 'sock') {
          // Draw Sock
          ctx.fillStyle = '#f87171';
          ctx.strokeStyle = '#7f1d1d';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y + 6, obs.width - 4, obs.height - 6, [4, 4, 12, 12]);
          ctx.fill();
          ctx.stroke();
          // Sock cuff
          ctx.fillStyle = '#fee2e2';
          ctx.fillRect(obs.x, obs.y, obs.width - 4, 6);
        } else if (obstacle === 'clock') {
          // Draw Clock
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(obs.x + 16, obs.y + 16, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Hands
          ctx.strokeStyle = '#78350f';
          ctx.beginPath();
          ctx.moveTo(obs.x + 16, obs.y + 16);
          ctx.lineTo(obs.x + 16, obs.y + 7);
          ctx.moveTo(obs.x + 16, obs.y + 16);
          ctx.lineTo(obs.x + 23, obs.y + 16);
          ctx.stroke();
        } else {
          // Draw Homework Sheet
          ctx.fillStyle = '#f1f5f9';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.fillRect(obs.x, obs.y, obs.width - 6, obs.height);
          ctx.strokeRect(obs.x, obs.y, obs.width - 6, obs.height);
          // Red F on homework
          ctx.fillStyle = '#dc2626';
          ctx.font = 'bold 14px monospace';
          ctx.fillText('F', obs.x + 10, obs.y + 16);
        }

        // Collision Check
        if (
          player.x < obs.x + obs.width &&
          player.x + player.width > obs.x &&
          player.y < obs.y + obs.height &&
          player.y + player.height > obs.y
        ) {
          setGameState('gameover');
          if (soundEnabled) {
            audioSynth.playTimerAlert();
          }
          if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
          }
          window.removeEventListener('keydown', handleKeyDown);
          canvas.removeEventListener('mousedown', handleCanvasClick);
          canvas.removeEventListener('touchstart', handleCanvasClick);
        }
      });

      // Draw & Move Collectibles
      collectibleList.forEach((col) => {
        if (!col.active) return;
        col.x -= currentSpeed;

        if (collectible === 'star') {
          // Gold star
          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(col.x, col.y - col.size);
          ctx.lineTo(col.x + col.size * 0.4, col.y - col.size * 0.3);
          ctx.lineTo(col.x + col.size, col.y);
          ctx.lineTo(col.x + col.size * 0.4, col.y + col.size * 0.4);
          ctx.lineTo(col.x, col.y + col.size);
          ctx.lineTo(col.x - col.size * 0.4, col.y + col.size * 0.4);
          ctx.lineTo(col.x - col.size, col.y);
          ctx.lineTo(col.x - col.size * 0.4, col.y - col.size * 0.3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (collectible === 'cookie') {
          // Chocolate cookie
          ctx.fillStyle = '#d97706';
          ctx.beginPath();
          ctx.arc(col.x, col.y, col.size, 0, Math.PI * 2);
          ctx.fill();
          // Chips
          ctx.fillStyle = '#78350f';
          ctx.fillRect(col.x - 3, col.y - 3, 2, 2);
          ctx.fillRect(col.x + 2, col.y - 1, 2, 2);
          ctx.fillRect(col.x - 1, col.y + 3, 2, 2);
        } else {
          // Shiny diamond
          ctx.fillStyle = '#38bdf8';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(col.x, col.y - col.size);
          ctx.lineTo(col.x + col.size, col.y);
          ctx.lineTo(col.x, col.y + col.size);
          ctx.lineTo(col.x - col.size, col.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Collision Check with Player
        const dist = Math.hypot(player.x + 20 - col.x, player.y + 20 - col.y);
        if (dist < 28) {
          col.active = false;
          currentScore += 10;
          setScore(currentScore);

          setHighScore((prevHs) => {
            if (currentScore > prevHs) {
              localStorage.setItem(`bearhouse_game_highscore_${selectedPlayerId}`, currentScore.toString());
              return currentScore;
            }
            return prevHs;
          });

          if (soundEnabled) {
            audioSynth.playCheckmark();
          }
        }
      });

      // Remove offscreen objects
      obstacleList = obstacleList.filter((o) => o.x > -50);
      collectibleList = collectibleList.filter((c) => c.x > -50);

      if (gameState !== 'gameover') {
        requestRef.current = requestAnimationFrame(loop);
      }
    };

    requestRef.current = requestAnimationFrame(loop);
  };

  // Claim Points (50 game score = 1 star/point in Classic Points economy)
  const handleClaimPoints = () => {
    if (!selectedPlayerId) return;

    const pointsToClaim = Math.floor(score / 50);
    if (pointsToClaim === 0) {
      setClaimFeedback('Score at least 50 points to claim a star!');
      return;
    }

    const remainingLimit = DAILY_LIMIT - pointsClaimedToday;
    const actualClaim = Math.min(pointsToClaim, remainingLimit);

    if (actualClaim <= 0) {
      setClaimFeedback(`You reached the daily limit of ${DAILY_LIMIT} reward points for today!`);
      return;
    }

    // Directly credit member's balance in FamilyOS Points System
    awardPoints(selectedPlayerId, actualClaim);

    const newClaimed = pointsClaimedToday + actualClaim;
    setPointsClaimedToday(newClaimed);

    const today = new Date().toDateString();
    localStorage.setItem(`bearhouse_claim_date_${selectedPlayerId}`, today);
    localStorage.setItem(`bearhouse_claim_points_${selectedPlayerId}`, newClaimed.toString());

    if (soundEnabled) {
      triggerConfetti();
      audioSynth.playLevelUp();
    }

    const currentBalance = loadPointsBalance()[selectedPlayerId] ?? actualClaim;
    setClaimFeedback(`+${actualClaim} Stars awarded to ${playerName}! (Total balance: ${currentBalance} pts)`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Dopamine Runner</h2>
            <p className="text-sm text-slate-400">Quick focus reset. Jump over clutter, collect treats, and claim real stars!</p>
          </div>
        </div>

        <button
          onClick={() => setSoundEnabled((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
          title={soundEnabled ? 'Mute Retro Sound' : 'Enable Sound'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" /> Game Settings
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Runner</label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-amber-500"
              >
                {householdMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Treat to Collect</label>
              <select
                value={collectible}
                onChange={(e) => setCollectible(e.target.value as CollectibleType)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-amber-500"
              >
                <option value="star">⭐ Golden Stars (+10 pts)</option>
                <option value="cookie">🍪 Chocolate Cookies (+10 pts)</option>
                <option value="diamond">💎 Shiny Diamonds (+10 pts)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Clutter Obstacle</label>
              <select
                value={obstacle}
                onChange={(e) => setObstacle(e.target.value as ObstacleType)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-amber-500"
              >
                <option value="sock">🧦 Dirty Floor Socks</option>
                <option value="clock">⏰ Blaring Alarm Clocks</option>
                <option value="homework">📝 Unfinished Homework</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Speed Difficulty</label>
              <div className="grid grid-cols-3 gap-2">
                {(['easy', 'medium', 'hard'] as SpeedLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSpeedSetting(lvl)}
                    className={`py-1.5 text-xs font-semibold uppercase tracking-wider rounded-xl border transition ${
                      speedSetting === lvl
                        ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-sm'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex gap-2.5 items-start text-xs text-amber-200">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">Dopamine Rules:</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                50 game score = 1 Star added directly to your Reward Store balance. Capped at 50 claimed points daily per person.
              </p>
            </div>
          </div>
        </div>

        {/* Canvas Game Console */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-6 flex flex-col items-center justify-center relative min-h-[340px] shadow-inner">
            {gameState === 'idle' && (
              <div className="text-center space-y-4 max-w-sm">
                <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto text-amber-400 shadow-lg">
                  <Gamepad2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">Ready to Run, {playerName}?</h3>
                  <p className="text-xs text-slate-400 mt-1 uppercase font-semibold tracking-wider">
                    Press SPACE / UP ARROW or tap screen to jump
                  </p>
                </div>
                <button
                  onClick={startGame}
                  className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-bold text-sm tracking-wide transition transform active:scale-95 shadow-md flex items-center gap-2 mx-auto"
                >
                  <Play className="w-4 h-4 fill-current" /> Launch Game
                </button>
              </div>
            )}

            {gameState === 'gameover' && (
              <div className="text-center space-y-4 max-w-sm">
                <div className="text-4xl">💥</div>
                <div>
                  <h3 className="text-3xl font-black text-rose-500 tracking-tight">Crash!</h3>
                  <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">
                    Final Score: <span className="text-white text-base">{score}</span>
                  </p>
                  {claimFeedback && (
                    <div className="mt-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 py-1 px-2.5 rounded-lg">
                      {claimFeedback}
                    </div>
                  )}
                </div>
                <div className="flex gap-2.5 justify-center">
                  <button
                    onClick={startGame}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-slate-700 transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Try Again
                  </button>
                  <button
                    onClick={handleClaimPoints}
                    disabled={score < 50}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" /> Claim Stars (+{Math.floor(score / 50)})
                  </button>
                </div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              width={500}
              height={300}
              className={`bg-slate-900/90 rounded-xl border border-slate-800 max-w-full cursor-pointer ${
                gameState === 'playing' ? 'block' : 'hidden'
              }`}
            />
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Run</p>
                <p className="text-2xl font-black text-amber-400">{score}</p>
              </div>
              <Gamepad2 className="w-6 h-6 text-slate-700" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">High Score</p>
                <p className="text-2xl font-black text-yellow-500">{highScore}</p>
              </div>
              <Trophy className="w-6 h-6 text-slate-700" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Claimed Today</p>
                <p className="text-2xl font-black text-emerald-400">{pointsClaimedToday} / {DAILY_LIMIT}</p>
              </div>
              <Sparkles className="w-6 h-6 text-slate-700" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChoreRunnerGame;
