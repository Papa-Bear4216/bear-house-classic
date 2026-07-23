import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, RotateCcw, RefreshCw } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, dateInputValue, parseDateInput } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

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

  const togglePaid = (id: string) => {
    save(bills.map(b => b.id === id ? { ...b, paid: !b.paid, paidAt: b.paid ? undefined : Date.now() } : b));
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
    if (bill.paid) return { cls: 'bg-sage-600/40 text-sage-200 border-sage-500/30', label: 'Paid' };
    if (!bill.dueDate) return { cls: 'bg-bark-700 text-cream-200', label: 'No due date' };
    const days = Math.round((bill.dueDate - Date.now()) / 86400000);
    if (days < 0) return { cls: 'bg-rose-900/40 text-rose-300 border-rose-500/30', label: `${Math.abs(days)}d overdue` };
    if (days <= 3) return { cls: 'bg-honey-700/40 text-honey-200 border-honey-500/30', label: `Due in ${days}d` };
    return { cls: 'bg-bark-700 text-cream-200', label: `Due in ${days}d` };
  };

  const active = bills.filter(b => !b.deletedAt);
  const deleted = bills.filter(b => !!b.deletedAt);

  const unpaid = active.filter(b => !b.paid).sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));
  const paid = active.filter(b => b.paid);

  const totalUnpaid = unpaid.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Bill Tracker</h2>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-berry-600 hover:bg-berry-500 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring">
          <Plus className="w-4 h-4" /> Add Bill
        </button>
      </div>

      {unpaid.length > 0 && (
        <div className="bg-bark-700/40 border border-cream-400/10 rounded-xl p-3 flex justify-between items-center">
          <span className="text-cream-400/60 text-sm">Total unpaid</span>
          <span className="text-white font-bold text-lg">${totalUnpaid.toFixed(2)}</span>
        </div>
      )}

      {showForm && (
        <div className="bg-bark-700/60 border border-cream-400/10 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Bill name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Electric bill" className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 focus:border-berry-500 outline-none focus-ring" autoFocus />
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 focus:border-berry-500 outline-none focus-ring" />
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm focus:border-berry-500 outline-none focus-ring" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-cream-200 text-sm cursor-pointer">
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="rounded" />
            <RefreshCw className="w-3.5 h-3.5 text-cream-400/50" /> Auto-recurring
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-cream-400/60 hover:text-white text-sm px-3 py-1.5 rounded transition focus-ring">Cancel</button>
            <button onClick={addBill} className="bg-berry-600 hover:bg-berry-500 text-white text-sm px-4 py-1.5 rounded-lg transition focus-ring">Add Bill</button>
          </div>
        </div>
      )}

      {active.length === 0 && (
        <div className="text-center text-cream-400/50 py-8 text-sm">No bills tracked yet.</div>
      )}

      <div className="space-y-2">
        {unpaid.map(bill => {
          const badge = getBadge(bill);
          return (
            <div key={bill.id} className="flex items-center gap-3 bg-bark-700/40 border border-cream-400/10 rounded-xl px-4 py-3">
              <button onClick={() => togglePaid(bill.id)} className="text-cream-400/60 hover:text-sage-500 transition flex-shrink-0 focus-ring">
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{bill.name}</span>
                  {bill.recurring && <RefreshCw className="w-3 h-3 text-cream-400/50" />}
                </div>
                <div className="text-cream-400/60 text-xs">${bill.amount.toFixed(2)}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
              {isAdm && (
                <button onClick={() => softDelete(bill.id)} className="text-cream-400/40 hover:text-rose-400 transition flex-shrink-0 focus-ring">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {paid.length > 0 && (
        <div className="space-y-2">
          <div className="text-cream-400/50 text-xs uppercase tracking-wide">Paid ({paid.length})</div>
          {paid.map(bill => (
            <div key={bill.id} className="flex items-center gap-3 bg-bark-800/30 border border-bark-700 rounded-xl px-4 py-3 opacity-60">
              <button onClick={() => togglePaid(bill.id)} className="text-sage-500 transition flex-shrink-0 focus-ring">
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-cream-400/60 text-sm line-through">{bill.name}</div>
                <div className="text-cream-400/50 text-xs">${bill.amount.toFixed(2)}</div>
              </div>
              {isAdm && (
                <button onClick={() => softDelete(bill.id)} className="text-cream-400/40 hover:text-rose-400 transition flex-shrink-0 focus-ring">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdm && deleted.length > 0 && (
        <div className="space-y-2">
          <div className="text-cream-400/40 text-xs uppercase tracking-wide">Removed</div>
          {deleted.map(bill => (
            <div key={bill.id} className="flex items-center gap-3 bg-bark-800/20 border border-bark-700/50 rounded-xl px-4 py-2 opacity-40">
              <div className="flex-1 text-cream-400/50 text-sm line-through">{bill.name}</div>
              <button onClick={() => restore(bill.id)} className="text-cream-400/40 hover:text-honey-400 transition focus-ring"><RotateCcw className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BillTracker;
