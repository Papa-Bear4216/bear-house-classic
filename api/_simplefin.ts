// api/_simplefin.ts
// SimpleFIN Bridge client — no SDK, pure fetch, Edge-safe.
// Flow: setup token (base64) → decode → POST → access URL (basic-auth embedded) → GET /accounts.

export type SimpleFinTxn = { id: string; posted: number; amount: string; description: string; pending?: boolean };
export type SimpleFinAccount = {
  id: string;
  org: { name?: string; domain?: string };
  name: string;
  balance: string;
  currency: string;
  transactions: SimpleFinTxn[];
};

export async function claimAccessUrl(setupToken: string): Promise<string> {
  // Setup token is a base64-encoded claim URL.
  const claimUrl = atob(setupToken.trim());
  const res = await fetch(claimUrl, { method: 'POST' });
  if (!res.ok) throw new Error(`SimpleFIN claim failed: ${res.status} (token may already be claimed)`);
  const accessUrl = (await res.text()).trim();
  if (!/^https?:\/\/.+@/.test(accessUrl)) throw new Error('SimpleFIN did not return a valid access URL');
  return accessUrl;
}

function toEpochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export async function fetchAccounts(accessUrl: string, startDate: Date, endDate: Date): Promise<SimpleFinAccount[]> {
  // Split embedded credentials out of the URL for the Authorization header (Edge fetch ignores userinfo in URL).
  const u = new URL(accessUrl);
  const auth = 'Basic ' + btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`);
  u.username = ''; u.password = '';
  const base = u.toString().replace(/\/$/, '');

  const params = new URLSearchParams({
    'start-date': String(toEpochSeconds(startDate)),
    'end-date': String(toEpochSeconds(endDate)),
  });
  const res = await fetch(`${base}/accounts?${params.toString()}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error(`SimpleFIN /accounts failed: ${res.status}`);
  const data = (await res.json()) as any;
  return (data.accounts || []).map((a: any) => ({
    id: a.id,
    org: { name: a.org?.name, domain: a.org?.domain },
    name: a.name,
    balance: a.balance,
    currency: a.currency,
    transactions: (a.transactions || []).map((t: any) => ({
      id: t.id, posted: t.posted, amount: t.amount, description: t.description, pending: t.pending,
    })),
  }));
}
