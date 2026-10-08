import React, { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { Sparkles, ListChecks, Calendar, Handshake, Heart, AlertTriangle, TrendingUp, BarChart3, LayoutDashboard, UserCog, Plus, Zap, CheckCircle2 } from 'lucide-react';
import { KEYS, loadJSON, saveJSON, uid, callClaude, isOverdue, relativeDate, daysUntilDue, householdPillars, awardPoints, POINT_VALUES, nextRecurrence } from '@/lib/familyos';
import { getGoogleToken } from '@/lib/auth';
import { useAppContext } from '@/contexts/AppContext';
import { getColorCardStyle } from '@/lib/colorStyles';
import { buildMorningBrief } from '@/lib/morningBrief';
import { loadHermesWeather } from '@/lib/hermesWeather';
import { onSyncUpdate } from '@/lib/sync';
import { logActivity } from '@/lib/householdActivity';
import { triggerConfetti } from '@/lib/confetti';
import { resolveMemberIdByName } from './HouseholdBrain';

import AlertModal from './AlertModal';
import WeatherWidget from './WeatherWidget';
import SystemHealth from './SystemHealth';
import MemberProfileModal from './MemberProfileModal';
import ActivityFeed from './ActivityFeed';
import AdhdFocusHero from './AdhdFocusHero';
import MobileDailyDeck from './MobileDailyDeck';
import MobileActionWheel from './MobileActionWheel';
import { getDailySuggestion } from '@/lib/dailySuggestion';
import { activityTimestamp } from '@/lib/activityDate';
import FocusMode from './FocusMode';

// recharts (pulled in by Trends) is ~100KB+ of the main bundle but only
// needed when the user opens the Trends tab — split it into its own chunk.
const Trends = lazy(() => import('./Trends'));

interface DashboardProps {
  onNav: (m: string) => void;
  onQuickAdd: (m: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNav, onQuickAdd }) => {
  const [tab, setTab] = useState<'overview' | 'trends'>('overview');
  const { householdMembers, currentUser, currentRole } = useAppContext();

  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [tasks, setTasks] = useState<any[]>(() => loadJSON(KEYS.tasks, []));

  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key === KEYS.tasks) {
        setTasks(loadJSON(KEYS.tasks, []));
      }
    });
  }, []);

  const [, forceWeatherRefresh] = useState(0);
  useEffect(() => { loadHermesWeather().then(() => forceWeatherRefresh(n => n + 1)); }, []);
  const morningBrief = buildMorningBrief();

  const promises = loadJSON<any[]>(KEYS.promises, []);
  const activities = loadJSON<any[]>(KEYS.activities, []).map((activity) => ({
    ...activity, scheduledAt: activityTimestamp(activity.scheduledAt),
  }));
  const emotions = loadJSON<any[]>(KEYS.emotions, []);
  const pillars = loadJSON<any[]>(KEYS.pillars, householdPillars(householdMembers));
  const presence = loadJSON<any[]>(KEYS.presenceLog, []);

  const handleCompleteTask = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const now = Date.now();
    const updated = tasks.map((t) => (t.id === id ? { ...t, completed: true, completedAt: now } : t));
    if (currentUser) logActivity(currentUser.name, `completed "${target.text}"`);

    const memberId = resolveMemberIdByName(householdMembers, target.person);
    if (memberId) awardPoints(memberId, POINT_VALUES.default);

    if (target.recurrence) {
      const nextAt = nextRecurrence(now, target.recurrence);
      const nextDueDate = target.dueDate ? nextRecurrence(target.dueDate, target.recurrence) : null;
      const nextInstance = {
        ...target,
        id: uid(),
        dueDate: nextDueDate,
        completed: false,
        createdAt: nextAt,
        completedAt: undefined,
        stepsCompleted: target.steps ? target.steps.map(() => false) : undefined,
      };
      const finalTasks = [nextInstance, ...updated];
      setTasks(finalTasks);
      saveJSON(KEYS.tasks, finalTasks);
    } else {
      setTasks(updated);
      saveJSON(KEYS.tasks, updated);
    }
  };

  const handleToggleStep = (taskId: string, stepIndex: number) => {
    const next = tasks.map((t) => {
      if (t.id !== taskId) return t;
      const curSteps = t.stepsCompleted ?? (t.steps ? t.steps.map(() => false) : []);
      const nextSteps = curSteps.map((done: boolean, i: number) => (i === stepIndex ? !done : done));
      return { ...t, stepsCompleted: nextSteps };
    });
    setTasks(next);
    saveJSON(KEYS.tasks, next);
  };

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
      .filter((a) => !a.completed && typeof a.scheduledAt === 'number' && Number.isFinite(a.scheduledAt) && a.scheduledAt > Date.now())
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    const weekAgo = Date.now() - 7 * 86400000;
    const recentPresence = presence.filter((p) => p.ts > weekAgo);
    const presencePct = recentPresence.length ? Math.round((recentPresence.filter((p) => p.present).length / recentPresence.length) * 100) : 0;
    return { todayTasks, todayCompletedCount, todayTotalCount, openPromises: openPromises.length, overduePromises, upcoming, presencePct };
  }, [tasks, promises, activities, presence]);

  const suggestion = getDailySuggestion({ tasks, promises, activities, memberName: currentUser?.name, isChild: currentRole === 'child', now: Date.now() });


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
      <div key={name} className="rounded-3xl p-5 relative group bg-gradient-to-br from-slate-900/80 to-slate-950/90 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl backdrop-blur-xl hover:scale-[1.01]">
        <button
          onClick={() => setProfileMemberId(id)}
          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 focus-ring"
          title="Edit profile"
        >
          <UserCog className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${style.text ? 'bg-current ring-4 ring-white/5' : 'bg-amber-400 ring-4 ring-amber-400/20'}`} />
            <div className="text-white font-bold text-base tracking-tight font-display">{name}</div>
          </div>
          <div className="text-[11px] text-slate-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
            Quality: {relativeDate(pillar?.lastQualityTime)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 text-center mb-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-2.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Promises</div>
            <div className="text-xl font-extrabold text-white font-mono mt-0.5">{open}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-2.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Mood</div>
            <div className="text-xl font-extrabold text-white font-mono mt-0.5">{avg}</div>
          </div>
        </div>
        {overdueT > 0 && (
          <div className="mb-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-2.5 py-1.5 text-center font-medium">
            ⚠️ {overdueT} {overdueT === 1 ? 'task needs' : 'tasks need'} attention
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Chores</span>
            <span className="text-[11px] font-mono text-slate-300">{personTaskStats.completed}/{personTaskStats.total} done</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500"
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
    <div className="fo-dashboard space-y-6">
      <AlertModal {...modal} accent="indigo" onClose={() => setModal({ ...modal, open: false })} />
      {profileMemberId && (
        <MemberProfileModal memberId={profileMemberId} onClose={() => setProfileMemberId(null)} />
      )}

      {/* Hero Header */}
      <div className="fo-dashboard-intro">
        <div>
          <div className="fo-dashboard-eyebrow">Your household / Today</div>
          <h2>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, <span>{currentUser?.name?.split(' ')[0] || 'friend'}.</span></h2>
          <p>One thing at a time. Here’s what matters around your home.</p>
        </div>

        <div className="fo-dashboard-actions">
          <button
            onClick={() => setFocusModeOpen((f) => !f)}
            className={`fo-dashboard-action focus-ring ${focusModeOpen ? 'fo-dashboard-action-primary' : ''}`}
          >
            <Zap className="w-4 h-4" />
            <span>{focusModeOpen ? 'Close focus' : 'Focus mode'}</span>
          </button>

          <button
            onClick={dailySummary}
            className="fo-dashboard-action fo-dashboard-action-primary focus-ring"
          >
            <Sparkles className="w-4 h-4" /> Get your brief
          </button>
        </div>
      </div>

      <MobileActionWheel suggestion={suggestion} isChild={currentRole === 'child'} onNav={onNav} />

      {/* Focus Mode Overlay/Card if active */}
      {focusModeOpen && (
        <div className="animate-in fade-in zoom-in-95 duration-200">
          <FocusMode
            tasks={tasks}
            onComplete={handleCompleteTask}
            onToggleStep={handleToggleStep}
            onExit={() => setFocusModeOpen(false)}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="fo-dashboard-tabs">
        <button
          onClick={() => setTab('overview')}
          className={`fo-dashboard-tab focus-ring ${tab === 'overview' ? 'fo-dashboard-tab-active' : ''}`}
        >
          <LayoutDashboard className="w-4 h-4" /> Overview
        </button>
        <button
          onClick={() => setTab('trends')}
          className={`fo-dashboard-tab focus-ring ${tab === 'trends' ? 'fo-dashboard-tab-active' : ''}`}
        >
          <BarChart3 className="w-4 h-4" /> Trends
        </button>
      </div>

      {tab === 'trends' ? (
        <Suspense
          fallback={
            <div className="space-y-3 animate-pulse">
              <div className="h-40 bg-slate-900/60 border border-white/10 rounded-3xl" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-24 bg-slate-900/60 border border-white/10 rounded-3xl" />
                <div className="h-24 bg-slate-900/60 border border-white/10 rounded-3xl" />
              </div>
            </div>
          }
        >
          <Trends />
        </Suspense>
      ) : (
        <>
          <MobileDailyDeck
            focusCard={<AdhdFocusHero
              tasks={tasks}
              onComplete={handleCompleteTask}
              onLaunchFocusMode={() => setFocusModeOpen(true)}
              todayCompletedCount={stats.todayCompletedCount}
              todayTotalCount={stats.todayTotalCount}
            />}
            upcoming={stats.upcoming}
            openPromises={stats.openPromises}
            isChild={currentRole === 'child'}
            onNav={onNav}
            onQuickAdd={onQuickAdd}
          />
          <div className="fo-desktop-focus">
            <AdhdFocusHero
              tasks={tasks}
              onComplete={handleCompleteTask}
              onLaunchFocusMode={() => setFocusModeOpen(true)}
              todayCompletedCount={stats.todayCompletedCount}
              todayTotalCount={stats.todayTotalCount}
            />
          </div>

          {/* Quick Action Chips */}
          <div className="fo-quick-actions">
            <button
              onClick={() => onQuickAdd('household')}
              className="fo-quick-action focus-ring"
            >
              <Plus className="w-4 h-4 text-amber-400 group-hover:rotate-90 transition-transform duration-200" />
              <span>Add Chore</span>
            </button>
            {currentRole === 'child' ? (
              <>
                <button onClick={() => onNav('family')} className="fo-quick-action focus-ring"><Heart className="w-4 h-4 text-rose-400" /><span>See Family</span></button>
                <button onClick={() => onNav('rewards')} className="fo-quick-action focus-ring"><Sparkles className="w-4 h-4 text-amber-400" /><span>My Rewards</span></button>
                <button onClick={() => onNav('kids')} className="fo-quick-action focus-ring"><Zap className="w-4 h-4 text-sky-400" /><span>Kids Corner</span></button>
              </>
            ) : (
              <>
                <button onClick={() => onQuickAdd('promises')} className="fo-quick-action focus-ring"><Handshake className="w-4 h-4 text-sky-400" /><span>Make Promise</span></button>
                <button onClick={() => onQuickAdd('quality')} className="fo-quick-action focus-ring"><Calendar className="w-4 h-4 text-pink-400" /><span>Plan Hangout</span></button>
                <button onClick={() => onQuickAdd('emotions')} className="fo-quick-action focus-ring"><Heart className="w-4 h-4 text-rose-400" /><span>Log Vibe</span></button>
              </>
            )}
          </div>

          {/* Bento KPI Grid */}
          <div className={`fo-stat-grid${currentRole === 'child' ? ' fo-child-stats' : ''}`}>
            <button
              onClick={() => onNav('household')}
              className="fo-stat-card focus-ring"
            >
              <div>
                <ListChecks className="w-5 h-5" />
              </div>
              <div className="fo-stat-value">{stats.todayTasks}</div>
              <div className="fo-stat-caption">Tasks needing eyes</div>
            </button>

            {currentRole !== 'child' && <>
            <button
              onClick={() => onNav('quality')}
              className="fo-stat-card focus-ring"
            >
              <div>
                <Calendar className="w-5 h-5" />
              </div>
              <div className="fo-stat-value truncate !text-base">
                {stats.upcoming ? stats.upcoming.name : 'Open Day'}
              </div>
              <div className="fo-stat-caption truncate">
                {stats.upcoming
                  ? new Date(stats.upcoming.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' })
                  : 'Plan quality time'}
              </div>
            </button>

            <button
              onClick={() => onNav('promises')}
              className="fo-stat-card focus-ring"
            >
              <div>
                <Handshake className="w-5 h-5" />
              </div>
              <div className="fo-stat-value">{stats.openPromises}</div>
              <div className="fo-stat-caption flex items-center gap-1">
                {stats.overduePromises > 0 ? (
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {stats.overduePromises} overdue
                  </span>
                ) : (
                  'Active commitments'
                )}
              </div>
            </button>
            </>}

            <div className="fo-stat-card">
              <div>
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="fo-stat-value">{stats.presencePct}%</div>
              <div className="fo-stat-caption">Presence this week</div>
            </div>
          </div>

          {/* Morning Brief */}
          {morningBrief.length > 0 && (
            <div className="bg-gradient-to-br from-amber-500/5 via-slate-900/80 to-slate-950/90 border border-amber-500/20 rounded-3xl p-5 space-y-3 backdrop-blur-xl shadow-xl">
              <div className="text-sm font-bold text-amber-300 flex items-center gap-2 font-display">
                <Sparkles className="w-4 h-4 text-amber-400" /> Morning Briefing
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {morningBrief.map((line, i) => (
                  <div key={i} className="text-xs sm:text-sm text-slate-300 flex items-start gap-2.5 bg-white/[0.02] border border-white/5 p-3 rounded-2xl">
                    <span className="text-base flex-shrink-0">{line.emoji}</span>
                    <span className="leading-relaxed">{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weather & Activity side-by-side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WeatherWidget />
            <ActivityFeed />
          </div>

          <SystemHealth />

          {/* Household Members */}
          {householdMembers.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-bold text-slate-300 flex items-center gap-2 font-display">
                <Heart className="w-4 h-4 text-rose-400" /> Family Squad
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
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
