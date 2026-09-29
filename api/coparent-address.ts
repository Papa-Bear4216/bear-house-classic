// api/coparent-address.ts — household address/contact disclosure for
// co-parenting families. GET returns the caller's own household's address
// plus, when in coparent mode, the other household's address (visible to
// the other parent as a condition of most custody orders). POST sets the
// caller's own household's address.
export const config = { runtime: 'edge' };

import { requireBillingRole } from './_billingAuth.js';
import { json as j, serverError } from './_responseHelpers.js';
import { handleCorsPreflight } from './_cors.js';
import { resolveFamilyId, resolveHouseholdId } from './_familyAuth.js';
import { parseBody, CoparentAddressBodySchema } from './_schemas.js';

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

function serviceHeaders() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  return {
    apikey: process.env.SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

function hasAddress(hh: any): boolean {
  return !!(hh?.address_street && hh?.address_city && hh?.address_state && hh?.address_zip && hh?.contact_phone);
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return j({ error: 'Missing bearer token' }, 401);

  const headers = serviceHeaders();

  if (req.method === 'GET') {
    const family = await resolveFamilyId(token);
    if (!family) return j({ error: 'Invalid session' }, 401);

    const callerHouseholdId = await resolveHouseholdId(token);
    if (!callerHouseholdId) return j({ error: 'Invalid session' }, 401);

    const ids = family.mode === 'coparent'
      ? family.households.map((h) => h.householdId)
      : [callerHouseholdId];

    const hhRes = await fetch(
      `${SUPABASE_URL}/rest/v1/households?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,address_street,address_city,address_state,address_zip,contact_phone`,
      { headers }
    );
    if (!hhRes.ok) return serverError('Household lookup failed', 'coparent-address', hhRes.status);
    const hhRows: any[] = await hhRes.json();

    const mine = hhRows.find((h) => h.id === callerHouseholdId);
    const other = family.mode === 'coparent'
      ? hhRows.find((h) => h.id !== callerHouseholdId)
      : null;

    return j({
      ok: true,
      mode: family.mode,
      mine: mine ? {
        addressStreet: mine.address_street,
        addressCity: mine.address_city,
        addressState: mine.address_state,
        addressZip: mine.address_zip,
        contactPhone: mine.contact_phone,
        complete: hasAddress(mine),
      } : null,
      // Only ever return the OTHER household's address if we're actually in
      // coparent mode — never leak it otherwise, and never let the caller
      // request a household id outside their own family (ids above is
      // derived entirely from resolveFamilyId, never client input).
      other: other ? {
        addressStreet: other.address_street,
        addressCity: other.address_city,
        addressState: other.address_state,
        addressZip: other.address_zip,
        contactPhone: other.contact_phone,
        complete: hasAddress(other),
      } : null,
    });
  }

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const callerHouseholdId = await resolveHouseholdId(token);
  if (!callerHouseholdId) return j({ error: 'Invalid session' }, 401);

  const auth = await requireBillingRole(req, callerHouseholdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(CoparentAddressBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { addressStreet, addressCity, addressState, addressZip, contactPhone } = parsed.data;

  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(callerHouseholdId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      address_street: addressStreet,
      address_city: addressCity,
      address_state: addressState,
      address_zip: addressZip,
      contact_phone: contactPhone,
    }),
  });
  if (!updateRes.ok) return serverError('Failed to save address', 'coparent-address', updateRes.status);

  return j({ ok: true });
}
