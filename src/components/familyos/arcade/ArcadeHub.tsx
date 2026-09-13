import React, { useState, useEffect } from 'react';
import { Gamepad2, Volume2, VolumeX, Rocket, Cherry, Flame, Trophy, Sparkles } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { awardPoints, loadPointsBalance } from '@/lib/familyos';
import SockPythonGame from './SockPythonGame';
import CosmicClutterGame from './CosmicClutterGame';
import PantryChomperGame from './PantryChomperGame';

type ArcadeGameId = 'asteroids' | 'pacman' | 'snake';

const DAILY_LIMIT = 50;

export const ArcadeHub: React.FC = () => {
  const { householdMembers, currentUser } = useAppContext();
  const [activeGame, setActiveGame] = useState<ArcadeGameId>('snake');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(() => {
    return currentUser?.id || householdMembers[0]?.id || '';
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pointsClaimedToday, setPointsClaimedToday] = useState<number>(0);

  // Sync player on auth load
  useEffect(() => {
    if (currentUser?.id && !selectedPlayerId) {
      setSelectedPlayerId(currentUser.id);
    }
  }, [currentUser, selectedPlayerId]);

  // Load today's claimed points across the arcade
  useEffect(() => {
    if (!selectedPlayerId) return;
    const today = new Date().toDateString();
    const dateKey = `arcade_claim_date_${selectedPlayerId}`;
    const claimKey = `arcade_claim_pts_${selectedPlayerId}`;

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

  const selectedMember = householdMembers.find((m) => m.id === selectedPlayerId);
  const playerName = selectedMember?.name || currentUser?.name || 'Player';
  const dailyRemaining = Math.max(0, DAILY_LIMIT - pointsClaimedToday);

  const handleScoreEarned = (starsToAdd: number) => {
    if (!selectedPlayerId || starsToAdd <= 0) return;
    const actual = Math.min(starsToAdd, dailyRemaining);
    if (actual <= 0) return;

    awardPoints(selectedPlayerId, actual);

    const nextTotal = pointsClaimedToday + actual;
    setPointsClaimedToday(nextTotal);

    const today = new Date().toDateString();
    localStorage.setItem(`arcade_claim_date_${selectedPlayerId}`, today);
    localStorage.setItem(`arcade_claim_pts_${selectedPlayerId}`, nextTotal.toString());
  };

  const balance = loadPointsBalance()[selectedPlayerId] ?? 0;

  const GAMES = [
    { id: 'snake' as const, label: 'Sock Python', tag: 'Snake', icon: Flame, color: 'text-emerald-400' },
    { id: 'pacman' as const, label: 'Pantry Chomper', tag: 'Pac-Man', icon: Cherry, color: 'text-yellow-400' },
    { id: 'asteroids' as const, label: 'Cosmic Clutter', tag: 'Asteroids', icon: Rocket, color: 'text-sky-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Arcade Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl shadow-inner">
            <Gamepad2 className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Bear House Retro Arcade</h2>
            <p className="text-xs text-slate-400">
              Classic retro variants tuned for mobile & 120Hz screens. Play to reset dopamine and earn stars!
            </p>
          </div>
        </div>

        {/* Global Controls: Player & Sound */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
          >
            {householdMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>

          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition"
            title={soundEnabled ? 'Mute Audio' : 'Enable Audio'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>
        </div>
      </div>

      {/* Arcade Cabinet Selector Tabs */}
      <div className="grid grid-cols-3 gap-2">
        {GAMES.map((g) => {
          const Icon = g.icon;
          const active = activeGame === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGame(g.id)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-2 p-3 rounded-2xl border transition-all duration-150 ${
                active
                  ? 'bg-slate-800 border-amber-500/60 shadow-lg shadow-amber-500/10 text-white'
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? g.color : 'text-slate-500'}`} />
              <div className="text-center sm:text-left">
                <div className="text-xs font-bold leading-tight">{g.label}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">{g.tag}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Daily Economy Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Playing as <strong className="text-white">{playerName}</strong></span>
          <span className="text-slate-500">|</span>
          <span>Reward Balance: <strong className="text-amber-400">{balance} pts</strong></span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Daily Arcade Cap: <strong className="text-emerald-400">{pointsClaimedToday}/{DAILY_LIMIT} pts</strong></span>
          <span className="text-slate-500">({dailyRemaining} remaining)</span>
        </div>
      </div>

      {/* Active Game Cabinet */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-3xl p-4 sm:p-6 shadow-2xl">
        {activeGame === 'snake' && (
          <SockPythonGame
            selectedMemberId={selectedPlayerId}
            playerName={playerName}
            soundEnabled={soundEnabled}
            onScoreEarned={handleScoreEarned}
            dailyClaimRemaining={dailyRemaining}
          />
        )}

        {activeGame === 'asteroids' && (
          <CosmicClutterGame
            selectedMemberId={selectedPlayerId}
            playerName={playerName}
            soundEnabled={soundEnabled}
            onScoreEarned={handleScoreEarned}
            dailyClaimRemaining={dailyRemaining}
          />
        )}

        {activeGame === 'pacman' && (
          <PantryChomperGame
            selectedMemberId={selectedPlayerId}
            playerName={playerName}
            soundEnabled={soundEnabled}
            onScoreEarned={handleScoreEarned}
            dailyClaimRemaining={dailyRemaining}
          />
        )}
      </div>
    </div>
  );
};

export default ArcadeHub;
