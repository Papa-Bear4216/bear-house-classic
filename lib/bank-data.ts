import type { SimpleFinAccount } from '@/lib/simplefin';

// Shared shape the budget UI and subscription detector work with, independent
// of which aggregator sourced the data. Field names intentionally mirror the
// original Plaid types so the UI layer didn't need to change when we moved
// from Plaid to SimpleFIN.
export interface BankAccount {
  account_id: string;
  name: string;
  type: 'depository' | 'credit' | 'investment' | 'other';
  subtype: string;
  balances: {
    available: number | null;
    current: number | null;
    limit: number | null;
    iso_currency_code: string | null;
  };
}

export interface BankTransaction {
  transaction_id: string;
  account_id: string;
  name: string;
  merchant_name?: string;
  amount: number; // positive = money out, to match the existing UI convention
  date: string; // ISO date (YYYY-MM-DD)
  category?: string[];
  payment_channel: string;
  pending: boolean;
}

export interface LinkedBank {
  connectionId: string;
  institutionName?: string;
  linkedAt: string;
}

/** SimpleFIN reports negative = money out; the UI convention here is positive = money out. */
export function normalizeSimpleFinAccounts(accounts: SimpleFinAccount[], connectionId: string): {
  accounts: BankAccount[];
  transactions: BankTransaction[];
} {
  const out: BankAccount[] = [];
  const txs: BankTransaction[] = [];

  for (const acc of accounts) {
    const balance = parseFloat(acc.balance);
    const isCredit = balance < 0 && /credit|card/i.test(acc.name);
    out.push({
      account_id: acc.id,
      name: acc.name,
      type: isCredit ? 'credit' : 'depository',
      subtype: acc.org?.name ?? 'account',
      balances: {
        current: isCredit ? Math.abs(balance) : balance,
        available: acc['available-balance'] != null ? parseFloat(acc['available-balance']) : null,
        limit: null,
        iso_currency_code: acc.currency ?? 'USD',
      },
    });

    for (const tx of acc.transactions ?? []) {
      txs.push({
        transaction_id: `${connectionId}:${tx.id}`,
        account_id: acc.id,
        name: tx.description,
        merchant_name: tx.payee || undefined,
        amount: -parseFloat(tx.amount), // flip sign to match UI convention
        date: new Date(tx.posted * 1000).toISOString().slice(0, 10),
        category: undefined, // SimpleFIN doesn't categorize; relies on Hermes auto-categorize
        payment_channel: 'other',
        pending: Boolean(tx.pending),
      });
    }
  }

  return { accounts: out, transactions: txs };
}
