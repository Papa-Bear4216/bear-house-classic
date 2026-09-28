-- ============================================================
-- 20260928120000_add_coparenting_fields.sql
-- Phase 1: co-parenting toggle, household assignment, merge consent
-- ============================================================

-- NOTE: merge_consent_household_id on families is a broken design
-- (single column can only track one household's consent, not both).
-- Kept for backward compat with any code that may have read it,
-- but all new code must use coparent_merge_consent below.

-- Track which household has consented to merge (LEGACY — see consent table).
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS merge_consent_household_id uuid;

-- Track merge request initiator (set when a merge is first requested, cleared on cancel or execute).
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS merge_initiated_by uuid;

-- Track when merge was initiated (for display / timeout-free pending UI).
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS merge_initiated_at timestamptz;

-- ============================================================
-- Dual-consent merge tracking: one row per household that has
-- typed the consent phrase. Merge is eligible when BOTH primary
-- and secondary households have a row in this table.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coparent_merge_consent (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  consented_at timestamptz not null default now(),
  unique (family_id, household_id)
);

ALTER TABLE public.coparent_merge_consent ENABLE ROW LEVEL SECURITY;

-- Service role: full access (api/ uses service_role).
CREATE POLICY "service_role manages merge consent" ON public.coparent_merge_consent
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger function: keep updated_at fresh on families.
CREATE OR REPLACE FUNCTION public.update_families_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_families_updated_at ON public.families;
CREATE TRIGGER update_families_updated_at
  BEFORE UPDATE ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.update_families_updated_at();

-- Service-role: full access to the new columns (api/ uses service_role).
CREATE POLICY "service_role manages coparenting fields" ON public.families
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
