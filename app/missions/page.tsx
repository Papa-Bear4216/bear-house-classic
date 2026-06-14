'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Star, Gamepad2, CheckCircle2, Sparkles, Zap,
  Plus, X, ChevronDown, Trash2, Edit3, Play,
  BookOpen, Dumbbell, HelpCircle, Feather, Loader2,
  ShieldCheck, Lock
} from 'lucide-react';
import { useTasks } from '@/hooks/use-tasks';
import { useFamilyMembers } from '@/hooks/use-family';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useGames, GameChallenge, GameType } from '@/hooks/use-games';
import { useSettings } from '@/hooks/use-settings';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

type Tab = 'chores' | 'play';


const GAME_TYPE_META: Record<GameType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  trivia:    { label: 'Trivia',     icon: <HelpCircle className="w-4 h-4" />, color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  challenge: { label: 'Challenge',  icon: <Dumbbell className="w-4 h-4" />,   color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  riddle:    { label: 'Riddle',     icon: <BookOpen className="w-4 h-4" />,   color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  story:     { label: 'Story',      icon: <Feather className="w-4 h-4" />,    color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
};

// ---------- Game Play Modal ----------
function GamePlayModal({ game, onClose, onComplete }: { game: GameChallenge; onClose: () => void; onComplete: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  const meta = GAME_TYPE_META[game.type];

  function handleComplete() {
    setDone(true);
    setTimeout(() => { onComplete(); onClose(); }, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border mb-2 ${meta.bg} ${meta.color}`}>
              {meta.icon} {meta.label}
            </div>
            <h3 className="font-black text-xl text-slate-900">{game.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-slate-700 font-medium leading-relaxed text-lg">{game.content}</p>

          {/* Trivia */}
          {game.type === 'trivia' && game.options && (
            <div className="space-y-2">
              {game.options.map((opt, i) => {
                const isCorrect = revealed && opt === game.answer;
                const isWrong = revealed && selected === opt && opt !== game.answer;
                return (
                  <button key={i} onClick={() => { if (!revealed) { setSelected(opt); setRevealed(true); }}}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                      isCorrect ? 'bg-green-50 border-green-400 text-green-800' :
                      isWrong ? 'bg-red-50 border-red-300 text-red-700' :
                      selected === opt ? 'border-blue-400 bg-blue-50 text-blue-800' :
                      'border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700'
                    }`}>
                    {opt}
                  </button>
                );
              })}
              {revealed && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-xl text-sm font-bold ${selected === game.answer ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {selected === game.answer ? '🎉 Correct! Great job!' : `The answer was: ${game.answer}`}
                </motion.div>
              )}
            </div>
          )}

          {/* Riddle */}
          {game.type === 'riddle' && (
            <div className="space-y-3">
              {!revealed ? (
                <button onClick={() => setRevealed(true)}
                  className="w-full py-3 bg-purple-50 border-2 border-purple-200 text-purple-700 font-bold rounded-xl hover:bg-purple-100 transition-colors">
                  Reveal Answer
                </button>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
                  <p className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-1">Answer:</p>
                  <p className="text-purple-800 font-black text-lg">{game.answer}</p>
                </motion.div>
              )}
            </div>
          )}

          {/* Story */}
          {game.type === 'story' && (
            <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl text-green-700 text-sm font-medium italic">
              Take turns adding to this story! Who can come up with the best ending?
            </div>
          )}

          {/* Challenge */}
          {game.type === 'challenge' && (
            <div className="p-4 bg-orange-50 border-2 border-orange-200 rounded-xl text-orange-700 text-sm font-semibold">
              Complete the challenge above, then tap Done!
            </div>
          )}
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors">
            Skip
          </button>
          {done ? (
            <div className="flex-1 py-3 rounded-xl bg-green-500 text-white font-black text-center flex items-center justify-center gap-2">
              <Star className="w-5 h-5 fill-white" /> +{game.xpReward} XP!
            </div>
          ) : (
            <button onClick={handleComplete}
              disabled={game.type === 'trivia' && !revealed}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" /> Done! +{game.xpReward} XP
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ---------- Create Game Form ----------
function CreateGameForm({ onSave, onCancel, createdBy }: {
  onSave: (game: Omit<GameChallenge, 'id' | 'createdAt'>) => Promise<void>;
  onCancel: () => void;
  createdBy: string;
}) {
  const [type, setType] = useState<GameType>('trivia');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [answer, setAnswer] = useState('');
  const [xp, setXp] = useState(20);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      type,
      content: content.trim(),
      options: type === 'trivia' ? options.filter(Boolean) : undefined,
      answer: (type === 'trivia' || type === 'riddle') ? answer.trim() : undefined,
      xpReward: xp,
      createdBy,
      active: true,
    });
    setSaving(false);
    onCancel();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border-2 border-blue-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Create New Game</h3>
        <button onClick={onCancel} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.entries(GAME_TYPE_META) as [GameType, typeof GAME_TYPE_META[GameType]][]).map(([t, m]) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${type === t ? `${m.bg} ${m.color} border-current` : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Game title…"
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400" />

      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder={type === 'trivia' ? 'Write the question…' : type === 'riddle' ? 'Write the riddle…' : type === 'story' ? 'Write the story starter…' : 'Describe the challenge…'}
        rows={3}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />

      {type === 'trivia' && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Answer Options</p>
          {options.map((opt, i) => (
            <input key={i} value={opt} onChange={e => { const o = [...options]; o[i] = e.target.value; setOptions(o); }}
              placeholder={`Option ${i + 1}`}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          ))}
        </div>
      )}

      {(type === 'trivia' || type === 'riddle') && (
        <input value={answer} onChange={e => setAnswer(e.target.value)}
          placeholder={type === 'trivia' ? 'Correct answer (must match an option)' : 'The answer…'}
          className="w-full px-3 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400" />
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-slate-600">XP Reward:</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setXp(Math.max(5, xp - 5))} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold">−</button>
          <span className="w-10 text-center font-black text-blue-600">{xp}</span>
          <button onClick={() => setXp(Math.min(100, xp + 5))} className="w-7 h-7 rounded-lg bg-blue-100 hover:bg-blue-200 flex items-center justify-center font-bold text-blue-600">+</button>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Save Game
      </button>
    </motion.div>
  );
}

// ---------- Main Page ----------
export default function MissionsPage() {
  const { currentUser } = useCurrentUser();
  const { tasks, updateTaskStatus } = useTasks();
  const { users } = useFamilyMembers();
  const { games, allGames, loading: gamesLoading, addGame, updateGame, deleteGame } = useGames();
  const { settings } = useSettings();

  const [tab, setTab] = useState<Tab>('chores');
  const [playingGame, setPlayingGame] = useState<GameChallenge | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [xpToast, setXpToast] = useState<{ xp: number; id: string } | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const isAbriana = currentUser?.name === 'Abriana';

  // For chores: admin sees all, child sees their own
  const choreTasks = isAdmin
    ? tasks.filter(t => t.status !== 'done')
    : tasks.filter(t => t.assigneeId === currentUser?.id && t.status !== 'done');

  const doneTasks = isAdmin
    ? tasks.filter(t => t.status === 'done').slice(0, 10)
    : tasks.filter(t => t.assigneeId === currentUser?.id && t.status === 'done').slice(0, 5);

  const totalXP = (currentUser?.points ?? 0);

  async function completeChore(taskId: string, points: number) {
    setCompleting(taskId);
    await updateTaskStatus(taskId, 'done');
    if (settings.points.autoAward && db && currentUser?.id) {
      try {
        const newPts = (currentUser.points ?? 0) + points;
        await updateDoc(doc(db, 'users', currentUser.id), { points: newPts });
      } catch { /* non-critical */ }
    }
    setXpToast({ xp: points, id: taskId });
    setTimeout(() => setXpToast(null), 2500);
    setCompleting(null);
  }

  async function handleGameComplete(game: GameChallenge) {
    if (!db || !currentUser?.id) return;
    try {
      const newPts = (currentUser.points ?? 0) + game.xpReward;
      await updateDoc(doc(db, 'users', currentUser.id), { points: newPts });
      setXpToast({ xp: game.xpReward, id: game.id });
      setTimeout(() => setXpToast(null), 2500);
    } catch { /* non-critical */ }
  }

  function getUserName(assigneeId: string) {
    return users.find(u => u.id === assigneeId)?.name ?? 'Unassigned';
  }

  function getTaskXP(task: { pointsValue?: number }) {
    return task.pointsValue ?? settings.points.defaultTaskPoints;
  }

  const accentColor = isAbriana ? 'bg-pink-500' : 'bg-blue-600';
  const accentText = isAbriana ? 'text-pink-600' : 'text-blue-600';
  const accentLight = isAbriana ? 'bg-pink-50' : 'bg-blue-50';

  return (
    <div className={`flex-1 overflow-y-auto pb-24 ${isAbriana ? 'bg-pink-50/30' : 'bg-slate-50'}`}>
      {/* XP Toast */}
      <AnimatePresence>
        {xpToast && (
          <motion.div initial={{ opacity: 0, y: -40, x: '-50%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
            className="fixed top-4 left-1/2 z-50 pointer-events-none">
            <div className="bg-yellow-400 text-yellow-900 font-black text-lg px-6 py-3 rounded-full shadow-xl flex items-center gap-2">
              <Star className="w-5 h-5 fill-yellow-700" /> +{xpToast.xp} XP!
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className={`bg-white border-b border-slate-100 px-4 pt-8 pb-0`}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className={`font-display text-3xl font-black tracking-tight ${isAbriana ? 'text-pink-600' : 'text-slate-900'} uppercase italic`}>
                Missions
              </h1>
              <p className="text-slate-500 text-sm font-medium mt-0.5">Complete chores, earn XP, play games</p>
            </div>
            {/* XP badge */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl ${isAbriana ? 'bg-pink-100' : 'bg-yellow-50'} border ${isAbriana ? 'border-pink-200' : 'border-yellow-200'}`}>
              <Trophy className={`w-5 h-5 ${isAbriana ? 'text-pink-500' : 'text-yellow-500'}`} />
              <span className={`font-black text-lg ${isAbriana ? 'text-pink-600' : 'text-yellow-700'}`}>{totalXP}</span>
              <span className={`text-xs font-bold ${isAbriana ? 'text-pink-400' : 'text-yellow-600'}`}>XP</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0">
            {([['chores', 'Chore Quests', <Sparkles key="s" className="w-4 h-4" />], ['play', 'Play & Games', <Gamepad2 key="g" className="w-4 h-4" />]] as const).map(([id, label, icon]) => (
              <button key={id} onClick={() => setTab(id as Tab)}
                className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold border-b-2 transition-all -mb-px ${
                  tab === id
                    ? (isAbriana ? 'border-pink-500 text-pink-600' : 'border-blue-600 text-blue-600')
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">

        {/* ========== CHORES TAB ========== */}
        {tab === 'chores' && (
          <div className="space-y-4">

            {choreTasks.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-16 space-y-3">
                <div className={`w-16 h-16 rounded-full ${accentLight} flex items-center justify-center mx-auto`}>
                  <CheckCircle2 className={`w-8 h-8 ${accentText}`} />
                </div>
                <p className="font-black text-slate-900 text-xl">All clear!</p>
                <p className="text-slate-500 text-sm">No chores waiting. Go play some games!</p>
                <button onClick={() => setTab('play')}
                  className={`mt-2 px-5 py-2.5 ${accentColor} text-white font-bold rounded-xl hover:opacity-90 transition-opacity`}>
                  Play Games →
                </button>
              </motion.div>
            ) : (
              <>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                  {choreTasks.length} quest{choreTasks.length !== 1 ? 's' : ''} waiting
                </p>
                {choreTasks.map((task, i) => {
                  const xp = getTaskXP(task);
                  const assignee = getUserName(task.assigneeId ?? '');
                  const isCompleting = completing === task.id;
                  return (
                    <motion.div key={task.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-slate-300 hover:shadow-sm transition-all">
                      <div className={`w-11 h-11 rounded-2xl ${accentLight} flex items-center justify-center shrink-0`}>
                        <Sparkles className={`w-5 h-5 ${accentText}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{task.title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {isAdmin && <span className="text-xs text-slate-400 font-medium">{assignee}</span>}
                          {task.date && <span className="text-xs text-slate-400">{task.date}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 px-2 py-1 bg-yellow-50 rounded-lg">
                          <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-400" />
                          <span className="text-xs font-black text-yellow-700">+{xp}</span>
                        </div>
                        <button
                          onClick={() => completeChore(task.id, xp)}
                          disabled={isCompleting}
                          className={`w-9 h-9 rounded-xl ${accentColor} text-white flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-50 active:scale-95`}>
                          {isCompleting
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <CheckCircle2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </>
            )}

            {/* Recently Completed */}
            {doneTasks.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer flex items-center gap-2 px-1 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider list-none">
                  <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                  {doneTasks.length} completed
                </summary>
                <div className="mt-2 space-y-2">
                  {doneTasks.map(task => (
                    <div key={task.id} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-3 opacity-60">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <p className="text-sm font-medium text-slate-500 line-through flex-1 truncate">{task.title}</p>
                      <span className="text-xs font-bold text-green-600">Done</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ========== PLAY TAB ========== */}
        {tab === 'play' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {games.length} game{games.length !== 1 ? 's' : ''} available
              </p>
              {isAdmin && (
                <button onClick={() => setShowCreate(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg ${showCreate ? 'bg-slate-200 text-slate-700' : `${accentColor} text-white`} transition-colors`}>
                  {showCreate ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><Plus className="w-3.5 h-3.5" /> New Game</>}
                </button>
              )}
            </div>

            {/* Create form */}
            <AnimatePresence>
              {showCreate && isAdmin && (
                <CreateGameForm
                  onSave={addGame}
                  onCancel={() => setShowCreate(false)}
                  createdBy={currentUser?.name ?? 'Admin'}
                />
              )}
            </AnimatePresence>

            {gamesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : games.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 space-y-3">
                <div className={`w-16 h-16 rounded-full ${accentLight} flex items-center justify-center mx-auto`}>
                  <Gamepad2 className={`w-8 h-8 ${accentText}`} />
                </div>
                <p className="font-black text-slate-900 text-xl">No games yet!</p>
                {isAdmin ? (
                  <p className="text-slate-500 text-sm">Create the first game for the kids.</p>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                    <Lock className="w-4 h-4" /> Ask Mike or Gwen to add some games.
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {games.map((game, i) => {
                  const meta = GAME_TYPE_META[game.type];
                  return (
                    <motion.div key={game.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${meta.bg} ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => updateGame(game.id, { active: false })}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <h3 className="font-black text-slate-900 mb-1 leading-tight">{game.title}</h3>
                      <p className="text-sm text-slate-500 line-clamp-2 mb-4">{game.content}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 px-2 py-1 bg-yellow-50 rounded-lg">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-400" />
                          <span className="text-xs font-black text-yellow-700">+{game.xpReward} XP</span>
                        </div>
                        <button onClick={() => setPlayingGame(game)}
                          className={`flex items-center gap-1.5 px-3 py-2 ${accentColor} text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity`}>
                          <Play className="w-3.5 h-3.5" /> Play
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Admin: show inactive games */}
            {isAdmin && allGames.filter(g => g.active === false).length > 0 && (
              <details className="group">
                <summary className="cursor-pointer flex items-center gap-2 px-1 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider list-none">
                  <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                  {allGames.filter(g => g.active === false).length} hidden games
                </summary>
                <div className="mt-2 space-y-2">
                  {allGames.filter(g => g.active === false).map(game => (
                    <div key={game.id} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-3 opacity-50">
                      <p className="text-sm font-bold text-slate-700 flex-1">{game.title}</p>
                      <button onClick={() => updateGame(game.id, { active: true })}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                        <Edit3 className="w-3 h-3" /> Restore
                      </button>
                      <button onClick={() => deleteGame(game.id)}
                        className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Kids' guide: what is the admin for */}
            {!isAdmin && (
              <div className="mt-4 p-4 bg-white rounded-2xl border border-slate-100 flex items-center gap-3 text-sm text-slate-500">
                <ShieldCheck className="w-5 h-5 text-slate-300 shrink-0" />
                <span>Mike or Gwen can add new games using the <strong className="text-slate-700">New Game</strong> button.</span>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Game Play Modal */}
      <AnimatePresence>
        {playingGame && (
          <GamePlayModal
            game={playingGame}
            onClose={() => setPlayingGame(null)}
            onComplete={() => handleGameComplete(playingGame)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
