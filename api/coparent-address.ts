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

// Shown with every statute citation. The reference table is compiled
// automatically, not reviewed by an attorney, and Hermes/FamilyOS never gives
// legal advice.
export const STATUTE_DISCLAIMER =
  'Reference information only — compiled automatically and not reviewed by an attorney. ' +
  'This is not legal advice and may be incomplete or out of date. ' +
  'Your custody order controls; confirm with it or a lawyer.';

const ADDRESS_ROLES = new Set(['superadmin', 'admin']);

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

    // Address/phone are parent-only; child and pet accounts never see them.
    const callerRole = family.households.find((h) => h.householdId === callerHouseholdId)?.memberRole;
    if (!callerRole || !ADDRESS_ROLES.has(callerRole)) {
      return j({ error: 'Only superadmin/admin can view household addresses' }, 403);
    }

    const ids = family.mode === 'coparent'
      ? family.households.map((h) => h.householdId)
      : [callerHouseholdId];

    const hhRes = await fetch(
      `${SUPABASE_URL}/rest/v1/households?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,address_street,address_city,address_state,address_zip,contact_phone,address_confidential`,
      { headers }
    );
    if (!hhRes.ok) return serverError('Household lookup failed', 'coparent-address', hhRes.status);
    const hhRows: any[] = await hhRes.json();

    const mine = hhRows.find((h) => h.id === callerHouseholdId);
    const other = family.mode === 'coparent'
      ? hhRows.find((h) => h.id !== callerHouseholdId)
      : null;

    // Statute reference for the caller's own state, if they've entered one.
    // Best-effort: a lookup failure must not break the address read.
    let statute: unknown = null;
    if (mine?.address_state) {
      try {
        const stRes = await fetch(
          `${SUPABASE_URL}/rest/v1/coparent_disclosure_statutes?state_code=eq.${encodeURIComponent(mine.address_state)}&select=state_code,state_name,statute_citation,summary,confidence,source_url`,
          { headers }
        );
        if (stRes.ok) {
          const [row] = await stRes.json() as any[];
          if (row) statute = {
            stateCode: row.state_code,
            stateName: row.state_name,
            citation: row.statute_citation,
            summary: row.summary,
            confidence: row.confidence,
            sourceUrl: row.source_url,
          };
        }
      } catch { /* best-effort */ }
    }

    return j({
      ok: true,
      mode: family.mode,
      mine: mine ? {
        addressStreet: mine.address_street,
        addressCity: mine.address_city,
        addressState: mine.address_state,
        addressZip: mine.address_zip,
        contactPhone: mine.contact_phone,
        confidential: !!mine.address_confidential,
        complete: !!mine.address_confidential || hasAddress(mine),
      } : null,
      // Only ever return the OTHER household's address if we're actually in
      // coparent mode — never leak it otherwise, and never let the caller
      // request a household id outside their own family (ids above is
      // derived entirely from resolveFamilyId, never client input).
      // A household that marked its address confidential returns no address
      // fields at all — not even blanks with keys.
      other: !other ? null : other.address_confidential
        ? { confidential: true, complete: false }
        : {
            addressStreet: other.address_street,
            addressCity: other.address_city,
            addressState: other.address_state,
            addressZip: other.address_zip,
            contactPhone: other.contact_phone,
            confidential: false,
            complete: hasAddress(other),
          },
      statute,
      statuteDisclaimer: STATUTE_DISCLAIMER,
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
  const { addressStreet, addressCity, addressState, addressZip, contactPhone, confidential } = parsed.data;

  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(callerHouseholdId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      address_street: addressStreet ?? null,
      address_city: addressCity ?? null,
      address_state: addressState ?? null,
      address_zip: addressZip ?? null,
      contact_phone: contactPhone ?? null,
      address_confidential: !!confidential,
    }),
  });
  if (!updateRes.ok) return serverError('Failed to save address', 'coparent-address', updateRes.status);

  return j({ ok: true });
}
