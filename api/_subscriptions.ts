// api/_subscriptions.ts
// Pure logic — detects recurring merchants with cadence + price-creep. No I/O.

export type RecurringBill = {
  merchant: string; avgAmount: number;
  cadence: 'weekly' | 'monthly' | 'irregular';
  priceIncreased: boolean; occurrences: number;
};

// Normalize a raw description into a stable merchant key.
export function normalizeMerchant(desc: string): string {
  return (desc || '')
    .toUpperCase()
    .replace(/\b\d{2,}\b/g, ' ')          // strip long digit runs (store #, txn ids)
    .replace(/[^A-Z ]/g, ' ')             // strip punctuation
    .replace(/\b(INC|LLC|COM|PURCHASE|PAYMENT|POS|DEBIT|AUTOPAY)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectRecurring(
  expenses: Array<{ amount: number; date: string; notes: string }>,
): RecurringBill[] {
  const groups: Record<string, Array<{ amount: number; date: string }>> = {};
  for (const e of expenses) {
    if (e.amount < 3) continue;
    const key = normalizeMerchant(e.notes);
    if (!key) continue;
    (groups[key] ||= []).push({ amount: e.amount, date: e.date });
  }

  const bills: RecurringBill[] = [];
  for (const [merchant, items] of Object.entries(groups)) {
    if (items.length < 2) continue;
    items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const intervals: number[] = [];
    for (let i = 1; i < items.length; i++) {
      const days = (new Date(items[i].date).getTime() - new Date(items[i - 1].date).getTime()) / 86400000;
      intervals.push(days);
    }
    const medInterval = median(intervals);

    let cadence: RecurringBill['cadence'] = 'irregular';
    if (medInterval >= 5 && medInterval <= 9) cadence = 'weekly';
    else if (medInterval >= 26 && medInterval <= 35) cadence = 'monthly';

    // Only treat weekly/monthly with consistent-ish amounts as subscriptions.
    if (cadence === 'irregular') continue;

    const amounts = items.map((i) => i.amount);
    const avgAmount = parseFloat((amounts.reduce((s, a) => s + a, 0) / amounts.length).toFixed(2));
    const priceIncreased = amounts[amounts.length - 1] > amounts[0] * 1.15;

    bills.push({ merchant, avgAmount, cadence, priceIncreased, occurrences: items.length });
  }
  return bills;
}
