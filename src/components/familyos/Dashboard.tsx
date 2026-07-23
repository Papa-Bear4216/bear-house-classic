import React, { useState, useMemo } from 'react';
import { Sparkles, ListChecks, Calendar, Handshake, Heart, AlertTriangle, TrendingUp, BarChart3, LayoutDashboard, UserCog } from 'lucide-react';
import { KEYS, loadJSON, callClaude, isOverdue, relativeDate, daysUntilDue, householdPillars } from '@/lib/familyos';
import { getGoogleToken } from '@/lib/auth';
import { useAppContext } from '@/contexts/AppContext';
import { getColorCardStyle } from '@/lib/colorStyles';

import AlertModal from './AlertModal';
import Trends from './Trends';
import WeatherWidget from './WeatherWidget';
import SystemHealth from './SystemHealth';
import MemberProfileModal from './MemberProfileModal';

interface DashboardProps {
  onNav: (m: string) => void;
  onQuickAdd: (m: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNav, onQuickAdd }) => {
  const [tab, setTab] = useState<'overview' | 'trends'>('overview');
  const { householdMembers, currentUser } = useAppContext();

  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);

  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const promises = loadJSON<any[]>(KEYS.promises, []);
  const activities = loadJSON<any[]>(KEYS.activities, []);
  const emotions = loadJSON<any[]>(KEYS.emotions, []);
  const pillars = loadJSON<any[]>(KEYS.pillars, householdPillars(householdMembers));
  const presence = loadJSON<any[]>(KEYS.presenceLog, []);

  const stats = useMemo(() => {
    const isDueToday = (t: any) => {
      if (t.priority === 'High') return true;
      if (t.dueDate) return daysUntilDue(t.dueDate) <= 0; // due today or overdue
      return t.dueEstimate === 'Today';
    };
    const todayTaskList = tasks.filter(isDueToday);
    const todayTasks = todayTaskList.filter((t) => !t.completed).length;
    const todayCompletedCount = todayTaskList.filter((t) => t.completed).length;
    const todayTotalCount = todayTaskList.length;
    const openPromises = promises.filter((p) => !p.completed);
    const overduePromises = openPromises.filter((p) => isOverdue(p)).length;
    const upcoming = activities
      .filter((a) => !a.completed)
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    const weekAgo = Date.now() - 7 * 86400000;
    const recentPresence = presence.filter((p) => p.ts > weekAgo);
    const presencePct = recentPresence.length ? Math.round((recentPresence.filter((p) => p.present).length / recentPresence.length) * 100) : 0;
    return { todayTasks, todayCompletedCount, todayTotalCount, openPromises: openPromises.length, overduePromises, upcoming, presencePct };
  }, [tasks, promises, activities, presence]);


  const personCard = (id: string, name: string, color: string) => {
    const open = promises.filter((p) => !p.completed && p.person === name).length;
    const pillar = pillars.find((p) => p.name === name);
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = emotions.filter((e) => e.person === name && e.createdAt > weekAgo);
    const avg = recent.length ? (recent.reduce((s, e) => s + e.intensity, 0) / recent.length).toFixed(1) : '—';
    const overdueT = tasks.filter((t) => !t.completed && t.person === name && isOverdue(t)).length;
    const personTaskList = tasks.filter((t) => t.person === name);
    const personTaskStats = {
      completed: personTaskList.filter((t) => t.completed).length,
      total: personTaskList.length,
    };
    const style = getColorCardStyle(color);
    return (
      <div key={name} className={`${style.card} rounded-2xl p-4 relative group`}>
        <button
          onClick={() => setProfileMemberId(id)}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-cream-400/60 hover:text-white focus-ring"
          title="Edit profile"
        >
          <UserCog className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-bold">{name}</div>
          <div className={`text-xs ${style.text}`}>Quality: {relativeDate(pillar?.lastQualityTime)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-bark-700/60 rounded-lg p-2">
            <div className="text-xs text-cream-400/60">Promises</div>
            <div className="text-lg font-bold text-white">{open}</div>
          </div>
          <div className="bg-bark-700/60 rounded-lg p-2">
            <div className="text-xs text-cream-400/60">Mood</div>
            <div className="text-lg font-bold text-white">{avg}</div>
          </div>
        </div>
        {overdueT > 0 && (
          <div className="mt-2 text-xs text-honey-300 bg-honey-700/20 rounded-lg px-2 py-1 text-center">
            {overdueT} {overdueT === 1 ? 'task needs' : 'tasks need'} a little attention
          </div>
        )}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wide text-cream-400/50">Tasks</span>
            <span className="text-[10px] text-cream-400/50">{personTaskStats.completed}/{personTaskStats.total}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-bark-700/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-sage-500 transition-all"
              style={{ width: `${personTaskStats.total > 0 ? Math.round((personTaskStats.completed / personTaskStats.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>
    );
  };
  const dailySummary = async () => {
    setModal({ open: true, title: 'Daily Family Summary', body: '', loading: true });

    // Fetch live Google data if an OAuth token is available
    let calendarSection = '';
    let gmailSection = '';
    const googleToken = getGoogleToken();
    if (googleToken) {
      try {
        const now = new Date().toISOString();
        const tomorrow = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${tomorrow}&singleEvents=true&orderBy=startTime&maxResults=10`,
          { headers: { Authorization: `Bearer ${googleToken}` } }
        );
        if (calRes.ok) {
          const calData = await calRes.json();
          const events: any[] = calData.items || [];
          if (events.length) {
            calendarSection = `\nUpcoming calendar (next 48h): ${events
              .map((e) => {
                const start = e.start?.dateTime || e.start?.date;
                const time = start ? new Date(start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
                return `${e.summary || 'Untitled'}${time ? ` @ ${time}` : ''}`;
              })
              .join('; ')}`;
          }
        }
      } catch {
        // non-fatal — summary continues without calendar data
      }

      try {
        const gmailRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread is:important&maxResults=5',
          { headers: { Authorization: `Bearer ${googleToken}` } }
        );
        if (gmailRes.ok) {
          const gmailData = await gmailRes.json();
          const msgs: any[] = gmailData.messages || [];
          if (msgs.length) {
            // Fetch subject lines for the first 3
            const subjects = await Promise.all(
              msgs.slice(0, 3).map(async (m) => {
                const r = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
                  { headers: { Authorization: `Bearer ${googleToken}` } }
                );
                if (!r.ok) return null;
                const d = await r.json();
                const subject = d.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '(no subject)';
                const from = d.payload?.headers?.find((h: any) => h.name === 'From')?.value || '';
                return `"${subject}" from ${from}`;
              })
            );
            const validSubjects = subjects.filter(Boolean);
            if (validSubjects.length) {
              gmailSection = `\nUnread important emails (${msgs.length} total): ${validSubjects.join('; ')}`;
            }
          }
        }
      } catch {
        // non-fatal
      }
    }

    // Structured prompt to ensure JSON output for UI parsing
    const prompt = `Act as the "Family OS" secretary. Return ONLY a valid JSON object with this structure:
{
  "recommendation": "One high-impact, actionable thing for ${currentUser?.name || 'the family'} today.",
  "news": ["Brief summary item 1", "Brief summary item 2"],
  "alerts": ["Any urgent items or overdue tasks"],
  "outlook": "A warm, 1-2 sentence grounding statement for the family."
}

Use this live data:
Today: ${new Date().toLocaleDateString()}
Today's priority tasks: ${stats.todayTasks}
Open promises: ${stats.openPromises} (${stats.overduePromises} overdue)
Upcoming activity: ${stats.upcoming ? `${stats.upcoming.name} with ${stats.upcoming.person}` : 'none'}
Weekly presence: ${stats.presencePct}%
Recent emotions logged: ${emotions.slice(0, 5).map((e) => `${e.person}: ${e.feeling}`).join('; ') || 'none'}
Last quality time: ${pillars.map((p) => `${p.name}: ${relativeDate(p.lastQualityTime)}`).join(', ')}${calendarSection}${gmailSection}

Ensure the tone is supportive, specific, and ADHD-friendly (no fluff, clear actions).`;

    const { text } = await callClaude(prompt);
    
    // Parse the JSON for the modal
    let parsedBody;
    try {
      const cleaned = text.replace(/^```json?\s*/i, '').replace(/```$/i, '').trim();
      parsedBody = JSON.parse(cleaned);
    } catch (e) {
      parsedBody = { recommendation: "Summary generation failed to parse.", news: [], alerts: [], outlook: text };
    }

    const formattedBody = (
      <div className="space-y-4">
        <div className="bg-indigo-950/30 p-3 rounded-lg border border-indigo-500/30">
          <h4 className="text-indigo-300 text-xs font-bold uppercase mb-1">Focus For Today</h4>
          <p className="text-white text-sm">{parsedBody.recommendation}</p>
        </div>
        
        {parsedBody.news.length > 0 && (
          <div>
            <h4 className="text-cream-400/60 text-xs font-bold uppercase mb-2">Family News</h4>
            <ul className="list-disc list-inside text-cream-200 text-sm space-y-1">
              {parsedBody.news.map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {parsedBody.alerts.length > 0 && (
          <div className="bg-rose-950/20 p-3 rounded-lg border border-rose-500/20">
            <h4 className="text-rose-400 text-xs font-bold uppercase mb-1">Safety Net Alerts</h4>
            <ul className="list-disc list-inside text-rose-200 text-sm space-y-1">
              {parsedBody.alerts.map((a: string, i: number) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        <p className="text-cream-400/50 italic text-xs pt-2 border-t border-cream-400/10">{parsedBody.outlook}</p>
      </div>
    );

    setModal({ open: true, title: 'Family Sync', body: formattedBody as any, loading: false });
  };

  return (
    <div className="space-y-5">
      <AlertModal {...modal} accent="indigo" onClose={() => setModal({ ...modal, open: false })} />
      {profileMemberId && (
        <MemberProfileModal memberId={profileMemberId} onClose={() => setProfileMemberId(null)} />
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Family Dashboard</h2>
          <p className="text-sm text-cream-400/60">One view of everything that matters.</p>
        </div>
        <button onClick={dailySummary} className="bg-honey-500 hover:bg-honey-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2 focus-ring">
          <Sparkles className="w-4 h-4" /> AI Summary
        </button>
      </div>

      <WeatherWidget />

      <SystemHealth />

      {/* Tabs */}
      <div className="inline-flex bg-bark-800 border border-cream-400/10 rounded-lg p-1 gap-1">
        <button
          onClick={() => setTab('overview')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition focus-ring ${
            tab === 'overview' ? 'bg-honey-500 text-white shadow' : 'text-cream-400/70 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Overview
        </button>
        <button
          onClick={() => setTab('trends')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition focus-ring ${
            tab === 'trends' ? 'bg-honey-500 text-white shadow' : 'text-cream-400/70 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Trends
        </button>
      </div>

      {tab === 'trends' ? (
        <Trends />
      ) : (
        <>
          {/* Household daily progress */}
          <div className="bg-bark-800 border border-cream-400/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-cream-100">Today's progress</span>
              <span className="text-sm text-cream-400/70">{stats.todayCompletedCount}/{stats.todayTotalCount} done</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-bark-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-sage-500 transition-all"
                style={{ width: `${stats.todayTotalCount > 0 ? Math.round((stats.todayCompletedCount / stats.todayTotalCount) * 100) : 0}%` }}
              />
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => onNav('household')} className="bg-gradient-to-br from-honey-700/40 to-bark-800 border border-honey-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition focus-ring">
              <ListChecks className="w-5 h-5 text-honey-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.todayTasks}</div>
              <div className="text-xs text-honey-200">Today's tasks</div>
            </button>
            <button onClick={() => onNav('quality')} className="bg-gradient-to-br from-berry-700/40 to-bark-800 border border-berry-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition focus-ring">
              <Calendar className="w-5 h-5 text-berry-400 mb-2" />
              <div className="text-sm font-bold text-white truncate">{stats.upcoming ? stats.upcoming.name : 'Nothing'}</div>
              <div className="text-xs text-berry-200">{stats.upcoming ? new Date(stats.upcoming.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' }) : 'Plan something'}</div>
            </button>
            <button onClick={() => onNav('promises')} className="bg-gradient-to-br from-sky-900/40 to-bark-800 border border-sky-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition focus-ring">
              <Handshake className="w-5 h-5 text-sky-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.openPromises}</div>
              <div className="text-xs text-sky-200 flex items-center gap-1">
                {stats.overduePromises > 0 && <><AlertTriangle className="w-3 h-3 text-rose-400" /> {stats.overduePromises} overdue ·</>} open
              </div>
            </button>
            <div className="bg-gradient-to-br from-sage-600/40 to-bark-800 border border-sage-500/30 rounded-2xl p-4">
              <TrendingUp className="w-5 h-5 text-sage-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.presencePct}%</div>
              <div className="text-xs text-sage-200">Presence this week</div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button onClick={() => onQuickAdd('household')} className="bg-honey-600/20 border border-honey-500/30 hover:bg-honey-600/30 text-honey-200 rounded-lg py-2.5 text-sm font-medium focus-ring">+ Task</button>
            <button onClick={() => onQuickAdd('promises')} className="bg-sky-600/20 border border-sky-500/30 hover:bg-sky-600/30 text-sky-200 rounded-lg py-2.5 text-sm font-medium focus-ring">+ Promise</button>
            <button onClick={() => onQuickAdd('quality')} className="bg-berry-600/20 border border-berry-500/30 hover:bg-berry-600/30 text-berry-200 rounded-lg py-2.5 text-sm font-medium focus-ring">+ Activity</button>
            <button onClick={() => onQuickAdd('emotions')} className="bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600/30 text-rose-200 rounded-lg py-2.5 text-sm font-medium focus-ring">Log Emotion</button>
          </div>

          {/* Per-person */}
          {householdMembers.length > 0 && (
            <div>
              <div className="text-sm text-slate-400 mb-2 flex items-center gap-2"><Heart className="w-4 h-4" /> Family</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {householdMembers.map((m) => (
                  <React.Fragment key={m.id}>{personCard(m.id, m.name, m.color)}</React.Fragment>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
