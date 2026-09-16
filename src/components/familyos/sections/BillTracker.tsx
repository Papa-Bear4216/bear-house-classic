import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, RotateCcw, RefreshCw, Receipt, CreditCard, DollarSign } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, dateInputValue, parseDateInput, nextRecurrence } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useAppContext } from '@/contexts/AppContext';
import { logActivity } from '@/lib/householdActivity';
import { autoArchiveOld } from '@/lib/autoArchive';
import { triggerConfetti } from '@/lib/confetti';

const STORAGE_KEY = 'familyos_bills';

interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: number | null;
  paid: boolean;
  recurring: boolean;
  createdAt: number;
  paidAt?: number;
  deletedAt?: number;
  deletedBy?: string;
}

const BillTracker: React.FC = () => {
  const { currentUser, currentRole } = useAppContext();
  const [bills, setBills] = useState<Bill[]>(() => loadJSON(STORAGE_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recurring, setRecurring] = useState(false);

  const isAdm = currentRole && canDelete(currentRole);

  const save = (next: Bill[]) => { setBills(next); saveJSON(STORAGE_KEY, next); };

  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key !== STORAGE_KEY && key !== '*') return;
      setBills(loadJSON(STORAGE_KEY, []));
    });
  }, []);

  // Auto-archive bills paid 30+ days ago so "Paid" doesn't silently
  // accumulate forever — same soft-delete/restore mechanism as the manual
  // delete button, just automatic.
  useEffect(() => {
    if (!currentUser) return;
    const { items: archived, archivedCount } = autoArchiveOld(bills, currentUser.id);
    if (archivedCount > 0) save(archived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const addBill = () => {
    if (!name.trim() || !amount) return;
    const bill: Bill = {
      id: uid(),
      name: name.trim(),
      amount: parseFloat(amount),
      dueDate: parseDateInput(dueDate),
      paid: false,
      recurring,
      createdAt: Date.now(),
    };
    save([...bills, bill]);
    setName(''); setAmount(''); setDueDate(''); setRecurring(false); setShowForm(false);
  };

  const togglePaid = (id: string, e?: React.MouseEvent) => {
    const bill = bills.find(b => b.id === id);
    const paying = bill && !bill.paid;
    if (paying) {
      if (e) triggerConfetti(e.clientX, e.clientY, 35);
      else triggerConfetti(undefined, undefined, 35);
    }
    const updated = bills.map(b => b.id === id ? { ...b, paid: !b.paid, paidAt: b.paid ? undefined : Date.now() } : b);
    if (paying && currentUser && bill) logActivity(currentUser.name, `marked "${bill.name}" as paid`);

    // Recurring bills default to a monthly cadence
    if (paying && bill?.recurring) {
      const now = Date.now();
      const nextDueDate = bill.dueDate ? nextRecurrence(bill.dueDate, { type: 'monthly' }) : null;
      const nextInstance: Bill = {
        id: uid(),
        name: bill.name,
        amount: bill.amount,
        dueDate: nextDueDate,
        paid: false,
        recurring: true,
        createdAt: now,
      };
      save([nextInstance, ...updated]);
    } else {
      save(updated);
    }
  };

  const softDelete = (id: string) => {
    if (!currentUser || !isAdm) return;
    save(bills.map(b => b.id === id ? { ...b, deletedAt: Date.now(), deletedBy: currentUser.id } : b));
  };

  const restore = (id: string) => {
    if (!isAdm) return;
    save(bills.map(b => b.id === id ? { ...b, deletedAt: undefined, deletedBy: undefined } : b));
  };

  const getBadge = (bill: Bill) => {
    if (bill.paid) return { cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', label: 'Paid' };
    if (!bill.dueDate) return { cls: 'bg-slate-800 text-slate-400 border-slate-700/60', label: 'No due date' };
    const days = Math.round((bill.dueDate - Date.now()) / 86400000);
    if (days < 0) return { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40 font-semibold animate-pulse', label: `${Math.abs(days)}d overdue` };
    if (days <= 3) return { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40 font-medium', label: `Due in ${days}d` };
    return { cls: 'bg-slate-800 text-slate-300 border-slate-700/60', label: `Due in ${days}d` };
  };

  const active = bills.filter(b => !b.deletedAt);
  const deleted = bills.filter(b => !!b.deletedAt);

  const unpaid = active
    .filter(b => !b.paid)
    .sort((a, b) => {
      const aDue = a.dueDate ?? Infinity;
      const bDue = b.dueDate ?? Infinity;
      if (aDue === bDue) return 0;
      return aDue < bDue ? -1 : 1;
    });
  const paid = active.filter(b => b.paid);

  const totalUnpaid = unpaid.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
              <Receipt className="w-5 h-5" />
            </div>
            Bill Tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1">Upcoming recurring household expenses & deadlines</p>
        </div>
        <button 
          onClick={() => setShowForm(f => !f)} 
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20 focus-ring self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Bill
        </button>
      </div>

      {unpaid.length > 0 && (
        <div className="bg-slate-900/60 backdrop-blur-md border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-lg shadow-amber-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block">Total Outstanding</span>
              <span className="text-xs text-amber-400/80">{unpaid.length} upcoming {unpaid.length === 1 ? 'bill' : 'bills'}</span>
            </div>
          </div>
          <span className="text-white font-black text-2xl tracking-tight tabular-nums">${totalUnpaid.toFixed(2)}</span>
        </div>
      )}

      {showForm && (
        <div className="bg-slate-900/80 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="font-semibold text-sm text-amber-400 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add New Bill
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-1 sm:col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Bill name</label>
              <input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. Electric utility, Fiber internet" 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
                autoFocus 
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Amount ($)</label>
              <input 
                type="number" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                placeholder="0.00" 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Due date</label>
              <input 
                type="date" 
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)} 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-slate-300 text-sm cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={recurring} 
              onChange={e => setRecurring(e.target.checked)} 
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-800 border-slate-700" 
            />
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">Auto-recurring monthly</span>
          </label>
          <div className="flex gap-2 justify-end pt-1">
            <button 
              onClick={() => setShowForm(false)} 
              className="text-slate-400 hover:text-white text-xs font-medium px-4 py-2 rounded-xl transition focus-ring"
            >
              Cancel
            </button>
            <button 
              onClick={addBill} 
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl transition shadow-lg shadow-amber-500/20 focus-ring"
            >
              Save Bill
            </button>
          </div>
        </div>
      )}

      {active.length === 0 && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-12 px-4">
          <Receipt className="w-10 h-10 text-slate-600 mx-auto mb-3 opacity-60" />
          <p className="text-slate-400 font-medium text-sm">No bills tracked yet.</p>
          <p className="text-slate-500 text-xs mt-1">Add regular bills to get advance due-date warnings and avoid ADHD late fees.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {unpaid.map(bill => {
          const badge = getBadge(bill);
          return (
            <div 
              key={bill.id} 
              className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700/80 rounded-2xl px-4 py-3.5 shadow-md transition group"
            >
              <button 
                onClick={(e) => togglePaid(bill.id, e)} 
                className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-emerald-500/20 border border-slate-700/60 hover:border-emerald-500/40 flex items-center justify-center text-slate-400 hover:text-emerald-400 transition flex-shrink-0 active:scale-95 focus-ring"
                title="Mark as paid (dopamine hit!)"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-semibold truncate">{bill.name}</span>
                  {bill.recurring && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md font-medium">
                      <RefreshCw className="w-2.5 h-2.5" /> monthly
                    </span>
                  )}
                </div>
                <div className="text-slate-400 text-xs mt-0.5 font-medium">${bill.amount.toFixed(2)}</div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
              {isAdm && (
                <button 
                  onClick={() => softDelete(bill.id)} 
                  className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-slate-500 hover:text-rose-400 transition active:scale-95 flex-shrink-0 focus-ring opacity-60 group-hover:opacity-100"
                  title="Remove bill"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {paid.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <span>Paid This Cycle</span>
            <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-400">{paid.length}</span>
          </div>
          <div className="space-y-2">
            {paid.map(bill => (
              <div 
                key={bill.id} 
                className="flex items-center gap-3 bg-slate-900/30 border border-slate-800/40 rounded-2xl px-4 py-3 opacity-65 hover:opacity-100 transition"
              >
                <button 
                  onClick={(e) => togglePaid(bill.id, e)} 
                  className="text-emerald-400 flex-shrink-0 focus-ring"
                  title="Re-open bill"
                >
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-400 text-sm line-through font-medium">{bill.name}</div>
                  <div className="text-slate-500 text-xs">${bill.amount.toFixed(2)}</div>
                </div>
                <span className="text-[11px] text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">Settled</span>
                {isAdm && (
                  <button 
                    onClick={() => softDelete(bill.id)} 
                    className="text-slate-600 hover:text-rose-400 transition flex-shrink-0 focus-ring p-1"
                    title="Remove bill"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdm && deleted.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-slate-600 text-xs font-bold uppercase tracking-wider">Archived / Removed</div>
          <div className="space-y-1.5">
            {deleted.map(bill => (
              <div key={bill.id} className="flex items-center gap-3 bg-slate-900/20 border border-slate-800/30 rounded-xl px-3.5 py-2 opacity-40 hover:opacity-75 transition">
                <div className="flex-1 text-slate-500 text-xs line-through">{bill.name} (${bill.amount.toFixed(2)})</div>
                <button 
                  onClick={() => restore(bill.id)} 
                  className="text-slate-500 hover:text-amber-400 transition focus-ring p-1"
                  title="Restore bill"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BillTracker;
