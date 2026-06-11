'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  Sparkles, RefreshCw, CheckCircle2, Circle, CalendarDays,
  UtensilsCrossed, Wallet, ShoppingCart, Star, Zap, Users,
  Clock, Plus, Check, AlertCircle, ChevronRight, TrendingUp,
  Gamepad2, BarChart2, Heart,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useFamilyMembers } from '@/hooks/use-family';
import { useTasks } from '@/hooks/use-tasks';
import { useEvents } from '@/hooks/use-events';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMeals, getWeekStart } from '@/hooks/use-meals';
import { useShopping } from '@/hooks/use-shopping';
import { useSettings } from '@/hooks/use-settings';
import { askHermes } from '@/lib/hermes';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { trackUsage, getHermesMemory, buildMemorySummary } from '@/lib/usage-tracker';
import { getRecipeById } from '@/lib/recipes';

// ─── Shared dark card ────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-800/60 border border-slate-700/50 rounded-xl ${className}`}>
      {children}
    </div>
  );
}

// ─── Metric cards ─────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card className={`p-5 border-l-4 ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-black text-white">{value}</p>
          <p className="text-sm font-medium text-slate-400 mt-0.5">{label}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className="text-slate-500">{icon}</div>
      </div>
    </Card>
  );
}

// ─── AI Summary card ─────────────────────────────────────────────────────────

function HermesCard() {
  const { users } = useFamilyMembers();
  const { tasks } = useTasks();
  const { events } = useEvents();
  const { currentUser } = useCurrentUser();
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchBrief = useCallback(async () => {
    setLoading(true);
    try {
      const memory = await getHermesMemory();
      const usageMemory = memory ? buildMemorySummary(memory) : undefined;
      const todayTasks = tasks.filter(t => t.date === format(new Date(), 'yyyy-MM-dd') && t.status !== 'done');
      const todayEvents = events.filter(e => e.date?.startsWith(format(new Date(), 'yyyy-MM-dd')));
      const { content } = await askHermes(
        [{ role: 'user', content: `Give a warm, concise morning briefing for ${currentUser?.name ?? 'the family'}. 2-3 sentences max.` }],
        { currentUser, users, tasks: todayTasks, events: todayEvents, date: format(new Date(), 'EEEE, MMMM d h:mma'), usageMemory },
      );
      setBrief(content);
      setFetched(true);
    } catch {
      setBrief('Hermes is offline. Set ANTHROPIC_API_KEY to activate.');
      setFetched(true);
    } finally { setLoading(false); }
  }, [currentUser, users, tasks, events]);

  useEffect(() => {
    if (!fetched && currentUser) fetchBrief();
  }, [currentUser, fetched, fetchBrief]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">AI Summary</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchBrief} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/assistant" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-0.5">
            Full chat <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500 italic">Thinking…</p>
      ) : brief ? (
        <p className="text-sm text-slate-300 leading-relaxed">{brief}</p>
      ) : (
        <button onClick={fetchBrief} className="text-sm text-violet-400 hover:text-violet-300 font-medium">
          Get today&apos;s brief →
        </button>
      )}
    </Card>
  );
}

// ─── Action buttons ───────────────────────────────────────────────────────────

