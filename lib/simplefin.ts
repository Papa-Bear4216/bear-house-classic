// SimpleFIN client. Unlike Plaid, a SimpleFIN access URL is a single bearer
// credential (Basic Auth baked into the URL) covering every account linked at
// the bridge — there's no per-item scoping. It must only ever live server-side;
// see app/api/simplefin/route.ts for where it's stored and used.

export interface SimpleFinTransaction {
  id: string;
  posted: number; // unix seconds
  amount: string; // signed decimal string; negative = money out
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
}

export interface SimpleFinAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  'available-balance'?: string;
  'balance-date': number;
  org: { name?: string; domain?: string };
  transactions: SimpleFinTransaction[];
}

interface SimpleFinAccountsResponse {
  accounts: SimpleFinAccount[];
  errors?: string[];
}

/** Exchanges a one-time SimpleFIN setup token for a permanent access URL. */
export async function claimAccessUrl(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken.trim(), 'base64').toString('utf8');
  } catch {
    throw new Error('Setup token is not valid base64.');
  }
  if (!/^https?:\/\//.test(claimUrl)) {
    throw new Error('Setup token did not decode to a valid claim URL.');
  }

  const res = await fetch(claimUrl, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`SimpleFIN claim failed (${res.status}). Setup tokens are single-use — request a new one if this was already claimed.`);
  }
  const accessUrl = (await res.text()).trim();
  if (!/^https?:\/\//.test(accessUrl)) {
    throw new Error('SimpleFIN did not return a valid access URL.');
  }
  return accessUrl;
}

function authorizedFetch(accessUrl: string, path: string) {
  const url = new URL(accessUrl);
  const auth = Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
  url.username = '';
  url.password = '';
  return fetch(`${url.origin}${url.pathname}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  });
}

/** Fetches all linked accounts + their transactions from a claimed access URL. */
export async function fetchAccounts(accessUrl: string, opts?: { startDate?: number; pending?: boolean }): Promise<SimpleFinAccountsResponse> {
  const params = new URLSearchParams();
  if (opts?.startDate) params.set('start-date', String(opts.startDate));
  if (opts?.pending) params.set('pending', '1');

  const res = await authorizedFetch(accessUrl, `/accounts${params.toString() ? `?${params}` : ''}`);
  if (!res.ok) {
    throw new Error(`SimpleFIN /accounts returned ${res.status}. The bridge connection may need to be re-claimed.`);
  }
  return res.json();
}
