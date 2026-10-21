import { dbGet, dbGetHouseholdMembersByHouseholdId, dbGetHouseholdMemory } from './_db.js';
import { HERMES_SYSTEM_PROMPT } from './_aiModels.js';
import { HERMES_TOOLS, type ToolDefinition } from './_hermesTools.js';
import { isTriadHousehold } from './_triadAccess.js';
import { APP_MAP_DIGEST, MOUNTED_SURFACES } from './_appMap.js';
import { HERMES_SNAPSHOT_KEYS } from './_familyKeys.js';

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

/** Normalize only the generated surface statement for parity assertions. */
export function normalizeSurfaceLine(system: string): string {
  return system.replace(/^You are speaking through: [^\n]+$/m, 'You are speaking through: <surface>.');
}

export function formatHermesSnapshot(data: {
  tasks?: unknown;
  shopping?: unknown;
  appointments?: unknown;
  promises?: unknown;
}, now = new Date()): string {
  const rows = (value: unknown): any[] => Array.isArray(value) ? value : [];
  const today = now.toISOString().slice(0, 10);
  const openTasks = rows(data.tasks).filter((task) => !task.completed);
  const high = openTasks.filter((task) => task.priority === 'High').slice(0, 8);
  const medium = openTasks.filter((task) => task.priority === 'Medium').slice(0, 5);
  const low = openTasks.filter((task) => task.priority === 'Low');
  const shopping = rows(data.shopping).filter((item) => !item.completed);
  const appointments = rows(data.appointments)
    .filter((item) => !item.date || item.date >= today)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .slice(0, 6);
  const promises = rows(data.promises).filter((promise) => !promise.completed);
  return [
    `OPEN TASKS (${openTasks.length} total, showing ${high.length + medium.length} by priority; ${low.length} Low not shown):`,
    `HIGH: ${high.map((task) => `[${String(task.id || '').slice(-4)}] "${task.text || ''}" → ${task.person || ''}`).join(' | ') || 'none'}`,
    `MEDIUM: ${medium.map((task) => `[${String(task.id || '').slice(-4)}] "${task.text || ''}" → ${task.person || ''}`).join(' | ') || 'none'}`,
    `SHOPPING (${shopping.length} items, showing first ${Math.min(shopping.length, 10)}): ${shopping.slice(0, 10).map((item) => `${item.name || ''} ×${item.quantity || 1}`).join(', ') || 'empty'}`,
    `APPOINTMENTS (${appointments.length} upcoming shown): ${appointments.map((item) => `${item.person || ''}: ${item.title || item.type || ''}`).join(' | ') || 'none'}`,
    `OPEN PROMISES (${promises.length} total, showing ${Math.min(promises.length, 6)}): ${promises.slice(0, 6).map((promise) => `${promise.person || ''}: "${promise.text || ''}"`).join(' | ') || 'none'}`,
  ].join('\n');
}

async function loadServerSnapshot(householdId: string): Promise<string> {
  const [tasks, shopping, appointments, promises] = await Promise.all([
    dbGet(HERMES_SNAPSHOT_KEYS.tasks, householdId),
    dbGet(HERMES_SNAPSHOT_KEYS.shopping, householdId),
    dbGet(HERMES_SNAPSHOT_KEYS.appointments, householdId),
    dbGet(HERMES_SNAPSHOT_KEYS.promises, householdId),
  ]);
  return formatHermesSnapshot({ tasks, shopping, appointments, promises });
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

  const [members, memories, serverSnapshot] = await Promise.all([
    dbGetHouseholdMembersByHouseholdId(input.householdId).catch(() => []),
    isAdmin ? dbGetHouseholdMemory(input.householdId).catch(() => []) : Promise.resolve([]),
    input.clientSnapshot ? Promise.resolve('') : loadServerSnapshot(input.householdId).catch(() => ''),
  ]);
  const memberBlock = members.length
    ? `HOUSEHOLD MEMBERS (name and role): ${members.map((member) => `${member.name} (${member.role})`).join(', ')}`
    : 'HOUSEHOLD MEMBERS: none listed';
  const safeSnapshot = isChild
    ? (input.clientSnapshot || '').replace(/^.*(?:BILLS UNPAID|FINANCE):.*$/gim, 'FINANCE: not available to this account')
    : input.clientSnapshot || serverSnapshot;
  const memoryBlock = memories.length
    ? `═══ MY MEMORY (this household only) ═══\n${memories.map((memory) => memory.text).join('\n')}`
    : '═══ MY MEMORY ═══\nNo learned household memories are stored yet.';
  const selfBlock = [
    '═══ ABOUT YOU & THIS APP ═══',
    'You are Hermes inside HotMessExpress (Bear House), a family OS.',
    `Hermes is available through: ${MOUNTED_SURFACES}.`,
    `App directory: ${APP_MAP_DIGEST}.`,
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
      safeSnapshot,
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
