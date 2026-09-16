import React, { useState } from 'react';
import {
  Video, Film, DollarSign, Moon, IceCream, PartyPopper, Gift,
} from 'lucide-react';
import {
  REWARD_CATALOG, loadPointsBalance, loadRedemptions, saveRedemptions,
  saveJSON, KEYS, uid, computeSpendable, resolveClaim,
  RewardRedemption, RewardCatalogItem,
} from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { triggerConfetti } from '@/lib/confetti';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Video, Film, DollarSign, Moon, IceCream, PartyPopper,
};

const COLOR_DOT: Record<string, string> = {
  indigo: 'bg-indigo-400', pink: 'bg-pink-400', purple: 'bg-purple-400',
  blue: 'bg-blue-400', orange: 'bg-orange-400', rose: 'bg-rose-400',
  emerald: 'bg-emerald-400', slate: 'bg-slate-400',
};

const RewardStore: React.FC = () => {
  const { householdMembers, currentUser, currentRole } = useAppContext();
  const isAdm = currentRole === 'superadmin' || currentRole === 'admin';

  const [redemptions, setRedemptions] = useState<RewardRedemption[]>(() => loadRedemptions());
  const [balance, setBalance] = useState(() => loadPointsBalance());
  const [requestModal, setRequestModal] = useState<RewardCatalogItem | null>(null);

  const myBalance = currentUser ? (balance[currentUser.id] ?? 0) : 0;
  const mySpendable = currentUser ? computeSpendable(myBalance, redemptions, currentUser.id) : 0;
  const myPendingCost = myBalance - mySpendable;

  const persistRedemptions = (next: RewardRedemption[]) => {
    setRedemptions(next);
    saveRedemptions(next);
  };

  const confirmRequest = () => {
    if (!requestModal || !currentUser) return;
    const entry: RewardRedemption = {
      id: uid(),
      memberId: currentUser.id,
      memberName: currentUser.name,
      rewardId: requestModal.id,
      rewardTitle: requestModal.title,
      cost: requestModal.cost,
      status: 'pending',
      requestedAt: Date.now(),
    };
    persistRedemptions([entry, ...redemptions]);
    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.45, 50);
    setRequestModal(null);
  };

  const handleResolve = (id: string, status: 'approved' | 'denied') => {
    if (!currentUser) return;
    const result = resolveClaim(redemptions, balance, id, status, currentUser.name);
    setRedemptions(result.redemptions);
    saveRedemptions(result.redemptions);
    setBalance(result.balance);
    saveJSON(KEYS.points, result.balance);
    if (status === 'approved') {
      triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.4, 75);
    }
  };

  const pending = redemptions.filter((r) => r.status === 'pending');
  const history = redemptions
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-white mb-3 font-display">Squad Point Balances</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {householdMembers.map((m) => {
            const pts = balance[m.id] ?? 0;
            return (
              <div key={m.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
                <span className={`w-3 h-3 rounded-full ${COLOR_DOT[m.color] || 'bg-slate-400'} ring-4 ring-white/5`} />
                <div>
                  <div className="text-sm font-bold text-white font-display">{m.name}</div>
                  <div className="text-xs text-amber-400 font-mono font-semibold">{pts} pts</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white font-display">Reward Store</h2>
            <p className="text-xs text-slate-400">Trade chore momentum for real rewards</p>
          </div>
          {currentUser && (
            <div className="text-xs sm:text-sm text-slate-300 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full">
              Spendable: <span className="text-amber-400 font-bold font-mono">{mySpendable} pts</span>
              {myPendingCost > 0 && <span className="text-slate-400 font-mono"> ({myPendingCost} pending)</span>}
            </div>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {REWARD_CATALOG.map((r) => {
            const Icon = ICONS[r.icon] || Gift;
            const affordable = mySpendable >= r.cost;
            return (
              <div
                key={r.id}
                className={`bg-gradient-to-br from-white/[0.04] to-white/[0.01] border rounded-3xl p-5 flex flex-col gap-3.5 shadow-xl transition-all duration-200 backdrop-blur-xl ${
                  affordable ? 'border-white/10 hover:border-amber-400/40 hover:scale-[1.02]' : 'border-white/5 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {r.cost} pts
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold text-white font-display">{r.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {affordable ? 'Available to claim now!' : `Need ${r.cost - mySpendable} more pts`}
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!affordable || !currentUser}
                  onClick={() => setRequestModal(r)}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm transition active:scale-[0.98] ${
                    affordable
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-white/5 text-slate-500 border border-white/5'
                  }`}
                >
                  {affordable ? 'Claim Reward' : 'Keep Earning'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {isAdm && pending.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-white mb-3 font-display">Pending Requests</h2>
          <div className="space-y-2.5">
            {pending.map((r) => (
              <div key={r.id} className="bg-white/[0.03] border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg">
                <div>
                  <div className="text-sm text-slate-200">
                    <span className="font-bold text-white">{r.memberName}</span> wants <span className="text-amber-400 font-bold">{r.rewardTitle}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{r.cost} pts</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleResolve(r.id, 'denied')}>Deny</Button>
                  <Button size="sm" onClick={() => handleResolve(r.id, 'approved')}>Approve</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdm && history.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Redemption history</h2>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((r) => (
              <div key={r.id} className="text-sm flex items-center justify-between gap-3 px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="text-slate-300">
                  {r.memberName} — {r.rewardTitle} ({r.cost} pts)
                </div>
                <span className={`text-xs font-medium ${r.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!requestModal} onOpenChange={(open) => !open && setRequestModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request "{requestModal?.title}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-400">
            This will send a request to a parent for approval. {requestModal?.cost} points will be
            held until they respond.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestModal(null)}>Cancel</Button>
            <Button onClick={confirmRequest}>Confirm request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RewardStore;
