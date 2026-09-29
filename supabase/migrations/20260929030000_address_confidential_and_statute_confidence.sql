-- ============================================================
-- 20260929030000_address_confidential_and_statute_confidence.sql
-- 1. households.address_confidential: a parent under a protective order
--    (or equivalent) can withhold their address/phone from the other
--    parent. Several statutes in coparent_disclosure_statutes carve this
--    out (e.g. Ala. Code § 30-3-167, Alaska Stat. § 25.20.110(e)(5)).
-- 2. Rename statute confidence 'verified' -> 'unreviewed'. The seed data
--    was compiled automatically and has not been reviewed by an attorney,
--    so 'verified' overstated it.
-- 3. Add the missing DC row (schema accepts 'DC'; seed omitted it). No
--    citation is asserted — it stays 'not found' until researched.
-- ============================================================

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS address_confidential boolean NOT NULL DEFAULT false;

ALTER TABLE public.coparent_disclosure_statutes
  DROP CONSTRAINT IF EXISTS coparent_disclosure_statutes_confidence_check;

UPDATE public.coparent_disclosure_statutes
  SET confidence = 'unreviewed'
  WHERE confidence = 'verified';

ALTER TABLE public.coparent_disclosure_statutes
  ADD CONSTRAINT coparent_disclosure_statutes_confidence_check
  CHECK (confidence IN ('unreviewed', 'likely', 'not found'));

INSERT INTO public.coparent_disclosure_statutes (state_code, state_name, statute_citation, summary, confidence, source_url)
VALUES ('DC', 'District of Columbia', NULL, 'Not yet researched.', 'not found', NULL)
ON CONFLICT (state_code) DO NOTHING;
