import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Flame,
  Award,
  Sparkles,
  Zap,
  PartyPopper,
  ThumbsUp,
  AlertTriangle,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import {
  computeFamilyLeaderboard,
  loadMemberStreaks,
  LeaderboardEntry,
} from '@/lib/streaks';
import { loadPointsBalance, KEYS } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { triggerConfetti } from '@/lib/confetti';
import { toast } from '@/hooks/use-toast';

const COLOR_DOT: Record<string, string> = {
  indigo: 'bg-indigo-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  blue: 'bg-blue-400',
  orange: 'bg-orange-400',
  rose: 'bg-rose-400',
  emerald: 'bg-emerald-400',
  slate: 'bg-slate-400',
};

const CHEER_EMOJIS = ['🎉', '🔥', '💪', '⭐', '🙌'];

export const LeaderboardWidget: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { householdMembers, currentUser } = useAppContext();
  const [balance, setBalance] = useState(() => loadPointsBalance());
  const [streaks, setStreaks] = useState(() => loadMemberStreaks());

  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key === KEYS.points || key === '*') {
        setBalance(loadPointsBalance());
      }
      if (key === KEYS.memberStreaks || key === '*') {
        setStreaks(loadMemberStreaks());
      }
    });
  }, []);

  const leaderboard = useMemo(() => {
    return computeFamilyLeaderboard(householdMembers, balance);
  }, [householdMembers, balance, streaks]);

  const sendCheer = (targetName: string) => {
    const randomEmoji = CHEER_EMOJIS[Math.floor(Math.random() * CHEER_EMOJIS.length)];
    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.4, 25);
    toast({
      title: `${randomEmoji} Cheer sent to ${targetName}!`,
      description: `You sent some squad encouragement.`,
    });
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="text-amber-400 font-extrabold flex items-center gap-1">🏆 1st</span>;
    if (rank === 2) return <span className="text-slate-300 font-bold flex items-center gap-1">🥈 2nd</span>;
    if (rank === 3) return <span className="text-amber-600 font-bold flex items-center gap-1">🥉 3rd</span>;
    return <span className="text-slate-500 font-semibold text-xs">{rank}th</span>;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" /> Squad Leaderboard
            </span>
          </div>
          <h3 className="text-lg font-black text-white mt-1">Streaks & Squad Points</h3>
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">No household members active yet.</div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry) => {
            const isMe = currentUser?.id === entry.memberId;
            return (
              <div
                key={entry.memberId}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  entry.rank === 1
                    ? 'bg-amber-500/10 border-amber-500/30 shadow-md shadow-amber-500/5'
                    : isMe
                    ? 'bg-slate-800/80 border-slate-700'
                    : 'bg-slate-950/60 border-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 flex-shrink-0 text-center text-sm font-bold">
                    {getRankBadge(entry.rank)}
                  </div>

                  <span className={`w-3 h-3 rounded-full ${COLOR_DOT[entry.memberColor] || 'bg-slate-400'} ring-4 ring-white/5 flex-shrink-0`} />

                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                      <span>{entry.memberName}</span>
                      {isMe && (
                        <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-normal">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="font-semibold text-amber-400">{entry.points} XP</span>
                      {entry.longestStreak > 0 && (
                        <span className="text-[11px] text-slate-500 hidden sm:inline">
                          Best: {entry.longestStreak}d
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Streak Flame Badge */}
                  {entry.currentStreak > 0 ? (
                    <div
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        entry.activeToday
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/20 animate-pulse'
                      }`}
                      title={
                        entry.activeToday
                          ? `Streak active today: ${entry.currentStreak} day(s)`
                          : `Streak at risk! Complete a chore or routine today to maintain.`
                      }
                    >
                      <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                      <span>{entry.currentStreak}d</span>
                      {!entry.activeToday && (
                        <span className="text-[9px] uppercase tracking-wide opacity-80 hidden sm:inline ml-0.5">
                          At Risk
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 px-2 py-0.5">0d</span>
                  )}

                  {!isMe && (
                    <button
                      onClick={() => sendCheer(entry.memberName)}
                      className="text-xs p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95"
                      title={`Send cheer to ${entry.memberName}`}
                    >
                      <PartyPopper className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LeaderboardWidget;
