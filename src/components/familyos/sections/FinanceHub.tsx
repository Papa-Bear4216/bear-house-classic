import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, DollarSign, TrendingUp, Users, User, Landmark, RotateCcw, RefreshCw, Building2, Sparkles } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, isAdmin, householdPersons } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { authedFetch } from '@/lib/householdAuth';
import { onSyncUpdate } from '@/lib/sync';
import { tryOnDeviceText } from '@/lib/onDeviceVision';

const BUDGET_CATEGORIES = ['Housing', 'Food', 'Transportation', 'Utilities', 'Insurance', 'Entertainment', 'Clothing', 'Healthcare', 'Savings', 'Kids', 'Pets', 'Other'];

interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  month: string;
}

interface Expense {
  id: string;
  amount: number;
  category: string;
  paidBy: string;
  owner?: string;
  ownerId?: string;
  date: string;
  notes: string;
  createdAt: number;
  deletedAt?: number;
  extId?: string;
  source?: 'simplefin' | 'manual';
  institutionName?: string;
}

interface LinkedAccount {
  person: string;
  institutionName: string;
  connectedAt: number;
  itemId: string;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

const privateExpenseKey = (memberId: string) => `familyos_expenses_${memberId}`;

/**
 * Bank-synced expenses live in a private, per-member key (family_data row
 * scoped by owner_member_id — see supabase/migrations/*_scope_family_data_by_owner.sql),
 * separate from the shared `familyos_expenses` key that manual entries use.
 * That split is the actual security boundary: RLS only ever syncs a private
 * row down to its owner or a superadmin, so an admin's device never even
 * receives another member's bank data — this hook just assembles whatever
 * already made it through that filter for local display, and never merges
 * a private row back into the shared key.
 */
function useHouseholdExpenses(householdMembers: Array<{ id: string }>) {
  const memberIds = useMemo(() => (householdMembers || []).map((m) => m.id), [householdMembers]);

  const loadPrivate = useCallback(() => {
    return memberIds.flatMap((id) => loadJSON<Expense[]>(privateExpenseKey(id), []));
  }, [memberIds]);

  const [sharedExpenses, setSharedExpenses] = useState<Expense[]>(() => loadJSON('familyos_expenses', []));
  const [privateExpenses, setPrivateExpenses] = useState<Expense[]>(loadPrivate);

  useEffect(() => { setPrivateExpenses(loadPrivate()); }, [loadPrivate]);

  useEffect(() => onSyncUpdate((key) => {
    if (key === 'familyos_expenses' || key === '*') setSharedExpenses(loadJSON('familyos_expenses', []));
    if (key === '*' || memberIds.some((id) => key === privateExpenseKey(id))) setPrivateExpenses(loadPrivate());
  }), [memberIds, loadPrivate]);

  const persistShared = useCallback((next: Expense[]) => {
    setSharedExpenses(next);
    saveJSON('familyos_expenses', next);
  }, []);

  /** Merge freshly-synced transactions (from OUR OWN /api/finance sync call)
   * into local state for immediate display. The server already persisted
   * them under familyos_expenses_<myMemberId> with owner_member_id set —
   * this is read-model-only, never writes familyos_expenses. */
  const addPrivateFromSync = useCallback((transactions: Expense[]) => {
    setPrivateExpenses((prev) => {
      const existingIds = new Set(prev.filter((e) => e.extId).map((e) => e.extId));
      const fresh = transactions.filter((t) => !existingIds.has(t.extId));
      return [...fresh, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  }, []);

  const expenses = useMemo(() => [...sharedExpenses, ...privateExpenses], [sharedExpenses, privateExpenses]);

  return { expenses, sharedExpenses, persistShared, addPrivateFromSync };
}

// ── Main ────────────────────────────────────────────────────────────────────────

const FinanceHub: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const [tab, setTab] = useState<'budget' | 'expenses'>('expenses');
  const [viewMode, setViewMode] = useState<'mine' | 'combined'>('combined');
  const isAdm = currentRole && isAdmin(currentRole);
  const finance = useHouseholdExpenses(householdMembers || []);

  if (!isAdm) {
    return (
      <div className="text-center py-16">
        <DollarSign className="w-12 h-12 text-cream-400/60 mx-auto mb-3" />
        <div className="text-cream-400/60 text-lg font-medium">Finance is parents only</div>
        <div className="text-cream-400/60 text-sm mt-1">Ask an admin in your household.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Finance Hub</h2>
        <div className="flex items-center gap-1 bg-bark-700/60 border border-cream-400/10 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('mine')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition focus-ring ${viewMode === 'mine' ? 'bg-honey-500 text-white' : 'text-cream-400/60 hover:text-white'}`}
          >
            <User className="w-3 h-3" /> Mine
          </button>
          <button
            onClick={() => setViewMode('combined')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition focus-ring ${viewMode === 'combined' ? 'bg-honey-500 text-white' : 'text-cream-400/60 hover:text-white'}`}
          >
            <Users className="w-3 h-3" /> Combined
          </button>
        </div>
      </div>

      <div className="flex gap-1">
        {([
          { id: 'expenses' as const, label: 'Expenses', icon: DollarSign },
          { id: 'budget'   as const, label: 'Budget',   icon: TrendingUp  },
        ]).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition focus-ring ${tab === t.id ? 'bg-honey-500 text-white' : 'bg-bark-700 text-cream-400/60 hover:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'budget'   && <BudgetTab   viewMode={viewMode} currentUser={currentUser} expenses={finance.expenses} />}
      {tab === 'expenses' && <ExpensesTab viewMode={viewMode} currentUser={currentUser} finance={finance} />}
    </div>
  );
};

// ── Expenses Tab ──────────────────────────────────────────────────────────────

interface TabProps {
  viewMode: 'mine' | 'combined';
  currentUser: any;
}

const SimpleFinPanel: React.FC<{ currentUser: any; onSync: (t: Expense[], b: any[]) => void }> = ({ currentUser, onSync }) => {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState<'ok'|'err'|''>('');
  const [disconnecting, setDisconnecting] = useState(false);
  const flash = (t: string, ty: 'ok'|'err'='ok') => { setMsg(t); setMsgType(ty); setTimeout(() => setMsg(''), 5000); };

  const loadAccounts = useCallback(async () => {
    try {
      const r = await authedFetch('/api/finance', { method: 'POST', body: JSON.stringify({ action: 'accounts' }) });
      const d = await r.json(); if (d.accounts) setAccounts(d.accounts);
    } catch {}
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const connect = async () => {
    if (!token.trim()) { flash('Paste your SimpleFIN setup token first', 'err'); return; }
    setConnecting(true);
    try {
      const r = await authedFetch('/api/finance', { method: 'POST', body: JSON.stringify({ action: 'connect', setupToken: token.trim(), person: currentUser?.name }) });
      const d = await r.json();
      // institutions are resolved lazily (see api/finance.ts) — never populated
      // on the connect response itself, so don't try to name them here.
      if (d.ok) { flash('✓ Connected — loading account details…'); setToken(''); loadAccounts(); }
      else flash(d.error || 'Connect failed', 'err');
    } catch (e: any) { flash(e.message, 'err'); } finally { setConnecting(false); }
  };

  const disconnect = async () => {
    if (!confirm('Unlink this bank connection? You can reconnect later with a new setup token.')) return;
    setDisconnecting(true);
    try {
      const r = await authedFetch('/api/finance', { method: 'POST', body: JSON.stringify({ action: 'disconnect' }) });
      const d = await r.json();
      if (d.ok) { flash('Disconnected'); setAccounts([]); }
      else flash(d.error || 'Disconnect failed', 'err');
    } catch (e: any) { flash(e.message, 'err'); } finally { setDisconnecting(false); }
  };

  const sync = async () => {
    setSyncing(true); flash('Pulling transactions…');
    try {
      const r = await authedFetch('/api/finance', { method: 'POST', body: JSON.stringify({ action: 'sync', days: 30 }) });
      const d = await r.json(); if (d.error) throw new Error(d.error);
      onSync(d.transactions || [], d.recurringBills || []);
      flash(`✓ ${d.synced ?? 0} imported${d.recurringBills?.length ? `, ${d.recurringBills.length} subscriptions` : ''}`);
    } catch (e: any) { flash(e.message || 'Sync failed', 'err'); } finally { setSyncing(false); }
  };

  return (
    <div className="bg-bark-700/40 border border-cream-400/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-sage-500" />
        <span className="text-white text-sm font-semibold">Your Linked Bank Accounts (SimpleFIN)</span>
        {accounts.length > 0 && <span className="bg-sage-600/50 border border-sage-600/30 text-sage-200 text-xs px-1.5 py-0.5 rounded-full">{accounts.length}</span>}
      </div>
      <p className="text-cream-400/60 text-[11px] -mt-1">
        Each parent links their own accounts. Only you (and a household superadmin) can see this connection and the transactions it syncs.
      </p>
      {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msgType === 'err' ? 'bg-rose-950/40 text-rose-300' : 'bg-sage-600/40 text-sage-200'}`}>{msg}</div>}
      {accounts.length > 0 ? (
        <div className="space-y-2">{accounts.map(a => (
          <div key={a.itemId} className="flex items-center gap-3 bg-bark-800/50 border border-cream-400/10 rounded-xl px-3 py-2.5">
            <Building2 className="w-4 h-4 text-cream-400/60" />
            <div className="flex-1 min-w-0"><div className="text-white text-sm truncate">{a.institutionName}</div>
            <div className="text-cream-400/60 text-xs">{a.person} · {new Date(a.connectedAt).toLocaleDateString()}</div></div>
            <span className="text-sage-500 text-xs">Active</span>
          </div>))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-cream-400/60 text-xs">Get a setup token at beta-bridge.simplefin.org, then paste it here.</p>
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="SimpleFIN setup token"
            className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs outline-none" />
        </div>
      )}
      <div className="flex gap-2">
        {accounts.length === 0 && (
          <button onClick={connect} disabled={connecting} className="flex items-center gap-1.5 bg-honey-500 hover:bg-honey-400 disabled:opacity-60 text-white text-xs px-3 py-2 rounded-lg focus-ring">
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        )}
        {accounts.length > 0 && (
          <>
            <button onClick={sync} disabled={syncing} className="flex items-center gap-1.5 bg-honey-500 hover:bg-honey-400 disabled:opacity-60 text-white text-xs px-3 py-2 rounded-lg focus-ring">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync 30 days'}
            </button>
            <button onClick={disconnect} disabled={disconnecting} className="flex items-center gap-1.5 bg-bark-700 hover:bg-rose-950/60 border border-cream-400/10 hover:border-rose-800 disabled:opacity-60 text-cream-400/60 hover:text-rose-300 text-xs px-3 py-2 rounded-lg focus-ring">
              <Trash2 className="w-3.5 h-3.5" /> {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

interface ExpensesTabProps extends TabProps {
  finance: ReturnType<typeof useHouseholdExpenses>;
}

const ExpensesTab: React.FC<ExpensesTabProps> = ({ viewMode, currentUser, finance }) => {
  const { householdMembers } = useAppContext();
  const expensePayers = householdPersons(householdMembers);
  const { expenses, sharedExpenses, persistShared, addPrivateFromSync } = finance;
  const [showForm, setShowForm]   = useState(false);
  const [amount, setAmount]       = useState('');
  const [category, setCategory]   = useState(BUDGET_CATEGORIES[0]);
  const [paidBy, setPaidBy]       = useState<string>(currentUser?.name || expensePayers[0]);
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]         = useState('');
  const [filterMonth, setFilterMonth] = useState(currentMonth());

  const handleBankSync = useCallback((transactions: Expense[], recurringBills: any[]) => {
    // Server already wrote these under our own familyos_expenses_<memberId>
    // key (and any detected subscriptions under familyos_bills_<memberId>) —
    // this only updates local state for immediate display.
    addPrivateFromSync(transactions);
    void recurringBills; // detected bills are stored server-side; not reflected in this tab's list
  }, [addPrivateFromSync]);

  const add = () => {
    if (!amount) return;
    persistShared([{
      id: uid(), amount: parseFloat(amount), category, paidBy,
      owner: currentUser?.id, date, notes, createdAt: Date.now(), source: 'manual',
    }, ...sharedExpenses]);
    setAmount(''); setNotes(''); setPaidBy(currentUser?.name || expensePayers[0]); setShowForm(false);
  };

  // Bank-synced rows are server-managed (read-only here); only manually
  // entered rows — which live in the shared pool — can be deleted from
  // this view. To remove synced transactions, disconnect/reconnect the
  // bank link instead.
  const del = (id: string) => {
    if (!sharedExpenses.some(e => e.id === id)) return;
    persistShared(sharedExpenses.map(e => e.id === id ? { ...e, deletedAt: Date.now() } : e));
  };

  const allActive  = expenses.filter(e => !e.deletedAt && e.date.startsWith(filterMonth));
  const myName     = currentUser?.name;
  const active     = viewMode === 'mine'
    ? allActive.filter(e => e.owner === currentUser?.id || e.ownerId === currentUser?.id || e.paidBy === myName)
    : allActive;
  const sorted     = [...active].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total      = active.reduce((s, e) => s + e.amount, 0);
  const byPerson   = viewMode === 'combined' ? expensePayers.map(p => ({
    name: p,
    total: allActive.filter(e => e.paidBy === p).reduce((s, e) => s + e.amount, 0),
  })).filter(p => p.total > 0) : [];

  return (
    <div className="space-y-3">
      <SimpleFinPanel currentUser={currentUser} onSync={handleBankSync} />

      {/* Month + total + add */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="bg-bark-700 border border-cream-400/10 rounded-lg px-2 py-1 text-white text-xs outline-none"
          />
          <span className="text-cream-400/60 text-sm">
            {viewMode === 'mine' ? `${myName}: ` : ''}
            <span className="text-white font-semibold">${total.toFixed(2)}</span>
          </span>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1 bg-honey-500 hover:bg-honey-400 text-white text-xs px-2.5 py-1.5 rounded-lg transition focus-ring"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Per-person breakdown */}
      {viewMode === 'combined' && byPerson.length > 0 && (
        <div className="flex gap-2">
          {byPerson.map(p => (
            <div key={p.name} className="flex-1 bg-bark-700/40 border border-cream-400/10 rounded-lg p-2 text-center">
              <div className="text-cream-400/60 text-xs">{p.name}</div>
              <div className="text-white text-sm font-semibold">${p.total.toFixed(0)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Manual add form */}
      {showForm && (
        <div className="bg-bark-700/60 border border-cream-400/10 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-cream-400/60 text-xs mb-1 block">Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs placeholder-cream-400/60 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-cream-400/60 text-xs mb-1 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs outline-none">
                {BUDGET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-cream-400/60 text-xs mb-1 block">Paid by</label>
              <select value={paidBy} onChange={e => setPaidBy(e.target.value)}
                className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs outline-none">
                {expensePayers.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-cream-400/60 text-xs mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-cream-400/60 text-xs mb-1 block">Notes / Merchant</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional"
                className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs placeholder-cream-400/60 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-cream-400/60 text-xs hover:text-white transition focus-ring">Cancel</button>
            <button onClick={add} className="bg-honey-500 hover:bg-honey-400 text-white text-xs px-3 py-1 rounded transition focus-ring">Save</button>
          </div>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="text-center text-cream-400/60 py-8 text-sm">
          No expenses for this period.
          {active.length === 0 && expenses.filter(e => !e.deletedAt).length > 0 && (
            <div className="text-cream-400/60 text-xs mt-1">Try changing the month filter.</div>
          )}
        </div>
      )}

      {/* Expense list */}
      <div className="space-y-2">
        {sorted.map(e => (
          <div key={e.id} className="flex items-center gap-3 bg-bark-700/40 border border-cream-400/10 rounded-xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm">{e.category}</span>
                {viewMode === 'combined' && <span className="text-cream-400/60 text-xs">{e.paidBy}</span>}
                {e.source === 'simplefin' && (
                  <span className="flex items-center gap-0.5 bg-honey-700/40 border border-honey-500/30 text-honey-200 text-[10px] px-1.5 py-0.5 rounded-full">
                    <Landmark className="w-2.5 h-2.5" /> {e.institutionName || 'Bank'}
                  </span>
                )}
              </div>
              <div className="text-cream-400/60 text-xs">
                {e.date}{e.notes ? ` · ${e.notes}` : ''}
              </div>
            </div>
            <span className="text-white font-semibold whitespace-nowrap">${e.amount.toFixed(2)}</span>
            {e.source !== 'simplefin' && (
              <button onClick={() => del(e.id)} className="text-cream-400/60 hover:text-rose-400 transition flex-shrink-0 focus-ring">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Budget Tab ────────────────────────────────────────────────────────────────

/** Last 3 full months of per-category spend, oldest → newest, for the given
 * anchor month. Feeds both the deterministic estimate and the Nano prompt —
 * this is the "data ingested read only via bank linking" the budget builder
 * works from (expenses already only ever contains bank-synced + manual
 * rows the caller is allowed to see, per useHouseholdExpenses above). */
function trailingMonths(anchorMonth: string): string[] {
  const now = new Date(anchorMonth + '-01');
  return [3, 2, 1].map(i => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return d.toISOString().slice(0, 7);
  });
}

function monthlyHistoryByCategory(expenses: Expense[], anchorMonth: string, categories: string[]): Record<string, number[]> {
  const months = trailingMonths(anchorMonth);
  const out: Record<string, number[]> = {};
  for (const c of categories) {
    out[c] = months.map(m => Math.round(
      expenses.filter(e => !e.deletedAt && e.category === c && e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0)
    ));
  }
  return out;
}

/** Plain 3-month-average estimate — no AI involved. Always available, and
 * used both as the fallback when on-device Nano can't run and as the input
 * Nano itself reasons on top of. */
function estimateAllCategories(expenses: Expense[], anchorMonth: string, categories: string[]): Record<string, number> {
  const history = monthlyHistoryByCategory(expenses, anchorMonth, categories);
  const out: Record<string, number> = {};
  for (const c of categories) {
    const nonZero = history[c].filter(t => t > 0);
    out[c] = nonZero.length ? Math.round(nonZero.reduce((s, t) => s + t, 0) / nonZero.length) : 0;
  }
  return out;
}

function buildBudgetPrompt(history: Record<string, number[]>): string {
  return `You're building a monthly household budget from real bank-synced spending history. Below is each category's actual total spend for the last three months (oldest to newest, in USD; 0 means no spending that month):

${JSON.stringify(history)}

For each category, suggest a sensible monthly budget: usually close to the recent average, rounded to a clean number, nudged up slightly for headroom — but don't let one unusually high month skew it, and don't invent spending that isn't there.

Respond with ONLY raw JSON (no markdown fences, no commentary), exactly this shape with every one of these keys present and numeric values:
{"Housing":0,"Food":0,"Transportation":0,"Utilities":0,"Insurance":0,"Entertainment":0,"Clothing":0,"Healthcare":0,"Savings":0,"Kids":0,"Pets":0,"Other":0}`;
}

function parseBudgetSuggestion(text: string, categories: string[]): Record<string, number> | null {
  try {
    const cleaned = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return null;
    const out: Record<string, number> = {};
    for (const c of categories) {
      const v = Number((parsed as any)[c]);
      out[c] = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
    }
    return out;
  } catch {
    return null;
  }
}

interface BudgetTabProps extends TabProps {
  expenses: Expense[];
}

const BudgetTab: React.FC<BudgetTabProps> = ({ viewMode, currentUser, expenses }) => {
  const [cats, setCats]       = useState<BudgetCategory[]>(() => loadJSON('familyos_budget', []));
  const [showForm, setShowForm] = useState(false);
  const [name, setName]       = useState(BUDGET_CATEGORIES[0]);
  const [budgeted, setBudgeted] = useState('');
  const [month]               = useState(currentMonth());
  const [building, setBuilding] = useState(false);
  const [suggestion, setSuggestion] = useState<Record<string, number> | null>(null);
  const [suggestionSource, setSuggestionSource] = useState<'on-device' | 'estimate' | null>(null);
  const [suggestionEdits, setSuggestionEdits] = useState<Record<string, string>>({});

  const save = (next: BudgetCategory[]) => { setCats(next); saveJSON('familyos_budget', next); };

  /** Builds a full budget from bank-synced + manual spending history.
   * Tries on-device Gemini Nano first (nothing leaves the phone — only
   * category totals go into the prompt, never line items); if Nano isn't
   * available or returns something unparseable, falls back to a plain
   * 3-month average so the button always produces something. Either way
   * this only reads `expenses` (already scoped to what this viewer is
   * allowed to see) and never writes until the user hits Apply. */
  const autoBuildBudget = useCallback(async () => {
    setBuilding(true);
    try {
      const history = monthlyHistoryByCategory(expenses, month, BUDGET_CATEGORIES);
      const estimate = estimateAllCategories(expenses, month, BUDGET_CATEGORIES);
      const nano = await tryOnDeviceText(buildBudgetPrompt(history));
      const parsed = nano.ok ? parseBudgetSuggestion(nano.text, BUDGET_CATEGORIES) : null;
      const result = parsed || estimate;
      setSuggestion(result);
      setSuggestionSource(parsed ? 'on-device' : 'estimate');
      setSuggestionEdits(Object.fromEntries(BUDGET_CATEGORIES.map(c => [c, String(result[c] ?? 0)])));
    } finally {
      setBuilding(false);
    }
  }, [expenses, month]);

  const applySuggestion = () => {
    if (!suggestion) return;
    let next = cats;
    for (const c of BUDGET_CATEGORIES) {
      const amt = parseFloat(suggestionEdits[c] ?? '0');
      if (!amt || amt <= 0) continue;
      const existing = next.find(x => x.name === c && x.month === month);
      next = existing
        ? next.map(x => x.id === existing.id ? { ...x, budgeted: amt } : x)
        : [...next, { id: uid(), name: c, budgeted: amt, month }];
    }
    save(next);
    setSuggestion(null);
    setSuggestionSource(null);
  };

  useEffect(() => onSyncUpdate((key) => {
    if (key === 'familyos_budget' || key === '*') setCats(loadJSON('familyos_budget', []));
  }), []);
  const add = () => {
    if (!budgeted) return;
    const existing = cats.find(c => c.name === name && c.month === month);
    if (existing) {
      save(cats.map(c => c.id === existing.id ? { ...c, budgeted: parseFloat(budgeted) } : c));
    } else {
      save([...cats, { id: uid(), name, budgeted: parseFloat(budgeted), month }]);
    }
    setBudgeted(''); setShowForm(false);
  };
  const del = (id: string) => save(cats.filter(c => c.id !== id));

  const suggestBudget = (catName: string): number => {
    const now = new Date();
    const months = [0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return d.toISOString().slice(0, 7);
    });
    const totals = months.map(m =>
      expenses.filter(e => !e.deletedAt && e.category === catName && e.date.startsWith(m))
        .reduce((s, e) => s + e.amount, 0)
    ).filter(t => t > 0);
    if (!totals.length) return 0;
    return Math.round(totals.reduce((s, t) => s + t, 0) / totals.length);
  };

  const monthCats = cats.filter(c => c.month === month);
  const allMonthExp = expenses.filter(e => !e.deletedAt && e.date.startsWith(month));
  const myName = currentUser?.name;
  const monthExpenses = viewMode === 'mine'
    ? allMonthExp.filter(e => e.paidBy === myName || e.owner === currentUser?.id || e.ownerId === currentUser?.id)
    : allMonthExp;

  const totalBudgeted = monthCats.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent    = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const spentByCategory = (catName: string) =>
    monthExpenses.filter(e => e.category === catName).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      {viewMode === 'mine' && (
        <div className="bg-bark-700/30 border border-cream-400/10 rounded-xl px-3 py-2 text-xs text-cream-400/60">
          Showing {myName}'s expenses only
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bark-700/40 border border-cream-400/10 rounded-xl p-3 text-center">
          <div className="text-cream-400/60 text-xs">Budgeted</div>
          <div className="text-white text-xl font-bold">${totalBudgeted.toFixed(0)}</div>
        </div>
        <div className="bg-bark-700/40 border border-cream-400/10 rounded-xl p-3 text-center">
          <div className="text-cream-400/60 text-xs">Spent</div>
          <div className={`text-xl font-bold ${totalSpent > totalBudgeted ? 'text-rose-400' : 'text-emerald-400'}`}>
            ${totalSpent.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-cream-400/60 text-sm">{new Date(month + '-01').toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
        <div className="flex gap-2">
          <button onClick={autoBuildBudget} disabled={building}
            className="flex items-center gap-1 bg-bark-700 hover:bg-bark-600 border border-honey-500/30 disabled:opacity-60 text-honey-300 text-xs px-2.5 py-1.5 rounded-lg transition focus-ring">
            <Sparkles className={`w-3.5 h-3.5 ${building ? 'animate-pulse' : ''}`} /> {building ? 'Building…' : 'Build with AI'}
          </button>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-honey-500 hover:bg-honey-400 text-white text-xs px-2.5 py-1.5 rounded-lg transition focus-ring">
            <Plus className="w-3.5 h-3.5" /> Set Budget
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="bg-bark-700/60 border border-honey-500/30 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-honey-400 flex-shrink-0" />
              <span>Suggested budget</span>
            </div>
            <button onClick={() => { setSuggestion(null); setSuggestionSource(null); }} className="text-cream-400/60 hover:text-white text-xs focus-ring flex-shrink-0">
              Dismiss
            </button>
          </div>
          <p className="text-cream-400/60 text-[11px] -mt-1.5">
            {suggestionSource === 'on-device'
              ? 'Built on-device (Gemini Nano) from your last 3 months of bank-synced spending — nothing left your phone.'
              : 'On-device AI wasn’t available, so this is a plain 3-month average of your bank-synced spending instead.'}
            {' '}Review the numbers, then apply.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {BUDGET_CATEGORIES.map(c => (
              <div key={c} className="flex items-center justify-between gap-2 bg-bark-800/50 border border-cream-400/10 rounded-lg px-2 py-1.5">
                <span className="text-cream-200 text-xs truncate">{c}</span>
                <input
                  type="number"
                  value={suggestionEdits[c] ?? '0'}
                  onChange={e => setSuggestionEdits(prev => ({ ...prev, [c]: e.target.value }))}
                  className="w-16 bg-bark-800 border border-cream-400/10 rounded px-1.5 py-1 text-white text-xs text-right outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={applySuggestion} className="bg-honey-500 hover:bg-honey-400 text-white text-xs px-3 py-1.5 rounded-lg transition focus-ring">
              Apply to {new Date(month + '-01').toLocaleDateString([], { month: 'long' })}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-bark-700/60 border border-cream-400/10 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-cream-400/60 text-xs mb-1 block">Category</label>
              <select value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs outline-none">
                {BUDGET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-cream-400/60 text-xs mb-1 block">Budget ($)</label>
              <input type="number" value={budgeted} onChange={e => setBudgeted(e.target.value)} placeholder="0.00"
                className="w-full bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs placeholder-cream-400/60 outline-none" autoFocus />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setBudgeted(String(suggestBudget(name)))}
              className="text-xs text-sage-500 hover:text-sage-200 whitespace-nowrap focus-ring">
              Suggest ({`$${suggestBudget(name)}`})
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-cream-400/60 text-xs hover:text-white transition focus-ring">Cancel</button>
            <button onClick={add} className="bg-honey-500 hover:bg-honey-400 text-white text-xs px-3 py-1 rounded transition focus-ring">Save</button>
          </div>
        </div>
      )}

      {monthCats.length === 0 && (
        <div className="text-center text-cream-400/60 py-6 text-sm">No budget categories set for this month. Add one to start tracking spending.</div>
      )}

      <div className="space-y-2">
        {monthCats.map(cat => {
          const spent = spentByCategory(cat.name);
          const pct   = cat.budgeted > 0 ? Math.min((spent / cat.budgeted) * 100, 100) : 0;
          const over  = spent > cat.budgeted;
          return (
            <div key={cat.id} className="bg-bark-700/40 border border-cream-400/10 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white text-sm font-medium">{cat.name}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${over ? 'text-rose-400' : 'text-cream-200'}`}>
                    ${spent.toFixed(0)} / ${cat.budgeted.toFixed(0)}
                  </span>
                  <button onClick={() => del(cat.id)} className="text-cream-400/60 hover:text-rose-400 transition focus-ring">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="h-1.5 bg-bark-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${over ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FinanceHub;
