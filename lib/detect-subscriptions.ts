import { PlaidTransaction } from '@/hooks/use-plaid';

export interface Subscription {
  id: string;
  merchantName: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'annual';
  lastCharged: string;
  transactions: PlaidTransaction[];
  category: string;
  monthlyEquivalent: number;
}

function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\*\s*.*/g, '')       // "NETFLIX* 123" → "netflix"
    .replace(/\s+\d{4,}$/g, '')       // trailing ref numbers
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectSubscriptions(transactions: PlaidTransaction[]): Subscription[] {
  const charges = transactions.filter(t => t.amount > 0 && !t.pending);

  const byMerchant = new Map<string, PlaidTransaction[]>();
  for (const tx of charges) {
    const key = normalizeMerchant(tx.merchant_name ?? tx.name);
    if (!key) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key)!.push(tx);
  }

  const subs: Subscription[] = [];

  for (const [, txs] of byMerchant) {
    if (txs.length < 2) continue;
    txs.sort((a, b) => b.date.localeCompare(a.date));

    // Amounts must be consistent within 15%
    const base = txs[0].amount;
    if (!txs.every(t => Math.abs(t.amount - base) / base < 0.15)) continue;

    // Measure gaps in days between charges
    const dates = txs.map(t => new Date(t.date).getTime());
    const gaps = dates.slice(0, -1).map((d, i) => (d - dates[i + 1]) / 86_400_000);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    let frequency: Subscription['frequency'];
    let monthlyEquivalent: number;
    if (avg >= 6 && avg <= 8)        { frequency = 'weekly';  monthlyEquivalent = base * 4.33; }
    else if (avg >= 25 && avg <= 35) { frequency = 'monthly'; monthlyEquivalent = base; }
    else if (avg >= 350 && avg <= 380){ frequency = 'annual'; monthlyEquivalent = base / 12; }
    else continue;

    subs.push({
      id: normalizeMerchant(txs[0].merchant_name ?? txs[0].name),
      merchantName: txs[0].merchant_name ?? txs[0].name,
      amount: base,
      frequency,
      lastCharged: txs[0].date,
      transactions: txs,
      category: txs[0].category?.[0] ?? 'Service',
      monthlyEquivalent,
    });
  }

  return subs.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}

export function totalMonthlySubscriptionCost(subs: Subscription[]): number {
  return subs.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
}
