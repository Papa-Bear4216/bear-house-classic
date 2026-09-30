-- ============================================================
-- 20260930113000_unique_secondary_household_link.sql
-- Enforce at most one secondary household per family to prevent
-- concurrent coparent-toggle calls from creating orphaned links.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS household_family_link_single_secondary_idx
  ON public.household_family_link (family_id)
  WHERE role_in_family = 'secondary';
