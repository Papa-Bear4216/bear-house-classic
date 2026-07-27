'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import type { BankAccount, BankTransaction, LinkedBank } from '@/lib/bank-data';

export type { BankAccount, BankTransaction, LinkedBank };

async function authedFetch(body: Record<string, unknown>) {
  const token = await auth?.currentUser?.getIdToken();
  const res = await fetch('/api/simplefin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export function useSimpleFin() {
  const [linkedBanks, setLinkedBanks] = useState<LinkedBank[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = () => auth?.currentUser?.uid ?? 'shared';

  // Metadata only (institution name, linkedAt) — the access URL itself lives
  // server-side in bankSecrets, which firestore.rules denies to every client.
  useEffect(() => {
    if (!db) { setLoadingBanks(false); return; }
    const ref = collection(db, 'households', uid(), 'bankConnections');
    const unsub = onSnapshot(ref, snap => {
      setLinkedBanks(snap.docs.map(d => ({ connectionId: d.id, ...d.data() } as LinkedBank)));
      setLoadingBanks(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!loadingBanks && linkedBanks.length > 0) fetchAll();
  }, [loadingBanks, linkedBanks.length]);

  async function claim(setupToken: string, label?: string) {
    await authedFetch({ action: 'claim', setupToken, label });
  }

  async function fetchAll() {
    setLoadingData(true);
    setError(null);
    try {
      const data = await authedFetch({ action: 'sync' });
      setAccounts(data.accounts ?? []);
      setTransactions(data.transactions ?? []);
      if (data.staleConnections?.length) {
        setError(`${data.staleConnections.length} bank connection(s) need to be re-linked.`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load bank data');
    } finally {
      setLoadingData(false);
    }
  }

  async function removeBank(connectionId: string) {
    await authedFetch({ action: 'remove', connectionId });
  }

  const spendingByCategory = transactions
    .filter(t => t.amount > 0 && !t.pending)
    .reduce<Record<string, number>>((acc, t) => {
      const cat = t.category?.[0] ?? 'Other';
      acc[cat] = (acc[cat] ?? 0) + t.amount;
      return acc;
    }, {});

  const totalSpent = Object.values(spendingByCategory).reduce((a, b) => a + b, 0);

  const totalBalance = accounts.reduce((sum, a) => {
    if (a.type === 'credit') return sum - (a.balances.current ?? 0);
    return sum + (a.balances.current ?? 0);
  }, 0);

  return {
    linkedBanks, accounts, transactions, spendingByCategory, totalSpent, totalBalance,
    loadingBanks, loadingData, error,
    claim, fetchAll, removeBank,
  };
}
