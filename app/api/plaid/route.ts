import { NextRequest, NextResponse } from 'next/server';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';

function getPlaidClient() {
  const env = process.env.PLAID_ENV as keyof typeof PlaidEnvironments;
  const basePath = PlaidEnvironments[env] ?? PlaidEnvironments.sandbox;
  const config = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action ?? body.type ?? body.method ?? '';
  console.log('Plaid request:', JSON.stringify({ action, keys: Object.keys(body) }));

  try {
    const client = getPlaidClient();

    // Create link token — all common name variants
    if (!action || ['create_link_token', 'createLinkToken', 'create_token', 'link_token', 'getLinkToken'].includes(action)) {
      const userId = body.userId ?? body.user_id ?? body.clientUserId ?? 'bearhouse-user';
      const response = await client.linkTokenCreate({
        user: { client_user_id: String(userId) },
        client_name: 'Bear House OS',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      });
      return NextResponse.json({ link_token: response.data.link_token });
    }

    // Exchange public token — all common name variants
    if (['exchange_token', 'exchangeToken', 'exchange_public_token', 'exchangePublicToken', 'set_access_token'].includes(action)) {
      const public_token = body.public_token ?? body.publicToken ?? body.token;
      const response = await client.itemPublicTokenExchange({ public_token });
      const { access_token, item_id } = response.data;
      return NextResponse.json({ access_token, item_id });
    }

    // Get accounts
    if (['get_accounts', 'getAccounts', 'accounts'].includes(action)) {
      const access_token = body.access_token ?? body.accessToken;
      const response = await client.accountsGet({ access_token });
      return NextResponse.json({ accounts: response.data.accounts });
    }

    // Refresh transactions (triggers Plaid to sync — call after exchange)
    if (['refresh_transactions', 'refreshTransactions'].includes(action)) {
      const access_token = body.access_token ?? body.accessToken;
      await client.transactionsRefresh({ access_token });
      return NextResponse.json({ ok: true });
    }

    // Get transactions via sync API (modern, works immediately after connection)
    if (['get_transactions', 'getTransactions', 'transactions'].includes(action)) {
      const access_token = body.access_token ?? body.accessToken;
      const cutoff = body.start_date ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

      try {
        const added: unknown[] = [];
        let cursor: string | undefined = undefined;
        let hasMore = true;
        while (hasMore) {
          const r = await client.transactionsSync({ access_token, cursor });
          added.push(...r.data.added);
          hasMore = r.data.has_more;
          cursor = r.data.next_cursor;
        }
        const recent = (added as Array<{ date: string }>).filter(tx => tx.date >= cutoff);
        return NextResponse.json({ transactions: recent });
      } catch {
        // Fall back to legacy transactionsGet
        const response = await client.transactionsGet({
          access_token,
          start_date: cutoff,
          end_date: body.end_date ?? new Date().toISOString().split('T')[0],
        });
        return NextResponse.json({ transactions: response.data.transactions });
      }
    }

    // If body has a public_token field, assume exchange
    if (body.public_token ?? body.publicToken) {
      const public_token = body.public_token ?? body.publicToken;
      const response = await client.itemPublicTokenExchange({ public_token });
      const { access_token, item_id } = response.data;
      return NextResponse.json({ access_token, item_id });
    }

    // If body has an access_token field, assume get accounts
    if (body.access_token ?? body.accessToken) {
      const access_token = body.access_token ?? body.accessToken;
      const response = await client.accountsGet({ access_token });
      return NextResponse.json({ accounts: response.data.accounts });
    }

    console.error('Plaid unhandled action:', JSON.stringify(body));
    return NextResponse.json({ error: `Unhandled action: "${action}"`, body }, { status: 400 });
  } catch (error: any) {
    const plaidError = error.response?.data;
    console.error('Plaid error full:', JSON.stringify({ action, plaidError, msg: error.message }));
    return NextResponse.json(
      {
        error: plaidError?.error_message ?? error.message,
        error_code: plaidError?.error_code,
        error_type: plaidError?.error_type,
        display_message: plaidError?.display_message,
      },
      { status: 500 }
    );
  }
}
