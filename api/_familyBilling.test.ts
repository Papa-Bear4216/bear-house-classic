import { describe, it, expect, beforeEach, vi } from 'vitest';
import { familySubscriptionStatus, familyStripeCustomerId } from './_familyBilling';
import { resolveFamilyBilling } from './_familyBilling';

// _familyBilling's exported functions are pure-ish helpers on top of
// resolveFamilyId (which itself hits Supabase). For the pure functions we
// test them directly with constructed inputs. For resolveFamilyBilling we
// mock fetch at the boundary the way the other API tests do.
//
// Pattern reference: api/_billingAuth.test.ts, api/_db.test.ts — each
// test wires the exact fetch sequence the function is expected to make.

function mockFetchSequence(responses: Array<{ ok: boolean; json?: unknown }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      json: async () => r.json ?? [],
      text: async () => JSON.stringify(r.json ?? {}),
      status: r.ok ? 200 : 500,
    } as Response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
});

describe('familySubscriptionStatus', () => {
  it('returns "none" for null input', () => {
    expect(familySubscriptionStatus(null)).toBe('none');
  });

  it('returns the family-level status when present', () => {
    const b = {
      familyId: 'f1',
      mode: 'coparent' as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: 'active',
      primaryHouseholdId: 'h1',
      primaryHouseholdStripeCustomerId: null,
      primaryHouseholdStripeSubscriptionId: null,
      primaryHouseholdSubscriptionStatus: 'trialing',
    };
    expect(familySubscriptionStatus(b)).toBe('active');
  });

  it('falls back to the primary household status when family-level is null', () => {
    const b = {
      familyId: 'f1',
      mode: 'coparent' as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      primaryHouseholdId: 'h1',
      primaryHouseholdStripeCustomerId: null,
      primaryHouseholdStripeSubscriptionId: null,
      primaryHouseholdSubscriptionStatus: 'active',
    };
    expect(familySubscriptionStatus(b)).toBe('active');
  });

  it('returns "none" when both family and household status are null', () => {
    const b = {
      familyId: 'f1',
      mode: 'single' as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      primaryHouseholdId: 'h1',
      primaryHouseholdStripeCustomerId: null,
      primaryHouseholdStripeSubscriptionId: null,
      primaryHouseholdSubscriptionStatus: null,
    };
    expect(familySubscriptionStatus(b)).toBe('none');
  });
});

describe('familyStripeCustomerId', () => {
  it('returns null for null input', () => {
    expect(familyStripeCustomerId(null)).toBeNull();
  });

  it('returns the family-level customer id when present', () => {
    const b = {
      familyId: 'f1',
      mode: 'coparent' as const,
      stripeCustomerId: 'cus_family',
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      primaryHouseholdId: 'h1',
      primaryHouseholdStripeCustomerId: 'cus_household',
      primaryHouseholdStripeSubscriptionId: null,
      primaryHouseholdSubscriptionStatus: null,
    };
    expect(familyStripeCustomerId(b)).toBe('cus_family');
  });

  it('falls back to the primary household customer id', () => {
    const b = {
      familyId: 'f1',
      mode: 'single' as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      primaryHouseholdId: 'h1',
      primaryHouseholdStripeCustomerId: 'cus_household',
      primaryHouseholdStripeSubscriptionId: null,
      primaryHouseholdSubscriptionStatus: null,
    };
    expect(familyStripeCustomerId(b)).toBe('cus_household');
  });

  it('returns null when both are null', () => {
    const b = {
      familyId: 'f1',
      mode: 'single' as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      primaryHouseholdId: 'h1',
      primaryHouseholdStripeCustomerId: null,
      primaryHouseholdStripeSubscriptionId: null,
      primaryHouseholdSubscriptionStatus: null,
    };
    expect(familyStripeCustomerId(b)).toBeNull();
  });
});

