-- ============================================================
-- 20260929010000_add_household_address_and_statute_reference.sql
-- Co-parenting: each household discloses its address + contact phone
-- to the other parent once co-parenting is enabled, plus a reference
-- table of the state statute requiring this, shown at entry time.
-- ============================================================

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

-- Reference table: one row per US state/territory, citing the statute
-- requiring a parent under a custody order to disclose address/contact
-- info to the other parent (or notify of a change). Populated by a
-- separate data-only migration after legal research, not here — this
-- migration only creates the table shape.
CREATE TABLE IF NOT EXISTS public.coparent_disclosure_statutes (
  state_code text PRIMARY KEY,           -- USPS 2-letter code, e.g. 'CA'
  state_name text NOT NULL,
  statute_citation text,                 -- e.g. 'Cal. Fam. Code § 3025.5' — null if not found
  summary text,                          -- one-sentence plain description
  confidence text NOT NULL DEFAULT 'not found'
    CHECK (confidence IN ('verified', 'likely', 'not found')),
  source_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coparent_disclosure_statutes ENABLE ROW LEVEL SECURITY;

-- Reference data — readable by any authenticated user, no household
-- scoping needed since this isn't personal data.
CREATE POLICY "authenticated users read disclosure statutes" ON public.coparent_disclosure_statutes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service_role manages disclosure statutes" ON public.coparent_disclosure_statutes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
