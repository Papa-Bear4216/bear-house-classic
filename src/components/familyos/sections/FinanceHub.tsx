import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, DollarSign, TrendingUp, Users, User, Landmark, RotateCcw, RefreshCw, Building2 } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, isAdmin } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

const BUDGET_CATEGORIES = ['Housing', 'Food', 'Transportation', 'Utilities', 'Insurance', 'Entertainment', 'Clothing', 'Healthcare', 'Savings', 'Kids', 'Pets', 'Other'];
const EXPENSE_PAYERS = ['Daddy', 'Mommy', 'Joint'];

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
  date: string;
  notes: string;
  createdAt: number;
  deletedAt?: number;
  plaidId?: string;
  extId?: string;
  source?: 'plaid' | 'simplefin' | 'manual';
  institutionName?: string;
}

interface PlaidAccount {
  person: string;
  institutionName: string;
  connectedAt: number;
  itemId: string;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

// ── Main ────────────────────────────────────────────────────────────────────────

const FinanceHub: React.FC = () => {
  const { currentUser, currentRole } = useAppContext();
  const [tab, setTab] = useState<'budget' | 'expenses'>('expenses');
  const [viewMode, setViewMode] = useState<'mine' | 'combined'>('combined');
  const isAdm = currentRole && isAdmin(currentRole);

  if (!isAdm) {
    return (
      <div className="text-center py-16">
        <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <div className="text-slate-500 text-lg font-medium">Finance is parents only</div>
        <div className="text-slate-600 text-sm mt-1">Ask Daddy or Mommy.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Finance Hub</h2>
        <div className="flex items-center gap-1 bg-slate-800/60 border border-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('mine')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${viewMode === 'mine' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <User className="w-3 h-3" /> Mine
          </button>
          <button
            onClick={() => setViewMode('combined')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${viewMode === 'combined' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${tab === t.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'budget'   && <BudgetTab   viewMode={viewMode} currentUser={currentUser} />}
      {tab === 'expenses' && <ExpensesTab viewMode={viewMode} currentUser={currentUser} />}
    </div>
  );
};

// ── Expenses Tab ──────────────────────────────────────────────────────────────

interface TabProps {
  viewMode: 'mine' | 'combined';
  currentUser: any;
}

const SimpleFinPanel: React.FC<{ currentUser: any; onSync: (t: Expense[], b: any[]) => void }> = ({ currentUser, onSync }) => {
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState<'ok'|'err'|''>('');
  const flash = (t: string, ty: 'ok'|'err'='ok') => { setMsg(t); setMsgType(ty); setTimeout(() => setMsg(''), 5000); };

  const loadAccounts = useCallback(async () => {
    try {
      const r = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accounts' }) });
      const d = await r.json(); if (d.accounts) setAccounts(d.accounts);
    } catch {}
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const connect = async () => {
    if (!token.trim()) { flash('Paste your SimpleFIN setup token first', 'err'); return; }
    setConnecting(true);
    try {
      const r = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', setupToken: token.trim(), person: currentUser?.name || 'Daddy' }) });
      const d = await r.json();
      if (d.ok) { flash(`✓ Connected: ${(d.institutions||[]).join(', ')}`); setToken(''); loadAccounts(); }
      else flash(d.error || 'Connect failed', 'err');
    } catch (e: any) { flash(e.message, 'err'); } finally { setConnecting(false); }
  };

  const sync = async () => {
    setSyncing(true); flash('Pulling transactions…');
    try {
      const r = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', days: 30 }) });
      const d = await r.json(); if (d.error) throw new Error(d.error);
      onSync(d.transactions || [], d.recurringBills || []);
      flash(`✓ ${d.synced ?? 0} imported${d.recurringBills?.length ? `, ${d.recurringBills.length} subscriptions` : ''}`);
    } catch (e: any) { flash(e.message || 'Sync failed', 'err'); } finally { setSyncing(false); }
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-emerald-400" />
        <span className="text-white text-sm font-semibold">Linked Bank Accounts (SimpleFIN)</span>
        {accounts.length > 0 && <span className="bg-emerald-900/50 border border-emerald-600/30 text-emerald-300 text-xs px-1.5 py-0.5 rounded-full">{accounts.length}</span>}
      </div>
      {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msgType === 'err' ? 'bg-rose-950/40 text-rose-300' : 'bg-emerald-950/40 text-emerald-300'}`}>{msg}</div>}
      {accounts.length > 0 ? (
        <div className="space-y-2">{accounts.map(a => (
          <div key={a.itemId} className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-xl px-3 py-2.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <div className="flex-1 min-w-0"><div className="text-white text-sm truncate">{a.institutionName}</div>
            <div className="text-slate-500 text-xs">{a.person} · {new Date(a.connectedAt).toLocaleDateString()}</div></div>
            <span className="text-emerald-400 text-xs">Active</span>
          </div>))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-slate-500 text-xs">Get a setup token at beta-bridge.simplefin.org, then paste it here.</p>
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="SimpleFIN setup token"
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={connect} disabled={connecting} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs px-3 py-2 rounded-lg">
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
        {accounts.length > 0 && (
          <button onClick={sync} disabled={syncing} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs px-3 py-2 rounded-lg">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync 30 days'}
          </button>
        )}
      </div>
    </div>
  );
};

const ExpensesTab: React.FC<TabProps> = ({ viewMode, currentUser }) => {
  const [expenses, setExpenses] = useState<Expense[]>(() => loadJSON('familyos_expenses', []));
  const [showForm, setShowForm]   = useState(false);
  const [amount, setAmount]       = useState('');
  const [category, setCategory]   = useState(BUDGET_CATEGORIES[0]);
  const [paidBy, setPaidBy]       = useState<string>(currentUser?.name || EXPENSE_PAYERS[0]);
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]         = useState('');
  const [filterMonth, setFilterMonth] = useState(currentMonth());

  const persistExpenses = (next: Expense[]) => { setExpenses(next); saveJSON('familyos_expenses', next); };

  const handleBankSync = useCallback((transactions: Expense[], recurringBills: any[]) => {
    setExpenses(prev => {
      const existingIds = new Set(prev.filter(e => e.extId).map(e => e.extId));
      const fresh = transactions.filter(t => !existingIds.has(t.extId));
      const merged = [...fresh, ...prev];
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      saveJSON('familyos_expenses', merged);
      return merged;
    });

    if (recurringBills.length > 0) {
      const existingBills: any[] = loadJSON('familyos_bills', []);
      const existingNames = new Set(
        existingBills.filter((b: any) => b.source === 'simplefin').map((b: any) => b.name.toLowerCase()),
      );
      const freshBills = recurringBills
        .filter(b => !existingNames.has(b.merchant))
        .map(b => ({
          id: uid(),
          name: b.merchant,
          amount: b.avgAmount,
          dueDate: null,
          paid: false,
          recurring: true,
          createdAt: Date.now(),
          source: 'simplefin',
        }));
      if (freshBills.length > 0) {
        saveJSON('familyos_bills', [...existingBills, ...freshBills]);
      }
    }
  }, []);

  const add = () => {
    if (!amount) return;
    persistExpenses([{
      id: uid(), amount: parseFloat(amount), category, paidBy,
      owner: currentUser?.id, date, notes, createdAt: Date.now(), source: 'manual',
    }, ...expenses]);
    setAmount(''); setNotes(''); setPaidBy(currentUser?.name || EXPENSE_PAYERS[0]); setShowForm(false);
  };

  const del = (id: string) => persistExpenses(expenses.map(e => e.id === id ? { ...e, deletedAt: Date.now() } : e));

  const allActive  = expenses.filter(e => !e.deletedAt && e.date.startsWith(filterMonth));
  const myName     = currentUser?.name;
  const active     = viewMode === 'mine'
    ? allActive.filter(e => e.owner === currentUser?.id || e.paidBy === myName)
    : allActive;
  const sorted     = [...active].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total      = active.reduce((s, e) => s + e.amount, 0);
  const byPerson   = viewMode === 'combined' ? EXPENSE_PAYERS.map(p => ({
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
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs outline-none"
          />
          <span className="text-slate-400 text-sm">
            {viewMode === 'mine' ? `${myName}: ` : ''}
            <span className="text-white font-semibold">${total.toFixed(2)}</span>
          </span>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Per-person breakdown */}
      {viewMode === 'combined' && byPerson.length > 0 && (
        <div className="flex gap-2">
          {byPerson.map(p => (
            <div key={p.name} className="flex-1 bg-slate-800/40 border border-slate-700 rounded-lg p-2 text-center">
              <div className="text-slate-400 text-xs">{p.name}</div>
              <div className="text-white text-sm font-semibold">${p.total.toFixed(0)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Manual add form */}
      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {BUDGET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Paid by</label>
              <select value={paidBy} onChange={e => setPaidBy(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {EXPENSE_PAYERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Notes / Merchant</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional"
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="text-center text-slate-500 py-8 text-sm">
          No expenses for this period.
          {active.length === 0 && expenses.filter(e => !e.deletedAt).length > 0 && (
            <div className="text-slate-600 text-xs mt-1">Try changing the month filter.</div>
          )}
        </div>
      )}

      {/* Expense list */}
      <div className="space-y-2">
        {sorted.map(e => (
          <div key={e.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm">{e.category}</span>
                {viewMode === 'combined' && <span className="text-slate-500 text-xs">{e.paidBy}</span>}
                {(e.source === 'simplefin' || e.source === 'plaid') && (
                  <span className="flex items-center gap-0.5 bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded-full">
                    <Landmark className="w-2.5 h-2.5" /> {e.institutionName || 'Bank'}
                  </span>
                )}
              </div>
              <div className="text-slate-500 text-xs">
                {e.date}{e.notes ? ` · ${e.notes}` : ''}
              </div>
            </div>
            <span className="text-white font-semibold whitespace-nowrap">${e.amount.toFixed(2)}</span>
            <button onClick={() => del(e.id)} className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Budget Tab ────────────────────────────────────────────────────────────────

const BudgetTab: React.FC<TabProps> = ({ viewMode, currentUser }) => {
  const [cats, setCats]       = useState<BudgetCategory[]>(() => loadJSON('familyos_budget', []));
  const [expenses]            = useState<Expense[]>(() => loadJSON('familyos_expenses', []));
  const [showForm, setShowForm] = useState(false);
  const [name, setName]       = useState(BUDGET_CATEGORIES[0]);
  const [budgeted, setBudgeted] = useState('');
  const [month]               = useState(currentMonth());

  const save = (next: BudgetCategory[]) => { setCats(next); saveJSON('familyos_budget', next); };
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

  const monthCats = cats.filter(c => c.month === month);
  const allMonthExp = expenses.filter(e => !e.deletedAt && e.date.startsWith(month));
  const myName = currentUser?.name;
  const monthExpenses = viewMode === 'mine'
    ? allMonthExp.filter(e => e.paidBy === myName || e.owner === currentUser?.id)
    : allMonthExp;

  const totalBudgeted = monthCats.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent    = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const spentByCategory = (catName: string) =>
    monthExpenses.filter(e => e.category === catName).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      {viewMode === 'mine' && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-400">
          Showing {myName}'s expenses only
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3 text-center">
          <div className="text-slate-400 text-xs">Budgeted</div>
          <div className="text-white text-xl font-bold">${totalBudgeted.toFixed(0)}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3 text-center">
          <div className="text-slate-400 text-xs">Spent</div>
          <div className={`text-xl font-bold ${totalSpent > totalBudgeted ? 'text-rose-400' : 'text-emerald-400'}`}>
            ${totalSpent.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">{new Date(month + '-01').toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Set Budget
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Category</label>
              <select value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {BUDGET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Budget ($)</label>
              <input type="number" value={budgeted} onChange={e => setBudgeted(e.target.value)} placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" autoFocus />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}

      {monthCats.length === 0 && (
        <div className="text-center text-slate-500 py-6 text-sm">No budget categories set for this month.</div>
      )}

      <div className="space-y-2">
        {monthCats.map(cat => {
          const spent = spentByCategory(cat.name);
          const pct   = cat.budgeted > 0 ? Math.min((spent / cat.budgeted) * 100, 100) : 0;
          const over  = spent > cat.budgeted;
          return (
            <div key={cat.id} className="bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white text-sm font-medium">{cat.name}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${over ? 'text-rose-400' : 'text-slate-300'}`}>
                    ${spent.toFixed(0)} / ${cat.budgeted.toFixed(0)}
                  </span>
                  <button onClick={() => del(cat.id)} className="text-slate-600 hover:text-rose-400 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
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
