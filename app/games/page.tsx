'use client';

import { useState, useEffect, useRef } from 'react';
import { useFamilyMembers } from '@/hooks/use-family';
import { useCurrentUser } from '@/hooks/use-current-user';
import { audioSynth, triggerConfetti } from '@/lib/audio';
import { 
  Gamepad2, 
  Play, 
  RotateCcw, 
  Trophy, 
  Settings, 
  Sparkles, 
  User, 
  Zap,
  Info
} from 'lucide-react';

export default function GamesPage() {
  const { users, updatePoints } = useFamilyMembers();
  const { currentUser } = useCurrentUser();

  // Config States
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [collectible, setCollectible] = useState('star'); // star, cookie, diamomd
  const [obstacle, setObstacle] = useState('sock'); // sock, clock, homework
  const [speedSetting, setSpeedSetting] = useState<'easy' | 'medium' | 'hard'>('medium');

  // Game Engine States
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [pointsClaimedToday, setPointsClaimedToday] = useState(0);

  const requestRef = useRef<number | null>(null);

  // Constants
  const speeds = { easy: 4, medium: 6, hard: 9 };
  const gravity = 0.6;

  // Load high score
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedHS = localStorage.getItem('bearhouse_game_highscore');
      if (savedHS) setHighScore(parseInt(savedHS));
      
      const savedClaimDate = localStorage.getItem('bearhouse_claim_date');
      const today = new Date().toDateString();
      if (savedClaimDate === today) {
        const savedClaim = localStorage.getItem('bearhouse_claim_points');
        if (savedClaim) setPointsClaimedToday(parseInt(savedClaim));
      } else {
        localStorage.setItem('bearhouse_claim_date', today);
        localStorage.setItem('bearhouse_claim_points', '0');
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser && !selectedPlayerId) {
      setSelectedPlayerId(currentUser.id);
    }
  }, [currentUser, selectedPlayerId]);

  // Main Game Loop
  const startGame = () => {
    setGameState('playing');
    setScore(0);
    audioSynth.playLevelUp();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Game Entities
    const player = {
      x: 50,
      y: canvas.height - 60,
      vy: 0,
      width: 40,
      height: 40,
      isJumping: false,
      color: users.find(u => u.id === selectedPlayerId)?.color || 'bg-yellow-400',
      name: users.find(u => u.id === selectedPlayerId)?.name[0] || 'P'
    };

    let obstacleList: { x: number; y: number; width: number; height: number }[] = [];
    let collectibleList: { x: number; y: number; size: number; active: boolean }[] = [];
    
    let frame = 0;
    const currentSpeed = speeds[speedSetting];

    const jump = () => {
      if (!player.isJumping) {
        player.vy = -12;
        player.isJumping = true;
        audioSynth.playCheckmark();
      }
    };

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
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
    canvas.addEventListener('touchstart', handleCanvasClick);

    const loop = () => {
      frame++;
      
      // Clear Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Background Sky Grid
      ctx.strokeStyle = '#f1f5f9';
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
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 20);
      ctx.lineTo(canvas.width, canvas.height - 20);
      ctx.stroke();

      // Apply Gravity
      player.vy += gravity;
      player.y += player.vy;

      // Ground Collision
      if (player.y >= canvas.height - 60) {
        player.y = canvas.height - 60;
        player.vy = 0;
        player.isJumping = false;
      }

      // Draw Player (Neo-brutalist circle with initial letter)
      ctx.fillStyle = player.color.includes('blue') ? '#3b82f6' : 
                      player.color.includes('pink') ? '#ec4899' :
                      player.color.includes('green') ? '#10b981' :
                      player.color.includes('yellow') ? '#f59e0b' :
                      player.color.includes('purple') ? '#8b5cf6' : '#6366f1';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x + 20, player.y + 20, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner text letter
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 18px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.name.toUpperCase(), player.x + 20, player.y + 20);

      // Spawn Obstacles (Socks / Clutter / Clock)
      if (frame % 100 === 0) {
        obstacleList.push({
          x: canvas.width,
          y: canvas.height - 50,
          width: 30,
          height: 30
        });
      }

      // Spawn Collectibles (Stars / Cookies)
      if (frame % 70 === 0) {
        collectibleList.push({
          x: canvas.width,
          y: canvas.height - 120 - Math.random() * 60,
          size: 10,
          active: true
        });
      }

      // Draw & Move Obstacles
      ctx.fillStyle = '#ef4444'; // Red obstacle
      obstacleList.forEach((obs, idx) => {
        obs.x -= currentSpeed;
        
        // Neo-brutalist Obstacle Drawing
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        
        // Inner X mark for obstacle
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(obs.x + 8, obs.y + 8);
        ctx.lineTo(obs.x + obs.width - 8, obs.y + obs.height - 8);
        ctx.moveTo(obs.x + obs.width - 8, obs.y + 8);
        ctx.lineTo(obs.x + 8, obs.y + obs.height - 8);
        ctx.stroke();
        ctx.strokeStyle = '#0f172a'; // restore stroke

        // Collision Check
        if (
          player.x < obs.x + obs.width &&
          player.x + player.width > obs.x &&
          player.y < obs.y + obs.height &&
          player.y + player.height > obs.y
        ) {
          // Crash! Game Over
          setGameState('gameover');
          audioSynth.playTimerAlert();
          cancelAnimationFrame(requestRef.current!);
          window.removeEventListener('keydown', handleKeyDown);
          return;
        }
      });

      // Draw & Move Collectibles
      ctx.fillStyle = '#eab308'; // Gold star
      collectibleList.forEach((col) => {
        if (!col.active) return;
        col.x -= currentSpeed;

        // Draw star-like diamond
        ctx.beginPath();
        ctx.moveTo(col.x, col.y - col.size);
        ctx.lineTo(col.x + col.size, col.y);
        ctx.lineTo(col.x, col.y + col.size);
        ctx.lineTo(col.x - col.size, col.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Collision Check
        const dist = Math.hypot((player.x + 20) - col.x, (player.y + 20) - col.y);
        if (dist < 28) {
          col.active = false;
          setScore(s => {
            const nextScore = s + 10;
            if (nextScore > highScore) {
              setHighScore(nextScore);
              localStorage.setItem('bearhouse_game_highscore', nextScore.toString());
            }
            return nextScore;
          });
          audioSynth.playCheckmark();
        }
      });

      // Cleanup offscreen objects
      obstacleList = obstacleList.filter(o => o.x > -50);
      collectibleList = collectibleList.filter(c => c.x > -50);

      if (gameState !== 'gameover') {
        requestRef.current = requestAnimationFrame(loop);
      }
    };

    requestRef.current = requestAnimationFrame(loop);
  };

  const claimPoints = () => {
    // ADHD Break Incentive: Convert Score to Points!
    // 100 game points = 5 reward points, capped at 25 points daily limit to keep it balanced
    const pointsToClaim = Math.floor(score / 50); // 50 score = 1 point
    
    if (pointsToClaim === 0) {
      alert("Score at least 50 points to claim a star!");
      return;
    }

    const currentLimit = 50;
    const remainingLimit = currentLimit - pointsClaimedToday;
    const actualClaim = Math.min(pointsToClaim, remainingLimit);

    if (actualClaim === 0) {
      alert("You have reached your daily limit of 50 game-reward points!");
      return;
    }

    updatePoints(selectedPlayerId, actualClaim);
    setPointsClaimedToday(p => p + actualClaim);

    const today = new Date().toDateString();
    localStorage.setItem('bearhouse_claim_date', today);
    localStorage.setItem('bearhouse_claim_points', (pointsClaimedToday + actualClaim).toString());
    
    triggerConfetti();
    audioSynth.playLevelUp();

    alert(`Successfully claimed +${actualClaim} Stars for ${users.find(u => u.id === selectedPlayerId)?.name}!`);
  };

  const getPlayerLabel = (id: string) => {
    return users.find(u => u.id === id)?.name || 'Player';
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 xl:p-12 relative bg-slate-50 h-full">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center gap-3">
          <div className="p-3 bg-[#c084fc] text-slate-900 border-2 border-slate-900 rounded-xl shadow-[3px_3px_0_#1e293b]">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-4xl font-black uppercase text-slate-900 tracking-tight">Mini Game Builder</h1>
            <p className="text-slate-500 mt-1">Design a 2D break runner for dopamine reset. Convert your high scores to stars!</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Game Builder Controls Panel */}
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl border-4 border-slate-900 shadow-[8px_8px_0_#1e293b] flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-black uppercase text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5" /> Config Board
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">Select Runner</label>
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] rounded-xl text-sm font-bold bg-white"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">Collectible Item</label>
                <select
                  value={collectible}
                  onChange={(e) => setCollectible(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] rounded-xl text-sm font-bold bg-white"
                >
                  <option value="star">⭐ Golden Stars</option>
                  <option value="cookie">🍪 Chocolate Cookies</option>
                  <option value="diamond">💎 Shiny Diamonds</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">Obstacle</label>
                <select
                  value={obstacle}
                  onChange={(e) => setObstacle(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] rounded-xl text-sm font-bold bg-white"
                >
                  <option value="sock">🧦 Dirty Socks</option>
                  <option value="clock">⏰ Blaring Alarm Clocks</option>
                  <option value="homework">📝 Unfinished Homework</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">Speed Difficulty</label>
                <div className="flex gap-2 p-1 bg-slate-100 border-2 border-slate-900 rounded-xl">
                  {['easy', 'medium', 'hard'].map((level) => (
                    <button
                      key={level}
                      onClick={() => setSpeedSetting(level as any)}
                      className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border-2 transition-all ${
                        speedSetting === level 
                          ? 'bg-[#ccff00] border-slate-900 shadow-[2px_2px_0_#1e293b] text-slate-900' 
                          : 'border-transparent text-slate-500'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-xs font-bold text-slate-700 uppercase flex gap-2">
              <Zap className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <p className="mb-1 text-slate-800">Dopamine Rules:</p>
                <p className="text-[10px] text-slate-500 normal-case leading-relaxed font-semibold">
                  Every 50 score points converted grants 1 Star. Capped at 50 claimed points per user daily. Keep it fun and active!
                </p>
              </div>
            </div>
          </div>

          {/* Game Console Area */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-slate-900 rounded-[2.5rem] border-4 border-slate-900 shadow-[8px_8px_0_#1e293b] overflow-hidden p-6 flex flex-col items-center justify-center relative min-h-[400px]">
              {gameState === 'idle' && (
                <div className="text-center space-y-6 animate-in fade-in duration-500">
                  <div className="w-20 h-20 bg-white rounded-full border-4 border-slate-900 shadow-[4px_4px_0_#1e293b] flex items-center justify-center mx-auto text-slate-900">
                    <Gamepad2 className="w-10 h-10 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="font-display text-3xl font-black uppercase text-white tracking-tighter">Ready to Run?</h3>
                    <p className="text-slate-400 text-sm mt-1 uppercase font-bold tracking-widest">Press SPACEBAR or Tap screen to jump</p>
                  </div>
                  <button 
                    onClick={startGame}
                    className="px-8 py-3 bg-[#ccff00] text-slate-900 border-4 border-slate-900 shadow-[4px_4px_0_rgba(255,255,255,0.2)] rounded-2xl font-display font-black text-xl uppercase tracking-wider hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all active:scale-95 cursor-pointer"
                  >
                    <Play className="w-5 h-5 inline mr-1 stroke-[3]" /> Launch Game
                  </button>
                </div>
              )}

              {gameState === 'gameover' && (
                <div className="text-center space-y-6 animate-in zoom-in-95 duration-300">
                  <div className="text-5xl">💥</div>
                  <div>
                    <h3 className="font-display text-4xl font-black uppercase text-rose-500 tracking-tighter">Game Over!</h3>
                    <p className="text-slate-400 text-sm mt-2 font-bold uppercase tracking-widest">Final Score: {score}</p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button 
                      onClick={startGame}
                      className="px-6 py-2.5 bg-[#c084fc] text-slate-900 border-2 border-slate-900 shadow-[3px_3px_0_rgba(255,255,255,0.15)] rounded-xl font-black text-sm uppercase tracking-wider hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all active:scale-95"
                    >
                      <RotateCcw className="w-4 h-4 inline mr-1 stroke-[3]" /> Retry
                    </button>
                    <button 
                      onClick={claimPoints}
                      disabled={score < 50}
                      className="px-6 py-2.5 bg-[#ccff00] text-slate-900 border-2 border-slate-900 shadow-[3px_3px_0_rgba(255,255,255,0.15)] rounded-xl font-black text-sm uppercase tracking-wider hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-4 h-4 inline mr-1" /> Claim Stars
                    </button>
                  </div>
                </div>
              )}

              <canvas 
                ref={canvasRef} 
                width={500} 
                height={300}
                className={`bg-white rounded-2xl border-4 border-slate-900 max-w-full ${gameState === 'playing' ? 'block' : 'hidden'}`}
              />
            </div>

            {/* Scoreboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0_#1e293b] flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-black uppercase tracking-wider">Score</p>
                  <p className="text-3xl font-display font-black text-indigo-600">{score}</p>
                </div>
                <Gamepad2 className="w-8 h-8 text-indigo-200" />
              </div>
              <div className="bg-white p-5 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0_#1e293b] flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-black uppercase tracking-wider">High Score</p>
                  <p className="text-3xl font-display font-black text-yellow-500">{highScore}</p>
                </div>
                <Trophy className="w-8 h-8 text-yellow-200" />
              </div>
              <div className="bg-white p-5 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0_#1e293b] flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-black uppercase tracking-wider">Claimed Today</p>
                  <p className="text-3xl font-display font-black text-rose-500">{pointsClaimedToday} pts</p>
                </div>
                <Sparkles className="w-8 h-8 text-rose-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