describe('resolveFamilyBilling', () => {
  it('returns null when resolveFamilyId returns null (invalid token)', async () => {
    mockFetchSequence([{ ok: false }]); // GET /auth/v1/user fails inside resolveFamilyId
    const result = await resolveFamilyBilling('bad-token');
    expect(result).toBeNull();
  });

  it('returns null when the user has no household membership', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } }, // GET /auth/v1/user
      { ok: true, json: [] }, // household_members: none
    ]);
    const result = await resolveFamilyBilling('valid-token');
    expect(result).toBeNull();
  });

  it('returns null when resolveFamilyId cannot find a primary household via the link table', async () => {
    // resolveFamilyId — user has a household_members row but no link
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } }, // GET /auth/v1/user
      { ok: true, json: [{ household_id: 'h-secondary', role: 'admin' }] }, // household_members
      { ok: true, json: [] }, // household_family_link — no link for this household
    ]);
    const result = await resolveFamilyBilling('valid-token');
    expect(result).toBeNull();
  });

  it('returns null when the primary household lookup via link table fails (500)', async () => {
    // 4 fetches from resolveFamilyId + 1 failing lookup = 5
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } },
      { ok: true, json: [{ household_id: 'h-primary', role: 'superadmin' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ mode: 'coparent' }] },
      { ok: false }, // household_family_link lookup for primary — fails (step 5)
    ]);
    const result = await resolveFamilyBilling('valid-token');
    expect(result).toBeNull();
  });

  it('returns null when the households lookup for the primary fails', async () => {
    // 4 fetches from resolveFamilyId + 1 OK (link) + 1 failing (households) = 6
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } },
      { ok: true, json: [{ household_id: 'h-primary', role: 'superadmin' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ mode: 'coparent' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: false }, // GET /rest/v1/households?id=eq.... (step 6)
    ]);
    const result = await resolveFamilyBilling('valid-token');
    expect(result).toBeNull();
  });

  it('returns null when the families lookup fails', async () => {
    // 4 fetches from resolveFamilyId + 1 OK (link) + 1 OK (households) + 1 failing (families) = 7
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } },
      { ok: true, json: [{ household_id: 'h-primary', role: 'superadmin' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ mode: 'coparent' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ id: 'h-primary', stripe_customer_id: 'cus-hh', stripe_subscription_id: 'sub-hh', subscription_status: 'active' }] },
      { ok: false }, // GET /rest/v1/families?id=eq.... (step 7)
    ]);
    const result = await resolveFamilyBilling('valid-token');
    expect(result).toBeNull();
  });

  it('returns a FamilyBilling for a single-mode family with household billing', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } },
      { ok: true, json: [{ household_id: 'h-primary', role: 'superadmin' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ mode: 'single' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ id: 'h-primary', stripe_customer_id: 'cus-hh', stripe_subscription_id: 'sub-hh', subscription_status: 'active' }] },
      { ok: true, json: [{ id: 'f1', stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null }] },
    ]);
    const b = await resolveFamilyBilling('valid-token');
    expect(b).not.toBeNull();
    expect(b!.familyId).toBe('f1');
    expect(b!.mode).toBe('single');
    expect(b!.stripeCustomerId).toBeNull();
    expect(b!.primaryHouseholdStripeCustomerId).toBe('cus-hh');
    expect(familyStripeCustomerId(b!)).toBe('cus-hh');
    expect(familySubscriptionStatus(b!)).toBe('active');
  });

  it('returns a FamilyBilling for a coparent family, querying the link table via service key for the primary', async () => {
    // User is admin in h-secondary; the primary is h-primary, found via the
    // link table queried with the service key inside resolveFamilyBilling.
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } },
      { ok: true, json: [{ household_id: 'h-secondary', role: 'admin' }] },
      { ok: true, json: [{ household_id: 'h-secondary', family_id: 'f1', role_in_family: 'secondary' }] },
      { ok: true, json: [{ mode: 'coparent' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ id: 'h-primary', stripe_customer_id: 'cus-family', stripe_subscription_id: 'sub-family', subscription_status: 'active' }] },
      { ok: true, json: [{ id: 'f1', stripe_customer_id: 'cus-family-2', stripe_subscription_id: 'sub-family-2', subscription_status: 'trialing' }] },
    ]);
    const b = await resolveFamilyBilling('valid-token');
    expect(b).not.toBeNull();
    expect(b!.familyId).toBe('f1');
    expect(b!.mode).toBe('coparent');
    // family-level fields win over household-level
    expect(b!.stripeCustomerId).toBe('cus-family-2');
    expect(b!.stripeSubscriptionId).toBe('sub-family-2');
    expect(b!.subscriptionStatus).toBe('trialing');
    expect(b!.primaryHouseholdId).toBe('h-primary');
    expect(familyStripeCustomerId(b!)).toBe('cus-family-2');
    expect(familySubscriptionStatus(b!)).toBe('trialing');
  });

  it('returns the household Stripe fields when the family-level columns are null (pre-migration family)', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } },
      { ok: true, json: [{ household_id: 'h-primary', role: 'superadmin' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ mode: 'single' }] },
      { ok: true, json: [{ household_id: 'h-primary', family_id: 'f1', role_in_family: 'primary' }] },
      { ok: true, json: [{ id: 'h-primary', stripe_customer_id: 'cus-hh', stripe_subscription_id: 'sub-hh', subscription_status: 'active' }] },
      { ok: true, json: [{ id: 'f1', stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null }] },
    ]);
    const b = await resolveFamilyBilling('valid-token');
    expect(b).not.toBeNull();
    expect(b!.stripeCustomerId).toBeNull();
    expect(b!.primaryHouseholdStripeCustomerId).toBe('cus-hh');
    expect(familyStripeCustomerId(b!)).toBe('cus-hh');
    expect(familySubscriptionStatus(b!)).toBe('active');
  });
});
