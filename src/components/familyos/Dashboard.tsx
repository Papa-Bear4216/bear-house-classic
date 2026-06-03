import React, { useState, useMemo } from 'react';
import { Sparkles, ListChecks, Calendar, Handshake, Heart, AlertTriangle, TrendingUp, BarChart3, LayoutDashboard } from 'lucide-react';
import { KEYS, loadJSON, callClaude, isOverdue, relativeDate, daysUntilDue, DEFAULT_PILLARS } from '@/lib/familyos';

import AlertModal from './AlertModal';
import Trends from './Trends';

interface DashboardProps {
  onNav: (m: string) => void;
  onQuickAdd: (m: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNav, onQuickAdd }) => {
  const [tab, setTab] = useState<'overview' | 'trends'>('overview');

  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });

  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const promises = loadJSON<any[]>(KEYS.promises, []);
  const activities = loadJSON<any[]>(KEYS.activities, []);
  const emotions = loadJSON<any[]>(KEYS.emotions, []);
  const pillars = loadJSON<any[]>(KEYS.pillars, DEFAULT_PILLARS);
  const presence = loadJSON<any[]>(KEYS.presenceLog, []);

  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => {
      if (t.completed) return false;
      if (t.priority === 'High') return true;
      if (t.dueDate) return daysUntilDue(t.dueDate) <= 0; // due today or overdue
      return t.dueEstimate === 'Today';
    }).length;
    const openPromises = promises.filter((p) => !p.completed);
    const overduePromises = openPromises.filter((p) => isOverdue(p)).length;
    const upcoming = activities
      .filter((a) => !a.completed)
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    const weekAgo = Date.now() - 7 * 86400000;
    const recentPresence = presence.filter((p) => p.ts > weekAgo);
    const presencePct = recentPresence.length ? Math.round((recentPresence.filter((p) => p.present).length / recentPresence.length) * 100) : 0;
    return { todayTasks, openPromises: openPromises.length, overduePromises, upcoming, presencePct };
  }, [tasks, promises, activities, presence]);


  const personCard = (name: string, color: string) => {
    const open = promises.filter((p) => !p.completed && p.person === name).length;
    const pillar = pillars.find((p) => p.name === name);
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = emotions.filter((e) => e.person === name && e.createdAt > weekAgo);
    const avg = recent.length ? (recent.reduce((s, e) => s + e.intensity, 0) / recent.length).toFixed(1) : '—';
    const overdueT = tasks.filter((t) => !t.completed && t.person === name && isOverdue(t)).length;
    return (
      <div key={name} className={`bg-gradient-to-br from-${color}-900/30 to-slate-800 border border-${color}-500/30 rounded-2xl p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-bold">{name}</div>
          <div className={`text-xs text-${color}-300`}>Quality: {relativeDate(pillar?.lastQualityTime)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-900/60 rounded-lg p-2">
            <div className="text-xs text-slate-400">Promises</div>
            <div className="text-lg font-bold text-white">{open}</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-2">
            <div className="text-xs text-slate-400">Mood</div>
            <div className="text-lg font-bold text-white">{avg}</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-2">
            <div className="text-xs text-slate-400">Late</div>
            <div className={`text-lg font-bold ${overdueT > 0 ? 'text-rose-400' : 'text-white'}`}>{overdueT}</div>
          </div>
        </div>
      </div>
    );
  };

  const dailySummary = async () => {
    setModal({ open: true, title: 'Daily Family Summary', body: '', loading: true });
    const prompt = `Give a holistic daily family status for Daddy. Be warm, specific, 5-7 sentences.

Today's priority tasks: ${stats.todayTasks}
Open promises: ${stats.openPromises} (${stats.overduePromises} overdue)
Upcoming activity: ${stats.upcoming ? `${stats.upcoming.name} with ${stats.upcoming.person}` : 'none scheduled'}
Weekly presence: ${stats.presencePct}%
Recent emotions logged: ${emotions.slice(0, 5).map((e) => `${e.person}: ${e.feeling}`).join('; ') || 'none'}
Last quality time: ${pillars.map((p) => `${p.name}: ${relativeDate(p.lastQualityTime)}`).join(', ')}

Give one focused recommendation for today.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Daily Family Summary', body: text, loading: false });
  };

  return (
    <div className="space-y-5">
      <AlertModal {...modal} accent="indigo" onClose={() => setModal({ ...modal, open: false })} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Family Dashboard</h2>
          <p className="text-sm text-slate-400">One view of everything that matters.</p>
        </div>
        <button onClick={dailySummary} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> AI Summary
        </button>
      </div>

      {/* Tabs */}
      <div className="inline-flex bg-slate-800 border border-slate-700 rounded-lg p-1 gap-1">
        <button
          onClick={() => setTab('overview')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition ${
            tab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Overview
        </button>
        <button
          onClick={() => setTab('trends')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition ${
            tab === 'trends' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Trends
        </button>
      </div>

      {tab === 'trends' ? (
        <Trends />
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => onNav('household')} className="bg-gradient-to-br from-orange-900/40 to-slate-800 border border-orange-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition">
              <ListChecks className="w-5 h-5 text-orange-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.todayTasks}</div>
              <div className="text-xs text-orange-200">Today's tasks</div>
            </button>
            <button onClick={() => onNav('quality')} className="bg-gradient-to-br from-indigo-900/40 to-slate-800 border border-indigo-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition">
              <Calendar className="w-5 h-5 text-indigo-400 mb-2" />
              <div className="text-sm font-bold text-white truncate">{stats.upcoming ? stats.upcoming.name : 'Nothing'}</div>
              <div className="text-xs text-indigo-200">{stats.upcoming ? new Date(stats.upcoming.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' }) : 'Plan something'}</div>
            </button>
            <button onClick={() => onNav('promises')} className="bg-gradient-to-br from-blue-900/40 to-slate-800 border border-blue-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition">
              <Handshake className="w-5 h-5 text-blue-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.openPromises}</div>
              <div className="text-xs text-blue-200 flex items-center gap-1">
                {stats.overduePromises > 0 && <><AlertTriangle className="w-3 h-3 text-rose-400" /> {stats.overduePromises} overdue ·</>} open
              </div>
            </button>
            <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800 border border-emerald-500/30 rounded-2xl p-4">
              <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.presencePct}%</div>
              <div className="text-xs text-emerald-200">Presence this week</div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button onClick={() => onQuickAdd('household')} className="bg-orange-600/20 border border-orange-500/30 hover:bg-orange-600/30 text-orange-200 rounded-lg py-2.5 text-sm font-medium">+ Task</button>
            <button onClick={() => onQuickAdd('promises')} className="bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-200 rounded-lg py-2.5 text-sm font-medium">+ Promise</button>
            <button onClick={() => onQuickAdd('quality')} className="bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-200 rounded-lg py-2.5 text-sm font-medium">+ Activity</button>
            <button onClick={() => onQuickAdd('emotions')} className="bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600/30 text-rose-200 rounded-lg py-2.5 text-sm font-medium">Log Emotion</button>
          </div>

          {/* Per-person */}
          <div>
            <div className="text-sm text-slate-400 mb-2 flex items-center gap-2"><Heart className="w-4 h-4" /> Family</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {personCard('Mommy', 'pink')}
              {personCard('Abriana', 'purple')}
              {personCard('Julia', 'blue')}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
