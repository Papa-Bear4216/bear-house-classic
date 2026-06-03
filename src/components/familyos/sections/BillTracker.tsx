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
    if (bill.paid) return { cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30', label: 'Paid' };
    if (!bill.dueDate) return { cls: 'bg-slate-700 text-slate-300', label: 'No due date' };
    const days = Math.round((bill.dueDate - Date.now()) / 86400000);
    if (days < 0) return { cls: 'bg-rose-900/40 text-rose-300 border-rose-500/30', label: `${Math.abs(days)}d overdue` };
    if (days <= 3) return { cls: 'bg-amber-900/40 text-amber-300 border-amber-500/30', label: `Due in ${days}d` };
    return { cls: 'bg-slate-700 text-slate-300', label: `Due in ${days}d` };
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
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded-lg transition">
          <Plus className="w-4 h-4" /> Add Bill
        </button>
      </div>

      {unpaid.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3 flex justify-between items-center">
          <span className="text-slate-400 text-sm">Total unpaid</span>
          <span className="text-white font-bold text-lg">${totalUnpaid.toFixed(2)}</span>
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Bill name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Electric bill" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-blue-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="rounded" />
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" /> Auto-recurring
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded transition">Cancel</button>
            <button onClick={addBill} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg transition">Add Bill</button>
          </div>
        </div>
      )}

      {active.length === 0 && (
        <div className="text-center text-slate-500 py-8 text-sm">No bills tracked yet.</div>
      )}

      <div className="space-y-2">
        {unpaid.map(bill => {
          const badge = getBadge(bill);
          return (
            <div key={bill.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
              <button onClick={() => togglePaid(bill.id)} className="text-slate-400 hover:text-emerald-400 transition flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{bill.name}</span>
                  {bill.recurring && <RefreshCw className="w-3 h-3 text-slate-500" />}
                </div>
                <div className="text-slate-400 text-xs">${bill.amount.toFixed(2)}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
              {isAdm && (
                <button onClick={() => softDelete(bill.id)} className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {paid.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-500 text-xs uppercase tracking-wide">Paid ({paid.length})</div>
          {paid.map(bill => (
            <div key={bill.id} className="flex items-center gap-3 bg-slate-900/30 border border-slate-800 rounded-xl px-4 py-3 opacity-60">
              <button onClick={() => togglePaid(bill.id)} className="text-emerald-500 transition flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-slate-400 text-sm line-through">{bill.name}</div>
                <div className="text-slate-500 text-xs">${bill.amount.toFixed(2)}</div>
              </div>
              {isAdm && (
                <button onClick={() => softDelete(bill.id)} className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdm && deleted.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-600 text-xs uppercase tracking-wide">Removed</div>
          {deleted.map(bill => (
            <div key={bill.id} className="flex items-center gap-3 bg-slate-900/20 border border-slate-800/50 rounded-xl px-4 py-2 opacity-40">
              <div className="flex-1 text-slate-500 text-sm line-through">{bill.name}</div>
              <button onClick={() => restore(bill.id)} className="text-slate-600 hover:text-amber-400 transition"><RotateCcw className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BillTracker;
