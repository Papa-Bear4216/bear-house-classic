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
    setRequestModal(null);
  };

  const handleResolve = (id: string, status: 'approved' | 'denied') => {
    if (!currentUser) return;
    const result = resolveClaim(redemptions, balance, id, status, currentUser.name);
    setRedemptions(result.redemptions);
    saveRedemptions(result.redemptions);
    setBalance(result.balance);
    saveJSON(KEYS.points, result.balance);
  };

  const pending = redemptions.filter((r) => r.status === 'pending');
  const history = redemptions
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-3">Point balances</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {householdMembers.map((m) => {
            const pts = balance[m.id] ?? 0;
            return (
              <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOT[m.color] || 'bg-slate-400'}`} />
                <div>
                  <div className="text-sm font-medium text-slate-200">{m.name}</div>
                  <div className="text-xs text-slate-400">{pts} pts</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Reward store</h2>
          {currentUser && (
            <div className="text-sm text-slate-400">
              You have <span className="text-amber-400 font-semibold">{mySpendable} pts</span> to spend
              {myPendingCost > 0 && <span className="text-slate-500"> ({myPendingCost} pending)</span>}
            </div>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REWARD_CATALOG.map((r) => {
            const Icon = ICONS[r.icon] || Gift;
            const affordable = mySpendable >= r.cost;
            return (
              <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-900/30 border border-amber-500/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">{r.title}</div>
                  <div className="text-xs text-slate-400">{r.cost} pts</div>
                </div>
                <Button
                  size="sm"
                  disabled={!affordable || !currentUser}
                  onClick={() => setRequestModal(r)}
                >
                  Request
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {isAdm && pending.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Pending requests</h2>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="bg-slate-900 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-200">
                    <span className="font-medium">{r.memberName}</span> wants <span className="text-amber-400">{r.rewardTitle}</span>
                  </div>
                  <div className="text-xs text-slate-500">{r.cost} pts</div>
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
