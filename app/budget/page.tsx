'use client';

import { useState } from 'react';
import {
  Wallet, Plus, RefreshCw, Sparkles, Trash2, TrendingDown, TrendingUp,
  CreditCard, Landmark, X, AlertCircle, RotateCcw, CalendarClock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePlaidLink } from 'react-plaid-link';
import { usePlaid } from '@/hooks/use-plaid';
import { useFamilyMembers } from '@/hooks/use-family';
import { askHermes } from '@/lib/hermes';
import { detectSubscriptions, totalMonthlySubscriptionCost } from '@/lib/detect-subscriptions';
import type { Subscription } from '@/lib/detect-subscriptions';
import { SubscriptionCancelModal } from '@/components/SubscriptionCancelModal';
import { format, parseISO } from 'date-fns';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-800/60 border border-slate-700/50 rounded-xl ${className}`}>
      {children}
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  'Food and Drink': 'bg-orange-400',
  'Shops': 'bg-blue-400',
  'Travel': 'bg-purple-400',
  'Recreation': 'bg-green-400',
  'Service': 'bg-yellow-400',
  'Healthcare': 'bg-red-400',
  'Transfer': 'bg-slate-400',
  'Payment': 'bg-pink-400',
  'Subscription': 'bg-violet-400',
  'Other': 'bg-slate-500',
};

const CATEGORY_BAR: Record<string, string> = {
  'Food and Drink': 'bg-orange-500',
  'Shops': 'bg-blue-500',
  'Travel': 'bg-purple-500',
  'Recreation': 'bg-emerald-500',
  'Service': 'bg-yellow-500',
  'Healthcare': 'bg-red-500',
  'Subscription': 'bg-violet-500',
};

function PlaidLinkButton({ onSuccess, children }: { onSuccess: (t: string, m: unknown) => void; children: React.ReactNode }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: (public_token, metadata) => { onSuccess(public_token, metadata); setLinkToken(null); },
    onExit: () => setLinkToken(null),
  });

  if (linkToken && ready) open();

  async function handleClick() {
    setFetching(true);
    try {
      const res = await fetch('/api/plaid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.link_token) setLinkToken(data.link_token);
    } catch (e) { console.error(e); }
    finally { setFetching(false); }
  }

  return (
    <button onClick={handleClick} disabled={fetching}
      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
    >
      {fetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      {children}
    </button>
  );
}

type Tab = 'overview' | 'transactions' | 'breakdown' | 'subscriptions';

export default function BudgetPage() {
  const {
    linkedBanks, accounts, transactions, spendingByCategory,
    totalSpent, totalBalance, loadingBanks, loadingData, error,
    exchangeAndSave, fetchAll, removeBank,
  } = usePlaid();
  const { users } = useFamilyMembers();

  const [hermesLoading, setHermesLoading] = useState(false);
  const [hermesInsight, setHermesInsight] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);

  const subscriptions = detectSubscriptions(transactions);
  const monthlySubCost = totalMonthlySubscriptionCost(subscriptions);
  const sortedCategories = Object.entries(spendingByCategory).sort((a, b) => b[1] - a[1]);

  async function handleLinkSuccess(publicToken: string, metadata: unknown) {
    await exchangeAndSave(publicToken, (metadata as { institution?: { name?: string } })?.institution?.name);
  }

  async function askHermesInsights() {
    setHermesLoading(true);
    setHermesInsight('');
    try {
      const topCategories = Object.entries(spendingByCategory)
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`);
      const { content } = await askHermes(
        [{ role: 'user', content: `Analyze this family's spending for the past 30 days. Total: $${totalSpent.toFixed(2)}. By category: ${topCategories.join(', ')}. Give 2-3 specific, actionable insights. Be brief.` }],
        { users, shopping: topCategories },
      );
      setHermesInsight(content);
    } catch { setHermesInsight('Could not reach Hermes. Check ANTHROPIC_API_KEY in Vercel env vars.'); }
    finally { setHermesLoading(false); }
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'transactions', label: 'Transactions', badge: transactions.length },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'subscriptions', label: 'Subscriptions', badge: subscriptions.length },
  ];

  if (loadingBanks) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Budget</h1>
            <p className="text-xs text-slate-500">Powered by Plaid · {linkedBanks.length} bank{linkedBanks.length !== 1 ? 's' : ''} linked</p>
          </div>
        </div>
        <div className="flex gap-2">
          {linkedBanks.length > 0 && (
            <>
              <button onClick={() => fetchAll()} disabled={loadingData}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={askHermesInsights} disabled={hermesLoading || transactions.length === 0}
                className="flex items-center gap-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {hermesLoading ? 'Thinking…' : 'AI Insights'}
              </button>
            </>
          )}
          <PlaidLinkButton onSuccess={handleLinkSuccess}>
            {linkedBanks.length === 0 ? 'Connect Bank' : 'Add Bank'}
          </PlaidLinkButton>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="p-3 border-red-500/40 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </Card>
      )}

      {/* Empty state */}
      {linkedBanks.length === 0 && (
        <div className="text-center py-20">
          <Landmark className="w-14 h-14 mx-auto mb-4 text-slate-700" />
          <h2 className="text-lg font-bold text-white mb-2">Connect your bank</h2>
          <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
            Link accounts to track spending, balances, subscriptions, and get AI budget insights.
          </p>
          <PlaidLinkButton onSuccess={handleLinkSuccess}>Connect Bank Account</PlaidLinkButton>
        </div>
      )}

      {linkedBanks.length > 0 && (
        <>
          {/* Hermes insight */}
          <AnimatePresence>
            {hermesInsight && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="p-4 border-violet-500/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-violet-400 mb-1.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Hermes Insights
                      </p>
                      <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{hermesInsight}</p>
                    </div>
                    <button onClick={() => setHermesInsight('')} className="text-slate-600 hover:text-slate-400 flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 border-l-4 border-emerald-500/60">
              <p className="text-2xl font-black text-white">${Math.abs(totalBalance).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-slate-400 mt-0.5">Net Balance</p>
              <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                {totalBalance >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </p>
            </Card>
            <Card className="p-4 border-l-4 border-orange-500/60">
              <p className="text-2xl font-black text-white">${totalSpent.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-slate-400 mt-0.5">Spent (30d)</p>
              <p className="text-[10px] text-slate-500 mt-1">{transactions.filter(t => t.amount > 0).length} transactions</p>
            </Card>
            <Card className="p-4 border-l-4 border-violet-500/60">
              <p className="text-2xl font-black text-white">${monthlySubCost.toFixed(0)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Subscriptions/mo</p>
              <p className="text-[10px] text-slate-500 mt-1">{subscriptions.length} detected</p>
            </Card>
            <Card className="p-4 border-l-4 border-blue-500/60">
              <p className="text-2xl font-black text-white">${(monthlySubCost * 12).toFixed(0)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Subscriptions/yr</p>
              <p className="text-[10px] text-slate-500 mt-1">annual cost</p>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="text-[10px] font-bold bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded-full">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Accounts</h3>
              {loadingData ? (
                <p className="text-sm text-slate-500 py-4">Loading…</p>
              ) : (
                accounts.map(acc => (
                  <Card key={acc.account_id} className="p-3 flex items-center gap-3">
                    <div className="p-2 bg-indigo-900/40 rounded-lg">
                      {acc.type === 'credit' ? <CreditCard className="w-4 h-4 text-indigo-400" /> : <Landmark className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-white truncate">{acc.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{acc.subtype}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${acc.type === 'credit' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {acc.type === 'credit' ? '-' : ''}${(acc.balances.current ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      {acc.balances.available !== null && acc.balances.available !== acc.balances.current && (
                        <p className="text-[10px] text-slate-500">${acc.balances.available?.toLocaleString('en-US', { minimumFractionDigits: 2 })} avail</p>
                      )}
                    </div>
                  </Card>
                ))
              )}
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-2">Linked Banks</h3>
              {linkedBanks.map(bank => (
                <div key={bank.itemId} className="flex items-center justify-between px-3 py-2.5 bg-slate-800/40 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-white">{bank.institutionName}</p>
                    <p className="text-xs text-slate-500">Linked {format(parseISO(bank.linkedAt), 'MMM d, yyyy')}</p>
                  </div>
                  <button onClick={() => removeBank(bank.itemId)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Transactions */}
          {activeTab === 'transactions' && (
            <div className="space-y-2">
              {loadingData ? (
                <p className="text-sm text-slate-500 py-8 text-center">Loading transactions…</p>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No transactions found</p>
              ) : (
                transactions.slice(0, 50).map(tx => (
                  <Card key={tx.transaction_id} className={`px-3 py-2.5 flex items-center gap-3 ${tx.pending ? 'opacity-50' : ''}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_COLORS[tx.category?.[0] ?? 'Other'] ?? 'bg-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-white truncate">{tx.merchant_name ?? tx.name}</p>
                      <p className="text-[10px] text-slate-500">{format(parseISO(tx.date), 'MMM d')} · {tx.category?.[0] ?? 'Other'}{tx.pending ? ' · pending' : ''}</p>
                    </div>
                    <p className={`font-bold text-sm flex-shrink-0 ${tx.amount < 0 ? 'text-emerald-400' : 'text-white'}`}>
                      {tx.amount < 0 ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                    </p>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Breakdown */}
          {activeTab === 'breakdown' && (
            <div className="space-y-3">
              {loadingData ? (
                <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
              ) : sortedCategories.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No spending data yet</p>
              ) : (
                sortedCategories.map(([cat, amt]) => {
                  const pct = totalSpent > 0 ? (amt / totalSpent) * 100 : 0;
                  return (
                    <Card key={cat} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm text-white">{cat}</p>
                        <div>
                          <span className="font-bold text-sm text-white">${amt.toFixed(2)}</span>
                          <span className="text-xs text-slate-500 ml-2">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={`h-full rounded-full ${CATEGORY_BAR[cat] ?? 'bg-slate-400'}`}
                        />
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Subscriptions */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-3">
              {subscriptions.length === 0 ? (
                <Card className="p-8 text-center">
                  <CalendarClock className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                  <p className="text-sm font-semibold text-slate-400">No recurring subscriptions detected</p>
                  <p className="text-xs text-slate-600 mt-1">Connect more banks or wait for more transaction history</p>
                </Card>
              ) : (
                <>
                  <Card className="p-4 border-violet-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-0.5">Total Monthly Cost</p>
                        <p className="text-2xl font-black text-white">${monthlySubCost.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">${(monthlySubCost * 12).toFixed(0)}/year · {subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}</p>
                      </div>
                      <RotateCcw className="w-8 h-8 text-violet-800" />
                    </div>
                  </Card>

                  {subscriptions.map(sub => (
                    <Card key={sub.id} className="p-4 hover:border-violet-500/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white">{sub.merchantName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            ${sub.amount.toFixed(2)}/{sub.frequency} · last {format(parseISO(sub.lastCharged), 'MMM d')} · {sub.transactions.length} charges
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold text-sm text-white">${sub.monthlyEquivalent.toFixed(2)}/mo</p>
                            <p className="text-[10px] text-slate-500">${(sub.monthlyEquivalent * 12).toFixed(0)}/yr</p>
                          </div>
                          <button
                            onClick={() => setCancelTarget(sub)}
                            className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-400 text-xs font-semibold rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {cancelTarget && (
          <SubscriptionCancelModal subscription={cancelTarget} onClose={() => setCancelTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
