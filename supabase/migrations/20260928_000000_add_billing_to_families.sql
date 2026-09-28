-- ============================================================
-- 20260928_000000_add_billing_to_families.sql
-- Add family-level Stripe billing fields so co-parent families
-- bill once for all households instead of each household separately.
-- ============================================================

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text;

-- Backfill: copy primary household's billing fields onto each family.
-- Families whose primary household has no Stripe customer stay NULL —
-- that's correct: they have no subscription yet.
DO $$
DECLARE
  fam record;
  prim_hh_id uuid;
  prim_hh record;
BEGIN
  FOR fam IN SELECT id FROM public.families
  LOOP
    SELECT h.household_id INTO prim_hh_id
    FROM public.household_family_link h
    WHERE h.family_id = fam.id
      AND h.role_in_family = 'primary'
    LIMIT 1;

    IF prim_hh_id IS NOT NULL THEN
      SELECT * INTO prim_hh
      FROM public.households
      WHERE id = prim_hh_id
      LIMIT 1;

      IF prim_hh.stripe_customer_id IS NOT NULL THEN
        UPDATE public.families
        SET stripe_customer_id   = prim_hh.stripe_customer_id,
            stripe_subscription_id = prim_hh.stripe_subscription_id,
            subscription_status    = prim_hh.subscription_status
        WHERE id = fam.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
