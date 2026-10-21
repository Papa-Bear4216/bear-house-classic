import { dbGetHouseholdMembersByHouseholdId, dbGetHouseholdMemory } from './_db.js';
import { HERMES_SYSTEM_PROMPT } from './_aiModels.js';
import { HERMES_TOOLS, type ToolDefinition } from './_hermesTools.js';
import { isTriadHousehold } from './_triadAccess.js';

export interface HermesContextInput {
  householdId: string;
  callerRole: string;
  canControlDevices: boolean;
  surface: string;
  currentModule?: string;
  clientSnapshot?: string;
  sealedPersona?: string;
  enableTools: boolean;
  neutralMode: boolean;
  requestedRole?: string;
  modelId: string;
  toolsDegraded?: boolean;
}

export interface HermesContext {
  system: string;
  tools: ToolDefinition[];
  memoryCount: number;
}

export function buildCapabilityManifest(tools: ToolDefinition[]): string {
  if (!tools.length) {
    return '═══ YOUR CAPABILITIES ═══\nYou have no action tools on this surface. You may answer using only the context above and must never claim to have performed an action.';
  }
  return [
    '═══ YOUR CAPABILITIES (role-scoped; this is the complete executable set) ═══',
    ...tools.map((tool) => `- ${tool.name}: ${tool.description}`),
    'You cannot browse the internet, see another household\'s data, or read the private kid journal.',
  ].join('\n');
}

export async function buildHermesContext(input: HermesContextInput): Promise<HermesContext> {
  // The route validates this sealed surface and its memberId before calling us.
  // It intentionally performs no household reads and returns no tools.
  if (input.surface === 'kids-monster') {
    return { system: input.sealedPersona || '', tools: [], memoryCount: 0 };
  }

  const isChild = input.callerRole === 'child' || input.requestedRole === 'child';
  const isAdmin = (input.callerRole === 'admin' || input.callerRole === 'superadmin') && !isChild;
  const tools = input.enableTools
    ? HERMES_TOOLS.filter((tool) => {
      if (tool.name === 'queryTriad') return isTriadHousehold(input.householdId) && isAdmin;
      if (tool.name === 'controlDevice' || tool.name === 'discoverSmartHome') return input.canControlDevices && !isChild;
      return isAdmin || NON_ADMIN_ALLOWED_TOOLS.has(tool.name);
    })
    : [];

  const [members, memories] = await Promise.all([
    dbGetHouseholdMembersByHouseholdId(input.householdId).catch(() => []),
    dbGetHouseholdMemory(input.householdId).catch(() => []),
  ]);
  const memberBlock = members.length
    ? `HOUSEHOLD MEMBERS (name and role): ${members.map((member) => `${member.name} (${member.role})`).join(', ')}`
    : 'HOUSEHOLD MEMBERS: none listed';
  const memoryBlock = memories.length
    ? `═══ MY MEMORY (this household only) ═══\n${memories.map((memory) => memory.text).join('\n')}`
    : '═══ MY MEMORY ═══\nNo learned household memories are stored yet.';
  const selfBlock = [
    '═══ ABOUT YOU & THIS APP ═══',
    'You are Hermes inside HotMessExpress (Bear House), a family OS.',
    `You are speaking through: ${input.surface}.`,
    input.currentModule ? `The user is currently looking at: ${input.currentModule}.` : '',
    `Model this turn: ${input.modelId}. Tools: ${input.toolsDegraded ? 'degraded; text only' : tools.length ? 'available' : 'not enabled on this request'}.`,
    'If asked what you can do, answer only from the role-scoped capability list below.',
  ].filter(Boolean).join('\n');
  const neutralHint = input.neutralMode && !isChild
    ? '[Hermes Neutral Co-Parent Mode Active]\nUse brief, informative, friendly, firm language focused on child logistics. Remove blame and do not take sides.'
    : '';
  const childHint = isChild
    ? '[Child Safety Persona Active]\nKeep answers age-appropriate and supportive. Do not discuss household finances, billing, or parental legal disagreements. If the child describes immediate danger, encourage contacting a trusted adult or crisis support.'
    : '';

  return {
    system: [
      HERMES_SYSTEM_PROMPT,
      selfBlock,
      memberBlock,
      input.clientSnapshot || '',
      memoryBlock,
      buildCapabilityManifest(tools),
      neutralHint,
      childHint,
    ].filter(Boolean).join('\n\n'),
    tools,
    memoryCount: memories.length,
  };
}

const NON_ADMIN_ALLOWED_TOOLS = new Set([
  'addTask', 'completeTask', 'uncompleteTask', 'deleteTask',
  'addShopping', 'completeShoppingItem', 'addAppointment', 'addPromise',
  'completePromise', 'logEmotion', 'genericAction', 'setMealPlan', 'markMealCooked',
]);
