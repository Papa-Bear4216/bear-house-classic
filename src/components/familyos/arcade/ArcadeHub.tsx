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
          <div className="p-3 bg-gradient-to-tr from-amber-500/20 via-rose-500/20 to-purple-500/20 text-amber-400 border border-amber-500/30 rounded-2xl shadow-lg shadow-amber-500/10">
            <Gamepad2 className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 px-2 py-0.5 rounded-full">
                Dopamine Station
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Retro <span className="bg-gradient-to-r from-amber-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">Arcade</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Fast-paced retro games tuned for dopamine reset. Earn stars for the Reward Store!
            </p>
          </div>
        </div>

        {/* Global Controls: Player & Sound */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="px-3.5 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-amber-500 transition-all shadow-sm"
          >
            {householdMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>

          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold border border-white/10 transition-all active:scale-95 shadow-sm"
            title={soundEnabled ? 'Mute Audio' : 'Enable Audio'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>
        </div>
      </div>

      {/* Arcade Cabinet Selector Tabs */}
      <div className="grid grid-cols-3 gap-2.5">
        {GAMES.map((g) => {
          const Icon = g.icon;
          const active = activeGame === g.id;
          const activeStyles =
            g.id === 'snake'
              ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-200 shadow-lg shadow-emerald-500/10'
              : g.id === 'pacman'
              ? 'border-yellow-500/60 bg-yellow-950/30 text-yellow-200 shadow-lg shadow-yellow-500/10'
              : 'border-sky-500/60 bg-sky-950/30 text-sky-200 shadow-lg shadow-sky-500/10';

          return (
            <button
              key={g.id}
              onClick={() => setActiveGame(g.id)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-2.5 p-3.5 rounded-2xl border transition-all duration-200 active:scale-95 ${
                active
                  ? activeStyles
                  : 'bg-slate-900/50 border-white/5 hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <div className={`p-2 rounded-xl ${active ? 'bg-white/10' : 'bg-white/5'}`}>
                <Icon className={`w-5 h-5 ${active ? g.color : 'text-slate-500'}`} />
              </div>
              <div className="text-center sm:text-left">
                <div className="text-xs sm:text-sm font-bold leading-tight tracking-tight">{g.label}</div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">{g.tag}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Daily Economy Banner */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex items-center gap-2 text-slate-300">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span>Playing as <strong className="text-white font-semibold">{playerName}</strong></span>
          <span className="text-slate-600">|</span>
          <span>Reward Wallet: <strong className="text-amber-400 font-bold">{balance} pts</strong></span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Daily Star Cap: <strong className="text-emerald-400 font-bold">{pointsClaimedToday}/{DAILY_LIMIT} pts</strong></span>
          <span className="text-slate-500">({dailyRemaining} remaining)</span>
        </div>
      </div>

      {/* Active Game Cabinet */}
      <div className="bg-slate-950/90 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
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
