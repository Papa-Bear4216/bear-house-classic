-- ============================================================
-- 20260929000000_add_member_transition.sql
-- Co-parenting: transition an existing member into a newly-created
-- secondary household on their next authenticated request.
-- ============================================================

-- Marks a member as pending transition to another household. Nullable —
-- every existing row stays untouched (no transition pending) unless
-- coparent-toggle explicitly sets it.
ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS pending_transition_household_id uuid REFERENCES public.households(id) ON DELETE SET NULL;

-- The role the member should hold once the transition applies (always
-- 'superadmin' for the co-parenting flow today, but stored explicitly
-- rather than hardcoded so the mechanism isn't co-parenting-specific).
ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS pending_transition_role text
    CHECK (pending_transition_role IN ('superadmin', 'admin', 'child', 'pet'));

CREATE INDEX IF NOT EXISTS household_members_pending_transition_idx
  ON public.household_members(pending_transition_household_id)
  WHERE pending_transition_household_id IS NOT NULL;
