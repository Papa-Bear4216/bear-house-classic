// api/_familyBilling.ts
// Family-level Stripe billing helpers.
//
// In coparent mode a family owns the Stripe customer, not any single
// household — one subscription covers both homes. In single mode the
// household-level billing (billing-checkout, billing-seats, billing-portal)
// is still the source of truth.
//
// Trust boundary: same as api/_db.ts — service_role reads, household/family
// scoping enforced in application code, never trust a client-supplied id
// without validating it belongs to the caller.

import { resolveFamilyId } from './_familyAuth.js';

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

function headers(key: string) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export type FamilyBilling = {
  familyId: string;
  mode: 'single' | 'coparent';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  primaryHouseholdId: string;
  // household-scoped fields carried on the primary household for single-mode
  // families that were created before the family billing columns existed.
  primaryHouseholdStripeCustomerId: string | null;
  primaryHouseholdStripeSubscriptionId: string | null;
  primaryHouseholdSubscriptionStatus: string | null;
};

export async function resolveFamilyBilling(
  accessToken: string,
  preferredHouseholdId?: string,
): Promise<FamilyBilling | null> {
  const family = await resolveFamilyId(accessToken, preferredHouseholdId);
  if (!family) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

  // Primary household: query the link table directly by family_id with the
  // service key so a secondary-only member (who isn't in family.households at
  // all) can still find the primary household's Stripe fields.
  const linkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${encodeURIComponent(family.familyId)}&role_in_family=eq.primary&select=household_id`,
    { headers: headers(serviceKey) },
  );
  if (!linkRes.ok) return null;
  const linkRows: any[] = await linkRes.json();
  const primaryHouseholdId = linkRows[0]?.household_id;
  if (!primaryHouseholdId) return null;

  const hhRes = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(primaryHouseholdId)}&select=stripe_customer_id,stripe_subscription_id,subscription_status`,
    { headers: headers(serviceKey) },
  );
  if (!hhRes.ok) return null;
  const hhRows: any[] = await hhRes.json();
  const hh = hhRows[0] ?? {};

  // Family-level fields (may be NULL for families created before the family billing migration).
  const famRes = await fetch(
    `${SUPABASE_URL}/rest/v1/families?id=eq.${encodeURIComponent(family.familyId)}&select=stripe_customer_id,stripe_subscription_id,subscription_status`,
    { headers: headers(serviceKey) },
  );
  if (!famRes.ok) return null;
  const famRows: any[] = await famRes.json();
  const fam = famRows[0] ?? {};

  return {
    familyId: family.familyId,
    mode: family.mode,
    stripeCustomerId: fam.stripe_customer_id ?? null,
    stripeSubscriptionId: fam.stripe_subscription_id ?? null,
    subscriptionStatus: fam.subscription_status ?? null,
    primaryHouseholdId: primaryHouseholdId,
    primaryHouseholdStripeCustomerId: hh.stripe_customer_id ?? null,
    primaryHouseholdStripeSubscriptionId: hh.stripe_subscription_id ?? null,
    primaryHouseholdSubscriptionStatus: hh.subscription_status ?? null,
  };
}

export function familySubscriptionStatus(b: FamilyBilling | null): string {
  // Family-level status wins when present; fall back to the primary household's
  // status for pre-migration single-mode families whose family row still has NULLs.
  if (!b) return 'none';
  if (b.subscriptionStatus) return b.subscriptionStatus;
  if (b.primaryHouseholdSubscriptionStatus) return b.primaryHouseholdSubscriptionStatus;
  return 'none';
}

export function familyStripeCustomerId(b: FamilyBilling | null): string | null {
  // Family-level customer wins; fall back to primary household's customer.
  if (!b) return null;
  if (b.stripeCustomerId) return b.stripeCustomerId;
  return b.primaryHouseholdStripeCustomerId;
}
