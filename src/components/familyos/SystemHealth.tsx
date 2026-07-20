// src/components/familyos/SystemHealth.tsx
import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { loadJSON, isAdmin, KEYS } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { authedFetch } from '@/lib/householdAuth';

type IntegrationHealth = {
  id: string; label: string;
  status: 'up' | 'degraded' | 'down';
  unavailable: number; unknown: number; total: number; autoHealed?: boolean;
};
type Snapshot = {
  updatedAt: number;
  integrations: IntegrationHealth[];
  overall: 'green' | 'yellow' | 'red';
  haUnreachable?: boolean;
};

const DOT: Record<string, string> = {
  up: 'bg-emerald-500', degraded: 'bg-amber-500', down: 'bg-rose-500',
};

const SystemHealth: React.FC = () => {
  const { currentRole } = useAppContext();
  const [snap, setSnap] = useState<Snapshot | null>(() => loadJSON('system_health', null));
  const [fixing, setFixing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const t = setInterval(() => setSnap(loadJSON('system_health', null)), 5000);
    return () => clearInterval(t);
  }, []);

  if (!currentRole || !isAdmin(currentRole)) return null;
  if (!snap) return null;

  const fixIt = async (integration: string) => {
    setFixing(integration); setMsg('');
    try {
      const res = await authedFetch('/api/ha-fix', {
        method: 'POST',
        body: JSON.stringify({ integration }),
      });
      const data = await res.json();
      if (data.ok) setMsg(`✓ ${integration} fixed`);
      else if (data.assisted) {
        // Tier 3 — open the two quicklinks
        if (data.keyUrl) window.open(data.keyUrl, '_blank');
        if (data.reconfigUrl) window.open(data.reconfigUrl, '_blank');
        setMsg('Opened key + reconfigure pages');
      } else if (data.needsKey) {
        if (data.keyUrl) window.open(data.keyUrl, '_blank');
        setMsg('Get a fresh key, then paste it in Settings');
      } else {
        setMsg(data.error || 'Fix failed');
      }
    } catch (e: any) {
      setMsg(e?.message || 'Fix failed');
    } finally {
      setFixing(null);
    }
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-400" />
        <span className="text-white text-sm font-semibold">System Health</span>
        <span className={`ml-auto w-2.5 h-2.5 rounded-full ${
          snap.overall === 'green' ? 'bg-emerald-500' : snap.overall === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'
        }`} />
        <span className="text-slate-500 text-xs">
          {snap.updatedAt ? new Date(snap.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
        </span>
      </div>

      {snap.haUnreachable && (
        <div className="flex items-center gap-2 text-rose-300 text-xs">
          <AlertTriangle className="w-3.5 h-3.5" /> Home Assistant unreachable
        </div>
      )}

      {msg && <div className="text-xs text-slate-300">{msg}</div>}

      <div className="space-y-2">
        {snap.integrations.map((it) => (
          <div key={it.id} className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-xl px-3 py-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[it.status]}`} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm truncate">{it.label}</div>
              <div className="text-slate-500 text-xs">
                {it.status === 'up'
                  ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> healthy</span>
                  : `${it.unavailable} down · ${it.unknown} unknown of ${it.total}`}
                {it.autoHealed && ' · self-healed'}
              </div>
            </div>
            {it.status !== 'up' && (
              <button
                onClick={() => fixIt(it.id)}
                disabled={fixing === it.id}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs px-3 py-1.5 rounded-lg transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fixing === it.id ? 'animate-spin' : ''}`} />
                Fix It
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemHealth;