function ActionButtons() {
  const { addTask } = useTasks();
  const { addEvent } = useEvents();
  const { currentUser } = useCurrentUser();
  const [taskInput, setTaskInput] = useState('');
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [done, setDone] = useState(false);

  async function quickAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskInput.trim()) return;
    addTask({ title: taskInput, assigneeId: currentUser?.id ?? '1', date: format(new Date(), 'yyyy-MM-dd'), pointsValue: 10, status: 'pending', completed: false });
    setTaskInput('');
    setDone(true);
    setTimeout(() => { setDone(false); setShowTaskInput(false); }, 1500);
    trackUsage('home', 'quick-add-task');
  }

  const actions = [
    { label: '+ Task', color: 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/30 text-orange-300', onClick: () => setShowTaskInput(s => !s) },
    { label: '+ Event', color: 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/30 text-blue-300', href: '/calendar' },
    { label: '+ Meal', color: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30 text-emerald-300', href: '/meals' },
    { label: 'Hermes', color: 'bg-violet-500/20 hover:bg-violet-500/30 border-violet-500/30 text-violet-300', href: '/assistant' },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {actions.map(a => a.href ? (
          <Link key={a.label} href={a.href}
            className={`flex items-center justify-center py-2.5 rounded-xl border text-xs font-semibold transition-all ${a.color}`}
          >
            {a.label}
          </Link>
        ) : (
          <button key={a.label} onClick={a.onClick}
            className={`flex items-center justify-center py-2.5 rounded-xl border text-xs font-semibold transition-all ${a.color}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      {showTaskInput && (
        <form onSubmit={quickAddTask} className="flex gap-2">
          <input
            autoFocus
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            placeholder="Task title…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button type="submit"
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${done ? 'bg-emerald-600 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}
          >
            {done ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Today's schedule ─────────────────────────────────────────────────────────

function ScheduleSection() {
  const { events } = useEvents();
  const { users } = useFamilyMembers();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayEvents = events
    .filter(e => e.date?.startsWith(todayStr))
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .slice(0, 5);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Today</span>
        </div>
        <Link href="/calendar" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
          Calendar <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {todayEvents.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing scheduled today.</p>
      ) : (
        <div className="space-y-3">
          {todayEvents.map(ev => {
            const member = users.find(u => u.id === ev.userId);
            return (
              <div key={ev.id} className="flex items-center gap-3">
                <div className="w-1 h-8 rounded-full bg-blue-500/60 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{ev.title}</p>
                  {ev.startTime && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ''}
                    </p>
                  )}
                </div>
                {member && (
                  <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full ${member.color}`}>
                    {member.name[0]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── My tasks ─────────────────────────────────────────────────────────────────

function MyTasksSection() {
  const { tasks, updateTaskStatus } = useTasks();
  const { currentUser } = useCurrentUser();
  const { settings } = useSettings();
  const today = format(new Date(), 'yyyy-MM-dd');

  const myTasks = tasks
    .filter(t => t.assigneeId === currentUser?.id && t.status !== 'done')
    .sort((a, b) => (a.date && a.date <= today ? -1 : 0) - (b.date && b.date <= today ? -1 : 0))
    .slice(0, 6);

  async function complete(taskId: string, pts: number) {
    await updateTaskStatus(taskId, 'done');
    if (settings.points.autoAward && db && currentUser?.id) {
      await updateDoc(doc(db, 'users', currentUser.id), { points: (currentUser.points ?? 0) + pts });
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-white">My Tasks</span>
        </div>
        <Link href="/missions" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5">
          All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {myTasks.length === 0 ? (
        <p className="text-sm text-slate-500">All clear! 🎉</p>
      ) : (
        <div className="space-y-2.5">
          {myTasks.map(task => {
            const overdue = task.date && task.date < today;
            return (
              <div key={task.id} className="flex items-center gap-2.5 group">
                <button onClick={() => complete(task.id, task.pointsValue ?? settings.points.defaultTaskPoints)} className="flex-shrink-0">
                  <Circle className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${overdue ? 'text-red-400' : 'text-slate-200'}`}>{task.title}</p>
                  {task.date && (
                    <p className={`text-[10px] flex items-center gap-1 ${overdue ? 'text-red-500' : 'text-slate-500'}`}>
                      {overdue && <AlertCircle className="w-3 h-3" />}{format(parseISO(task.date), 'MMM d')}
                    </p>
                  )}
                </div>
                {task.pointsValue > 0 && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded-full">+{task.pointsValue}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Family member cards ──────────────────────────────────────────────────────

function FamilySection() {
  const { users } = useFamilyMembers();
  const { tasks } = useTasks();
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-pink-400" />
        <span className="text-sm font-semibold text-white">Family</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {users.map(u => {
          const pending = tasks.filter(t => t.assigneeId === u.id && t.status !== 'done' && t.date === today).length;
          const done = tasks.filter(t => t.assigneeId === u.id && t.status === 'done').length;
          return (
            <Card key={u.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full ${u.color} flex items-center justify-center text-white text-sm font-bold`}>
                    {u.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{u.name.split(' ')[0]}</p>
                    <p className="text-[10px] text-slate-500 capitalize">{u.role}</p>
                  </div>
                </div>
                {u.role === 'child' && (
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                    {u.points ?? 0}<Star className="w-3 h-3 fill-current" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-700/40 rounded-lg py-2">
                  <p className="text-lg font-black text-white">{pending}</p>
                  <p className="text-[10px] text-slate-500">tasks</p>
                </div>
                <div className="bg-slate-700/40 rounded-lg py-2">
                  <p className="text-lg font-black text-emerald-400">{done}</p>
                  <p className="text-[10px] text-slate-500">done</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dinner + Shopping snapshot ───────────────────────────────────────────────

function SnapshotRow() {
  const { meals } = useMeals(getWeekStart());
  const { items } = useShopping();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const dinner = meals.find(m => m.date === todayStr && m.slot === 'dinner');
  const recipe = dinner ? getRecipeById(dinner.recipeId) : null;
  const needed = items.filter(i => !i.checked).length;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Link href="/meals">
        <Card className="p-4 hover:border-orange-500/40 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 mb-2">
            <UtensilsCrossed className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-semibold text-slate-400">Dinner</span>
          </div>
          {recipe ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl">{recipe.emoji}</span>
              <p className="text-sm font-medium text-white truncate">{recipe.name}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Not planned</p>
          )}
        </Card>
      </Link>
      <Link href="/shopping">
        <Card className="p-4 hover:border-emerald-500/40 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-400">Shopping</span>
          </div>
          <p className="text-2xl font-black text-white">{needed}</p>
          <p className="text-xs text-slate-500">item{needed !== 1 ? 's' : ''} needed</p>
        </Card>
      </Link>
    </div>
  );
}

// ─── Overview / Trends tabs ───────────────────────────────────────────────────

type DashView = 'overview' | 'trends';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { currentUser } = useCurrentUser();
  const { tasks } = useTasks();
  const { events } = useEvents();
  const { items } = useShopping();
  const [view, setView] = useState<DashView>('overview');

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTasks = tasks.filter(t => t.date === today && t.status !== 'done').length;
  const todayEvents = events.filter(e => e.date?.startsWith(today)).length;
  const openShopping = items.filter(i => !i.checked).length;
  const myPoints = currentUser?.points ?? 0;

  useEffect(() => { trackUsage('home'); }, []);

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Family Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">One view of everything that matters.</p>
        </div>
        <button
          onClick={() => {}}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white transition-colors"
        >
          <Sparkles className="w-4 h-4" /> AI Summary
        </button>
      </div>

      {/* View tabs */}
      <div className="flex gap-1">
        {(['overview', 'trends'] as DashView[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              view === v ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {v === 'overview' ? <BarChart2 className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === 'overview' ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard icon={<CheckCircle2 className="w-5 h-5" />} label="Today's tasks" value={todayTasks} color="border-orange-500/60" />
            <MetricCard icon={<CalendarDays className="w-5 h-5" />} label="Events today" value={todayEvents || 'Nothing'} sub={todayEvents ? undefined : 'Plan something'} color="border-blue-500/60" />
            <MetricCard icon={<ShoppingCart className="w-5 h-5" />} label="Shopping needed" value={openShopping} color="border-emerald-500/60" />
            <MetricCard icon={<Star className="w-5 h-5" />} label="My points" value={myPoints} color="border-violet-500/60" />
          </div>

          {/* AI brief */}
          <HermesCard />

          {/* Action buttons */}
          <ActionButtons />

          {/* 2-column: schedule + tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ScheduleSection />
            <MyTasksSection />
          </div>

          {/* Dinner + shopping snapshot */}
          <SnapshotRow />

          {/* Family */}
          <FamilySection />

        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="p-8 text-center">
            <TrendingUp className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Trends coming soon</p>
          </Card>
        </motion.div>
      )}

    </div>
  );
}
