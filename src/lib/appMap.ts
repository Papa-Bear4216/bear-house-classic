import type { BentoModuleId } from './triadFusion';

export type AppGroup = 'Home & Tasks' | 'Family & Kids' | 'Logistics & AI' | 'Legal & Policies';
export type DirectoryActionId = Extract<BentoModuleId,
  'household'|'meal-planner'|'pantry-shopping'|'maintenance'|'emotions'|'kids'|'rewards'|
  'promises'|'custody'|'quality'|'hermes-chat'|'finance'|'legal-privacy'|'legal-terms'>;

export interface AppModule {
  id: string;
  title: string;
  group: AppGroup;
  blurb: string;
  where: string;
  dataKeys: string[];
  hermesAccess: 'read'|'read-write'|'none';
  directoryActionId?: DirectoryActionId;
  directoryTag?: string;
  adultsOnly?: boolean;
}

// The Directory's "Family Squad & Roster" action intentionally opens the
// FamilyHub modal via `emotions`; Run of Show opens the combined quality modal.
// These action ids preserve the live expandModule behavior.
export const APP_MAP: AppModule[] = [
  { id:'household', title:'Household Brain', group:'Home & Tasks', blurb:'Rules, inventory, procedures the family taught the house', where:'Bento card + Directory', dataKeys:['household_brain'], hermesAccess:'read', directoryActionId:'household', directoryTag:'Chores' },
  { id:'meal-planner', title:'Meal Planner', group:'Home & Tasks', blurb:'Weekly dinners, recipes, cook assignments', where:'Bento card + Directory', dataKeys:['familyos_meals'], hermesAccess:'read-write', directoryActionId:'meal-planner', directoryTag:'Dinners' },
  { id:'pantry-shopping', title:'Pantry & Groceries', group:'Home & Tasks', blurb:'Pantry stock + shopping list', where:'Bento card + Directory', dataKeys:['familyos_pantry','familyos_shopping'], hermesAccess:'read-write', directoryActionId:'pantry-shopping', directoryTag:'Lists' },
  { id:'maintenance', title:'Maintenance & Auto', group:'Home & Tasks', blurb:'Home upkeep and car maintenance logs', where:'Bento card + Directory', dataKeys:['familyos_home_maintenance','familyos_cars'], hermesAccess:'read-write', directoryActionId:'maintenance', directoryTag:'Upkeep', adultsOnly:true },
  { id:'family-squad', title:'Family Squad & Roster', group:'Family & Kids', blurb:'Household roster, connections and family messages', where:'Directory → FamilyHub', dataKeys:['household_members (table)'], hermesAccess:'read', directoryActionId:'emotions', directoryTag:'Members' },
  { id:'kids', title:'Kids Corner', group:'Family & Kids', blurb:'Kids World, Monster Den and routines', where:'Bento card + Directory', dataKeys:['familyos_routines'], hermesAccess:'read', directoryActionId:'kids', directoryTag:'Active' },
  { id:'rewards', title:'Reward Store', group:'Family & Kids', blurb:'Points and redemptions', where:'Directory → RewardStore + KidsHub', dataKeys:['household_points','reward_redemptions'], hermesAccess:'read', directoryActionId:'rewards', directoryTag:'Redeem' },
  { id:'promises', title:'Promises & Commitments', group:'Family & Kids', blurb:'Promise ledger (append-only)', where:'Bento card + Directory', dataKeys:['family_promises'], hermesAccess:'read-write', directoryActionId:'promises', directoryTag:'Trust' },
  { id:'custody', title:'Custody & Co-Parent', group:'Logistics & AI', blurb:'Custody schedule, swaps and handoffs — this household’s view only', where:'Bento card + Directory', dataKeys:['familyos_custody_schedule','familyos_custody_swaps'], hermesAccess:'read', directoryActionId:'custody', directoryTag:'Handoffs', adultsOnly:true },
  { id:'run-of-show', title:'Run of Show & Timelines', group:'Logistics & AI', blurb:'Today’s timeline, appointments, bills and quality activities', where:'Directory → RunOfShow + QualityTime', dataKeys:['familyos_appointments','familyos_bills','quality_activities'], hermesAccess:'read', directoryActionId:'quality', directoryTag:'Daily' },
  { id:'hermes-chat', title:'Hermes Copilot AI', group:'Logistics & AI', blurb:'Floating assistant and Bento copilot', where:'Floating button + Bento card + Directory', dataKeys:['household_memory (table)'], hermesAccess:'read-write', directoryActionId:'hermes-chat', directoryTag:'Assistant' },
  { id:'finance', title:'Finance Hub & Bills', group:'Logistics & AI', blurb:'Bills, expenses and bank sync — adults only in Hermes context', where:'Bento card + Directory', dataKeys:['familyos_bills','familyos_expenses'], hermesAccess:'read-write', directoryActionId:'finance', directoryTag:'Expenses', adultsOnly:true },
  { id:'legal-privacy', title:'Privacy Policy', group:'Legal & Policies', blurb:'Privacy policy page', where:'Directory + /privacy', dataKeys:[], hermesAccess:'none', directoryActionId:'legal-privacy', directoryTag:'Data' },
  { id:'legal-terms', title:'Terms of Service', group:'Legal & Policies', blurb:'Terms of service page', where:'Directory + /terms', dataKeys:[], hermesAccess:'none', directoryActionId:'legal-terms', directoryTag:'Legal' },
];

/** All module identifiers in BentoModuleId, including non-Directory mounts. */
export const BENTO_MODULE_CATALOG: Record<BentoModuleId, { title: string; where: string }> = {
  dashboard: { title:'Dashboard', where:'Top navigation' },
  household: { title:'Household Brain', where:'Bento card + Directory' },
  kids: { title:'Kids Corner', where:'Bento card + Directory' },
  family: { title:'Family', where:'Top navigation' },
  health: { title:'Health', where:'Top navigation' },
  finance: { title:'Finance Hub & Bills', where:'Bento card + Directory' },
  rewards: { title:'Reward Store', where:'Directory' },
  quality: { title:'Quality Time / Run of Show', where:'Directory → combined modal' },
  promises: { title:'Promises & Commitments', where:'Bento card + Directory' },
  emotions: { title:'Family Hub & Roster', where:'Directory' },
  custody: { title:'Custody & Co-Parent', where:'Bento card + Directory' },
  'hermes-chat': { title:'Hermes Copilot', where:'Floating button + Bento card + Directory' },
  'run-of-show': { title:'Run of Show alias', where:'Combined quality modal alias' },
  'pantry-shopping': { title:'Pantry & Groceries', where:'Bento card + Directory' },
  'meal-planner': { title:'Meal Planner', where:'Bento card + Directory' },
  maintenance: { title:'Maintenance & Auto', where:'Bento card + Directory' },
  'legal-privacy': { title:'Privacy Policy', where:'Directory + /privacy' },
  'legal-terms': { title:'Terms of Service', where:'Directory + /terms' },
  'brain-battery': { title:'Brain Battery', where:'Header opens modal directly' },
  'system-health': { title:'System Health', where:'Dashboard component (currently not mounted)' },
};

export const APP_MAP_DIGEST = APP_MAP.map((module) =>
  `${module.title} [${module.id}; ${module.where}; data: ${module.dataKeys.join(', ') || 'none'}; Hermes: ${module.hermesAccess}]`
).join('; ');
export const MOUNTED_SURFACES = 'floating Hermes button on signed-in pages; Bento Hermes copilot; Directory copilot entry';
