// src/lib/transactionReview.ts
// Pure logic and client API helpers for Transaction Categorization & Uncertain Review Loop.

import { authedFetch } from './householdAuth';

export const CATEGORIES = [
  'Housing',
  'Food',
  'Transportation',
  'Utilities',
  'Insurance',
  'Entertainment',
  'Clothing',
  'Healthcare',
  'Savings',
  'Kids',
  'Pets',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface ExpenseItem {
  id: string;
  amount: number;
  category: string;
  paidBy: string;
  owner?: string;
  ownerId?: string;
  date: string;
  notes: string;
  createdAt: number;
  deletedAt?: number;
  extId?: string;
  source?: 'simplefin' | 'manual';
  institutionName?: string;
  needsReview?: boolean;
  reviewed?: boolean;
}

/**
 * Normalizes a raw description/notes string into a stable merchant key.
 * Strips store numbers, transaction IDs, legal entity suffixes, and punctuation.
 */
export function normalizeMerchantName(desc: string): string {
  return (desc || '')
    .toUpperCase()
    .replace(/\b\d{2,}\b/g, ' ') // strip digit runs of 2+ chars
    .replace(/[^A-Z ]/g, ' ') // strip punctuation
    .replace(/\b(INC|LLC|COM|PURCHASE|PAYMENT|POS|DEBIT|AUTOPAY)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines whether an expense transaction needs user review.
 * A transaction is uncertain if:
 * 1. It has not been confirmed/reviewed (`!reviewed`), AND
 * 2. Either `needsReview` is explicitly true, OR (for simplefin bank-synced rows)
 *    its category is 'Other', empty, or 'uncategorized'.
 * Manual transactions with a user-chosen category do not flood the review queue.
 */
export function isUncertainTransaction(expense: {
  source?: string;
  category?: string;
  needsReview?: boolean;
  reviewed?: boolean;
}): boolean {
  if (expense.reviewed) return false;
  if (expense.needsReview) return true;
  if (expense.source === 'simplefin') {
    const cat = (expense.category || '').trim().toLowerCase();
    return !cat || cat === 'other' || cat === 'uncategorized';
  }
  return false;
}

/**
 * Filters a list of expenses to only active, uncertain transactions that need review.
 * Excludes soft-deleted items (`deletedAt`).
 */
export function filterUncertainTransactions<
  T extends {
    deletedAt?: number;
    source?: string;
    category?: string;
    needsReview?: boolean;
    reviewed?: boolean;
  }
>(expenses: T[]): T[] {
  return expenses.filter((e) => !e.deletedAt && isUncertainTransaction(e));
}

export interface RecategorizeResult {
  ok: boolean;
  error?: string;
  updatedCount?: number;
  updatedIds?: string[];
}

/**
 * Submits a batch recategorization to the server.
 * Updates the merchant category cache and retroactively updates matching transactions.
 */
export async function recategorizeBatchTransactions(
  items: Array<{ merchant: string; category: string; transactionId?: string }>
): Promise<RecategorizeResult> {
  if (items.length === 0) return { ok: true, updatedCount: 0, updatedIds: [] };
  try {
    const res = await authedFetch('/api/finance', {
      method: 'POST',
      body: JSON.stringify({
        action: 'recategorize',
        items,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return data;
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

/**
 * Submits a single recategorization / confirmation to the server.
 */
export async function recategorizeTransaction(params: {
  merchant: string;
  category: string;
  transactionId?: string;
}): Promise<RecategorizeResult> {
  return recategorizeBatchTransactions([params]);
}
