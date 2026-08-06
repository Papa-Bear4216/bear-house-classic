import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { loadHouseholdActivity, cachedHouseholdActivity, type ActivityEntry } from '@/lib/householdActivity';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Compact "who did what" widget — reads household_activity (api/activity.ts),
// logged client-side at mutation sites (src/lib/householdActivity.ts) since
// task/shopping/etc. writes go through family_data, not server routes.
const ActivityFeed: React.FC = () => {
  const [entries, setEntries] = useState<ActivityEntry[]>(() => cachedHouseholdActivity());
  const [loading, setLoading] = useState(entries.length === 0);

  useEffect(() => {
    loadHouseholdActivity().then(setEntries).finally(() => setLoading(false));
  }, []);

  if (loading) {
    // Shaped placeholder instead of a blank flash — the content shape
    // (a title row + a few list rows) is known ahead of time.
    return (
      <div className="bg-bark-800 border border-cream-400/10 rounded-2xl p-4 space-y-2 animate-pulse">
        <div className="h-4 w-32 bg-bark-700 rounded" />
        <div className="space-y-1.5 pt-1">
          {[0, 1, 2].map(i => <div key={i} className="h-3.5 bg-bark-700/70 rounded" style={{ width: `${80 - i * 15}%` }} />)}
        </div>
      </div>
    );
  }
  if (entries.length === 0) return null; // nothing to show yet — not worth a permanent empty-state tile

  return (
    <div className="bg-bark-800 border border-cream-400/10 rounded-2xl p-4 space-y-2">
      <div className="text-sm font-medium text-cream-100 flex items-center gap-2">
        <Activity className="w-4 h-4 text-sky-400" /> Recent Activity
      </div>
      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {entries.slice(0, 10).map(e => (
          <div key={e.id} className="text-sm text-cream-300 flex items-start justify-between gap-2">
            <span><span className="text-cream-100 font-medium">{e.actor_name}</span> {e.text}</span>
            <span className="text-cream-400/40 text-xs whitespace-nowrap flex-shrink-0">{timeAgo(e.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityFeed;
