// Server-safe mirror of src/lib/appMap.ts. Kept dependency-free for edge builds;
// src/lib/appMap.test.ts asserts these generated values stay in sync.
export const APP_MAP_DIGEST = [
  'Household Brain [household; Bento card + Directory; data: household_brain; Hermes: read]',
  'Meal Planner [meal-planner; Bento card + Directory; data: familyos_meals; Hermes: read-write]',
  'Pantry & Groceries [pantry-shopping; Bento card + Directory; data: familyos_pantry, familyos_shopping; Hermes: read-write]',
  'Maintenance & Auto [maintenance; Bento card + Directory; data: familyos_home_maintenance, familyos_cars; Hermes: read-write]',
  'Family Squad & Roster [family-squad; Directory → FamilyHub; data: household_members (table); Hermes: read]',
  'Kids Corner [kids; Bento card + Directory; data: familyos_routines; Hermes: read]',
  'Reward Store [rewards; Directory → RewardStore + KidsHub; data: household_points, reward_redemptions; Hermes: read]',
  'Promises & Commitments [promises; Bento card + Directory; data: family_promises; Hermes: read-write]',
  'Custody & Co-Parent [custody; Bento card + Directory; data: familyos_custody_schedule, familyos_custody_swaps; Hermes: read]',
  'Run of Show & Timelines [run-of-show; Directory → RunOfShow + QualityTime; data: familyos_appointments, familyos_bills, quality_activities; Hermes: read]',
  'Hermes Copilot AI [hermes-chat; Floating button + Bento card + Directory; data: household_memory (table); Hermes: read-write]',
  'Finance Hub & Bills [finance; Bento card + Directory; data: familyos_bills, familyos_expenses; Hermes: read-write]',
  'Privacy Policy [legal-privacy; Directory + /privacy; data: none; Hermes: none]',
  'Terms of Service [legal-terms; Directory + /terms; data: none; Hermes: none]',
].join('; ');

export const MOUNTED_SURFACES = 'floating Hermes button on signed-in pages; Bento Hermes copilot; Directory copilot entry';
