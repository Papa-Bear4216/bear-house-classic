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


  const personCard = (id: string, name: string, color: string) => {
    const open = promises.filter((p) => !p.completed && p.person === name).length;
    const pillar = pillars.find((p) => p.name === name);
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = emotions.filter((e) => e.person === name && e.createdAt > weekAgo);
    const avg = recent.length ? (recent.reduce((s, e) => s + e.intensity, 0) / recent.length).toFixed(1) : '—';
    const overdueT = tasks.filter((t) => !t.completed && t.person === name && isOverdue(t)).length;
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
            <h4 className="text-slate-400 text-xs font-bold uppercase mb-2">Family News</h4>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
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

        <p className="text-slate-500 italic text-xs pt-2 border-t border-slate-700">{parsedBody.outlook}</p>
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
          <p className="text-sm text-slate-400">One view of everything that matters.</p>
        </div>
        <button onClick={dailySummary} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> AI Summary
        </button>
      </div>

      <WeatherWidget />

      <SystemHealth />

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
