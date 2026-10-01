// src/components/familyos/SystemHealth.tsx
import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, Cpu, Settings } from 'lucide-react';
import { loadJSON, isAdmin } from '@/lib/familyos';
import { useFeatureFlag } from '@/lib/featureFlags';
import { formatAge, interpretHaHealth, requestOpenHaSettings, type HaTone } from '@/lib/connectionHealth';
import { useAppContext } from '@/contexts/AppContext';
import { authedFetch } from '@/lib/householdAuth';

const TONE_DOT: Record<HaTone, string> = {
  up: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-rose-500',
  stale: 'bg-slate-400',
};

const TONE_LABEL: Record<HaTone, string> = {
  up: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  stale: 'Stale',
};

const ROW_DOT: Record<string, string> = {
  up: 'bg-emerald-500', degraded: 'bg-amber-500', down: 'bg-rose-500',
};

const SystemHealth: React.FC = () => {
  const { currentRole } = useAppContext();
  const connectionHealthOn = useFeatureFlag('connection_health');
  const admin = !!currentRole && isAdmin(currentRole);
  const [raw, setRaw] = useState<unknown>(() => loadJSON('system_health', null));
  const [now, setNow] = useState(() => Date.now());
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [awaitingConfig, setAwaitingConfig] = useState(true);
  const [fixing, setFixing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [triadStatus, setTriadStatus] = useState<{
    available: boolean;
    status: string;
    totalSessions?: number;
    advisors?: string[];
  } | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setRaw(loadJSON('system_health', null));
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!connectionHealthOn || !admin) return;
    let cancelled = false;
    authedFetch('/api/settings-ha', { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setConfigured(null);
          return;
        }
        const data = await res.json().catch(() => null);
        if (!cancelled) setConfigured(data?.set === true);
      })
      .catch(() => {
        if (!cancelled) setConfigured(null);
      })
      .finally(() => {
        if (!cancelled) setAwaitingConfig(false);
      });
    return () => { cancelled = true; };
  }, [connectionHealthOn, admin]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    const fetchTriad = async () => {
      try {
        const res = await authedFetch('/api/triad-telemetry');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.status === 'disabled') {
            setTriadStatus(null); // not this household's tool — show nothing
          } else if (!cancelled) {
            setTriadStatus({
              available: data.available,
              status: data.status,
              totalSessions: data.telemetry?.total_sessions,
              advisors: data.health?.advisors?.map((a: any) => a.name),
            });
          }
        }
      } catch {
        if (!cancelled) {
          setTriadStatus({ available: false, status: 'standby' });
        }
      }
    };
    fetchTriad();
    const interval = setInterval(fetchTriad, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [admin]);

  if (!admin) return null;

  const view = interpretHaHealth(raw, { configured, awaitingConfig, now });
  const showHa = connectionHealthOn && view.kind !== 'hidden';
  if (!showHa && !triadStatus) return null;

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
      {showHa && <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-400" />
        <span className="text-white text-sm font-semibold">System Health</span>
        {view.kind === 'snapshot' && (
          <>
            <span className={`ml-auto w-2.5 h-2.5 rounded-full ${TONE_DOT[view.tone]}`} />
            <span className="text-slate-300 text-xs">{TONE_LABEL[view.tone]}</span>
            <span className="text-slate-500 text-xs">{view.checkedLabel}</span>
          </>
        )}
      </div>}

      {showHa && view.kind === 'unchecked' && (
        <p className="text-slate-400 text-xs">Home Assistant — not checked yet. Checks run daily.</p>
      )}
      {showHa && view.kind === 'unknown' && (
        <p className="text-slate-400 text-xs">
          Status unknown{view.hint ? `. ${view.hint}` : ''}
        </p>
      )}
      {showHa && view.kind === 'snapshot' && view.haUnreachable && (
        <div className="flex items-center gap-2 text-rose-300 text-xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          {view.freshness === 'stale' ? 'Home Assistant was unreachable' : 'Home Assistant unreachable'}
        </div>
      )}
      {showHa && view.kind === 'snapshot' && view.tone === 'stale' && (
        <p className="text-slate-400 text-xs">Daily check may have failed</p>
      )}
      {showHa && view.kind === 'snapshot' && view.showOpenSettings && (
        <button
          type="button"
          onClick={requestOpenHaSettings}
          className="inline-flex items-center gap-1.5 text-xs text-rose-200 hover:text-white"
        >
          <Settings className="w-3.5 h-3.5" /> Open Settings
        </button>
      )}

      {showHa && msg && <div className="text-xs text-slate-300">{msg}</div>}

      {showHa && view.kind === 'snapshot' && (
      <div className="space-y-2">
        {view.integrations.map((it) => (
          <div key={it.id} className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-xl px-3 py-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${view.freshness === 'stale' && it.status === 'up' ? TONE_DOT.stale : ROW_DOT[it.status]}`} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm truncate">{it.label}</div>
              <div className="text-slate-500 text-xs">
                {view.freshness === 'stale' && it.status === 'up'
                  ? <span>Last known healthy · {formatAge(view.ageMs)}</span>
                  : it.status === 'up'
                  ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> healthy</span>
                  : `${it.unavailable} down · ${it.unknown} unknown of ${it.total}`}
                {it.autoHealed && ' · self-healed'}
              </div>
            </div>
            {it.canFix && (
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
      )}

      {triadStatus && (
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-white text-xs font-semibold">Autonomous Triad</span>
            <span className={`ml-auto w-2 h-2 rounded-full ${triadStatus.available ? 'bg-emerald-500' : 'bg-slate-500'}`} />
            <span className="text-slate-400 text-[11px] capitalize">{triadStatus.status} (Port 8789)</span>
          </div>
          {triadStatus.available && (
            <div className="text-slate-400 text-[11px] flex items-center justify-between pt-0.5">
              <span>Advisors: {triadStatus.advisors?.join(', ') || 'Claude Code & OpenAI Codex'}</span>
              <span>Sessions: {triadStatus.totalSessions ?? 0}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemHealth;
