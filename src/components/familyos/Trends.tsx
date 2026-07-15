import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { TrendingUp, BarChart3, Activity, Grid3x3 } from 'lucide-react';
import { KEYS, EMOTION_CATEGORIES, loadJSON, isOverdue } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

// Maps a household_members.color token (Tailwind name) to a hex value for recharts,
// which needs raw hex strings rather than Tailwind classes.
const COLOR_HEX: Record<string, string> = {
  indigo: '#6366f1', pink: '#ec4899', purple: '#a855f7', blue: '#3b82f6',
  green: '#10b981', slate: '#64748b', amber: '#f59e0b', rose: '#f43f5e',
};
const FALLBACK_HEX = ['#ec4899', '#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#f43f5e'];

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const Trends: React.FC = () => {
  const { householdMembers } = useAppContext();
  const PEOPLE = householdMembers.map((m) => m.name);
  const PERSON_COLORS: Record<string, string> = {};
  householdMembers.forEach((m, i) => {
    PERSON_COLORS[m.name] = COLOR_HEX[m.color] || FALLBACK_HEX[i % FALLBACK_HEX.length];
  });
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const promises = loadJSON<any[]>(KEYS.promises, []);
  const emotions = loadJSON<any[]>(KEYS.emotions, []);
  const presence = loadJSON<any[]>(KEYS.presenceLog, []);

  // 1) 30-day task completion velocity
  const velocityData = useMemo(() => {
    const today = startOfDay(Date.now());
    const days: { date: string; completed: number; created: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = today - i * 86400000;
      const dayEnd = dayStart + 86400000;
      const completed = tasks.filter(
        (t) => t.completed && t.completedAt && t.completedAt >= dayStart && t.completedAt < dayEnd
      ).length;
      const created = tasks.filter((t) => t.createdAt >= dayStart && t.createdAt < dayEnd).length;
      const label = new Date(dayStart).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
      days.push({ date: label, completed, created });
    }
    return days;
  }, [tasks]);

  // 2) 8-week promises kept vs broken per person
  const promisesData = useMemo(() => {
    const today = startOfDay(Date.now());
    const dayOfWeek = new Date(today).getDay();
    const startOfThisWeek = today - dayOfWeek * 86400000; // Sunday
    const weeks: any[] = [];
    for (let w = 7; w >= 0; w--) {
      const wkStart = startOfThisWeek - w * 7 * 86400000;
      const wkEnd = wkStart + 7 * 86400000;
      const row: any = {
        week: `W${8 - w}`,
        label: new Date(wkStart).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
      };
      PEOPLE.forEach((person) => {
        const personPromises = promises.filter(
          (p) => p.person === person && p.createdAt >= wkStart && p.createdAt < wkEnd
        );
        const kept = personPromises.filter((p) => p.completed).length;
        // "Broken" = open + overdue, or completed late. We'll count overdue + still-open or never-completed.
        const broken = personPromises.filter(
          (p) => !p.completed && isOverdue(p)
        ).length;
        row[`${person}_kept`] = kept;
        row[`${person}_broken`] = broken;
      });
      weeks.push(row);
    }
    return weeks;
  }, [promises, PEOPLE]);

  // 3) Radar: avg emotional intensity per person across 7 categories
  const radarData = useMemo(() => {
    return EMOTION_CATEGORIES.map((cat) => {
      const row: any = { category: cat };
      PEOPLE.forEach((person) => {
        const matches = emotions.filter((e) => e.person === person && e.category === cat);
        const avg = matches.length
          ? matches.reduce((s, e) => s + (e.intensity || 0), 0) / matches.length
          : 0;
        row[person] = Math.round(avg * 10) / 10;
      });
      return row;
    });
  }, [emotions, PEOPLE]);

  // 4) Heatmap: presence check-in success by day-of-week × hour-of-day
  const heatmapData = useMemo(() => {
    // grid[day 0..6][hour 0..23] = { yes, total }
    const grid: { yes: number; total: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ yes: 0, total: 0 }))
    );
    presence.forEach((p) => {
      if (!p.ts) return;
      const d = new Date(p.ts);
      const day = d.getDay();
      const hour = d.getHours();
      grid[day][hour].total += 1;
      if (p.present) grid[day][hour].yes += 1;
    });
    return grid;
  }, [presence]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const heatColor = (yes: number, total: number) => {
    if (total === 0) return 'bg-slate-800/40';
    const pct = yes / total;
    if (pct >= 0.85) return 'bg-emerald-500';
    if (pct >= 0.65) return 'bg-emerald-600/80';
    if (pct >= 0.45) return 'bg-amber-500/80';
    if (pct >= 0.25) return 'bg-orange-600/80';
    return 'bg-rose-600/80';
  };

  const tooltipStyle = {
    contentStyle: {
      background: 'rgba(15,23,42,0.95)',
      border: '1px solid rgba(99,102,241,0.4)',
      borderRadius: 8,
      color: '#fff',
      fontSize: 12,
    },
    labelStyle: { color: '#cbd5e1' },
  };

  return (
    <div className="space-y-5">
      {/* Velocity */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-orange-500/20">
            <TrendingUp className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Task Completion Velocity</div>
            <div className="text-[11px] text-slate-400">Last 30 days · completed vs created per day</div>
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={velocityData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} interval={4} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#fb923c"
                strokeWidth={2.5}
                dot={{ r: 2, fill: '#fb923c' }}
                activeDot={{ r: 5 }}
                name="Completed"
              />
              <Line
                type="monotone"
                dataKey="created"
                stroke="#64748b"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                name="Created"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Promises stacked bars */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-blue-500/20">
            <BarChart3 className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Promises Kept vs Broken</div>
            <div className="text-[11px] text-slate-400">Last 8 weeks · stacked per family member</div>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={promisesData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 10 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {PEOPLE.map((person) => (
                <Bar
                  key={`${person}_kept`}
                  dataKey={`${person}_kept`}
                  stackId={person}
                  fill={PERSON_COLORS[person]}
                  name={`${person} kept`}
                  radius={[2, 2, 0, 0]}
                />
              ))}
              {PEOPLE.map((person) => (
                <Bar
                  key={`${person}_broken`}
                  dataKey={`${person}_broken`}
                  stackId={person}
                  fill={`${PERSON_COLORS[person]}55`}
                  stroke={PERSON_COLORS[person]}
                  strokeDasharray="3 2"
                  name={`${person} broken`}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Radar */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-rose-500/20">
            <Activity className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Emotional Intensity Profile</div>
            <div className="text-[11px] text-slate-400">Average intensity (1-10) per person across 7 emotion categories</div>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="rgba(148,163,184,0.25)" />
              <PolarAngleAxis dataKey="category" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                tick={{ fill: '#64748b', fontSize: 9 }}
                stroke="rgba(148,163,184,0.2)"
              />
              {PEOPLE.map((person) => (
                <Radar
                  key={person}
                  name={person}
                  dataKey={person}
                  stroke={PERSON_COLORS[person]}
                  fill={PERSON_COLORS[person]}
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-emerald-500/20">
            <Grid3x3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Presence Check-in Success</div>
            <div className="text-[11px] text-slate-400">Day-of-week × hour-of-day · greener = more "present" responses</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Hour header */}
            <div className="flex items-center pl-10 mb-1">
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-slate-500">
                  {h % 3 === 0 ? h : ''}
                </div>
              ))}
            </div>
            {dayLabels.map((day, di) => (
              <div key={day} className="flex items-center mb-1">
                <div className="w-10 text-[10px] uppercase text-slate-400 font-semibold">{day}</div>
                {heatmapData[di].map((cell, hi) => {
                  const pct = cell.total > 0 ? Math.round((cell.yes / cell.total) * 100) : null;
                  return (
                    <div
                      key={hi}
                      className={`flex-1 aspect-square mx-px rounded-sm ${heatColor(cell.yes, cell.total)} ${
                        cell.total === 0 ? 'opacity-40' : ''
                      } hover:ring-2 hover:ring-emerald-300 transition`}
                      title={
                        cell.total === 0
                          ? `${day} ${hi}:00 — no check-ins`
                          : `${day} ${hi}:00 — ${cell.yes}/${cell.total} present (${pct}%)`
                      }
                    />
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-3 pl-10 mt-3 text-[10px] text-slate-400">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-slate-800/40 border border-slate-700" /> none
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-rose-600/80" /> &lt;25%
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-orange-600/80" /> &lt;45%
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-amber-500/80" /> &lt;65%
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-emerald-600/80" /> &lt;85%
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" /> 85%+
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Trends;
