'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string;
  type: string;
  subtype: string;
  balances: {
    available: number | null;
    current: number | null;
    limit: number | null;
    iso_currency_code: string | null;
  };
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  name: string;
  merchant_name?: string;
  amount: number;
  date: string;
  category?: string[];
  payment_channel: string;
  pending: boolean;
}

export interface LinkedBank {
  itemId: string;
  accessToken: string;
  institutionName?: string;
  linkedAt: string;
}

export function usePlaid() {
  const [linkedBanks, setLinkedBanks] = useState<LinkedBank[]>([]);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = () => auth?.currentUser?.uid ?? 'shared';

  // Listen for linked banks in Firestore
  useEffect(() => {
    if (!db) { setLoadingBanks(false); return; }
    const ref = doc(db, 'households', uid(), 'plaid', 'banks');
    const unsub = onSnapshot(ref, snap => {
      setLinkedBanks(snap.exists() ? (snap.data().banks ?? []) : []);
      setLoadingBanks(false);
    });
    return unsub;
  }, []);

  // Auto-fetch accounts when banks are loaded
  useEffect(() => {
    if (!loadingBanks && linkedBanks.length > 0) {
      fetchAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingBanks]);

  async function getLinkToken(userId?: string): Promise<string> {
    const res = await fetch('/api/plaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId ?? uid() }),
    });
    const data = await res.json();
    if (!data.link_token) throw new Error(data.error ?? 'Failed to get link token');
    return data.link_token;
  }

  async function exchangeAndSave(publicToken: string, institutionName?: string) {
    const res = await fetch('/api/plaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exchange_token', public_token: publicToken }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error(data.error ?? 'Exchange failed');

    const newBank: LinkedBank = {
      itemId: data.item_id,
      accessToken: data.access_token,
      institutionName: institutionName ?? 'Bank',
      linkedAt: new Date().toISOString(),
    };

    const ref = doc(db!, 'households', uid(), 'plaid', 'banks');
    const snap = await getDoc(ref);
    const existing: LinkedBank[] = snap.exists() ? (snap.data().banks ?? []) : [];
    const updated = [...existing.filter(b => b.itemId !== newBank.itemId), newBank];
    await setDoc(ref, { banks: updated });
    await fetchAll(updated);
  }

  async function fetchAll(banks?: LinkedBank[]) {
    const list = banks ?? linkedBanks;
    if (list.length === 0) return;
    setLoadingData(true);
    setError(null);
    try {
      const allAccounts: PlaidAccount[] = [];
      const allTransactions: PlaidTransaction[] = [];

      for (const bank of list) {
        const [accRes, txRes] = await Promise.all([
          fetch('/api/plaid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_accounts', access_token: bank.accessToken }),
          }),
          fetch('/api/plaid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_transactions', access_token: bank.accessToken }),
          }),
        ]);
        const accData = await accRes.json();
        const txData = await txRes.json();
        if (accData.accounts) allAccounts.push(...accData.accounts);
        if (txData.transactions) allTransactions.push(...txData.transactions);
      }

      setAccounts(allAccounts);
      setTransactions(allTransactions.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load bank data');
    } finally {
      setLoadingData(false);
    }
  }

  async function removeBank(itemId: string) {
    const ref = doc(db!, 'households', uid(), 'plaid', 'banks');
    const updated = linkedBanks.filter(b => b.itemId !== itemId);
    await setDoc(ref, { banks: updated });
    setAccounts([]);
    setTransactions([]);
  }

  // Spending by top-level Plaid category
  const spendingByCategory = transactions
    .filter(t => t.amount > 0 && !t.pending)
    .reduce<Record<string, number>>((acc, t) => {
      const cat = t.category?.[0] ?? 'Other';
      acc[cat] = (acc[cat] ?? 0) + t.amount;
      return acc;
    }, {});

  const totalSpent = Object.values(spendingByCategory).reduce((a, b) => a + b, 0);

  const totalBalance = accounts.reduce((sum, a) => {
    if (['depository', 'investment'].includes(a.type)) return sum + (a.balances.current ?? 0);
    if (a.type === 'credit') return sum - (a.balances.current ?? 0);
    return sum;
  }, 0);

  return {
    linkedBanks, accounts, transactions, spendingByCategory, totalSpent, totalBalance,
    loadingBanks, loadingData, error,
    getLinkToken, exchangeAndSave, fetchAll, removeBank,
  };
}
