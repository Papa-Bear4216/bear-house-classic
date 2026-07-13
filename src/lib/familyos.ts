// Family OS shared utilities, constants, and storage helpers

// ── Users & Auth ──────────────────────────────────────────────────────────────
export const USERS = [
  { id: 'daddy', name: 'Daddy', email: 'michael711hebert@gmail.com', role: 'superadmin' as const, color: 'indigo' },
  { id: 'mommy', name: 'Mommy', email: 'hpfanatic009@gmail.com', role: 'admin' as const, color: 'pink' },
  { id: 'abriana', name: 'Abriana', email: 'littlebear8998@gmail.com', role: 'child' as const, color: 'purple' },
  { id: 'julia', name: 'Julia', email: 'jchebert2010@gmail.com', role: 'child' as const, color: 'blue' },
];

export type UserRole = 'superadmin' | 'admin' | 'child' | 'pet';
export type User = typeof USERS[number];

export function canDelete(role: UserRole) { return role === 'superadmin' || role === 'admin'; }
export function isSuperAdmin(role: UserRole) { return role === 'superadmin'; }
export function isAdmin(role: UserRole) { return role === 'superadmin' || role === 'admin'; }

export function getSession(): { userId: string; role: UserRole } | null {
  try { return JSON.parse(sessionStorage.getItem('familyos_session') || 'null'); } catch { return null; }
}
export function setSession(userId: string, role: UserRole) {
  sessionStorage.setItem('familyos_session', JSON.stringify({ userId, role }));
}
export function clearSession() { sessionStorage.removeItem('familyos_session'); }

export const FAMILY = {
  user: 'Daddy',
  members: [
    { id: 'daddy', name: 'Daddy', role: 'parent', color: 'indigo' },
    { id: 'gwen', name: 'Mommy', role: 'parent', color: 'pink' },
    { id: 'abriana', name: 'Abriana', role: 'child', color: 'purple' },
    { id: 'julia', name: 'Julia', role: 'child', color: 'blue' },
    { id: 'lucy', name: 'Lucy', role: 'pet', color: 'amber' },
  ],
};

export const KEYS = {
  tasks: 'household_tasks',
  presenceZones: 'presence_zones',
  presenceLog: 'presence_log',
  householdAI: 'household_ai_failsafe',
  pillars: 'four_pillars',
  activities: 'quality_activities',
  qualityAI: 'quality_time_ai_failsafe',
  promises: 'family_promises',
  emotions: 'emotion_logs',
  geminiApiKey: 'gemini_api_key',
  promisesAI: 'promise_keeper_ai_failsafe',
  apiKey: 'anthropic_api_key',
  settings: 'familyos_settings',
  cameraToken: 'camera_access_token',
};

export const DEFAULT_SETTINGS = {
  aiEnabled: true,
  overdueThreshold: 3,
  preActivityReminder: 30,
};

export const DEFAULT_PRESENCE_ZONES = [
  { id: 'weeknight', name: 'Weeknight Family', startHour: 18, endHour: 21, days: [1, 2, 3, 4, 5] },
  { id: 'sat-morning', name: 'Saturday Morning', startHour: 8, endHour: 12, days: [6] },
];

export const DEFAULT_PILLARS = [
  { id: 'daddy', name: 'Daddy', color: 'indigo', interests: 'Coding, woodworking, gaming, coffee, being the best dad', lastQualityTime: null },
  { id: 'gwen', name: 'Mommy', color: 'pink', interests: 'Wine, hiking, true crime podcasts', lastQualityTime: null },
  { id: 'abriana', name: 'Abriana', color: 'purple', interests: 'Metalcore, drawing, gaming', lastQualityTime: null },
  { id: 'julia', name: 'Julia', color: 'blue', interests: 'Reading, baking, soccer', lastQualityTime: null },
  { id: 'home', name: 'Home & Shared', color: 'green', interests: 'Game nights, cooking, outdoor time', lastQualityTime: null },
];

export const ACTIVITY_TEMPLATES = [
  { id: 't1', name: 'Metalcore Jam', person: 'Abriana', duration: 60, color: 'purple' },
  { id: 't2', name: 'Game Night', person: 'Family', duration: 120, color: 'green' },
  { id: 't3', name: 'Cook Together', person: 'Family', duration: 90, color: 'orange' },
  { id: 't4', name: 'Date Night', person: 'Mommy', duration: 180, color: 'pink' },
  { id: 't5', name: 'Outdoor Time', person: 'Family', duration: 120, color: 'emerald' },
  { id: 't6', name: '1-on-1 Time', person: 'Any', duration: 60, color: 'blue' },
];

export const TASK_CATEGORIES = ['Shopping', 'Maintenance', 'Scheduling', 'Pet', 'Important Dates', 'General'];
export const EMOTION_CATEGORIES = ['Connection', 'Frustration', 'Concern', 'Joy', 'Anxiety', 'Gratitude', 'Confusion'];
export const NEGATIVE_EMOTIONS = ['Frustration', 'Concern', 'Anxiety', 'Confusion'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const DUE_ESTIMATES = ['Today', 'This Week', 'This Month', 'No Deadline'];
export const PERSONS = ['Daddy', 'Mommy', 'Abriana', 'Julia', 'Lucy', 'Family', 'General'];

// Storage helpers — localStorage + cloud sync
import { pushToCloud } from './sync';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    pushToCloud(key, value);
  } catch {
    // ignore
  }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function daysBetween(a: number, b: number) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// Returns whole days from now (start-of-today) to the dueDate (start-of-due-day).
// Positive = days remaining, 0 = due today, negative = overdue.
export function daysUntilDue(dueDate: number): number {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(dueDate);
  const startDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startDue - startToday) / (1000 * 60 * 60 * 24));
}

export function formatDueBadge(dueDate: number): { label: string; tone: 'overdue' | 'today' | 'soon' | 'future' } {
  const diff = daysUntilDue(dueDate);
  if (diff < 0) return { label: `${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'day' : 'days'} overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Due today', tone: 'today' };
  if (diff === 1) return { label: '1 day left', tone: 'soon' };
  if (diff <= 3) return { label: `${diff} days left`, tone: 'soon' };
  return { label: `${diff} days left`, tone: 'future' };
}

// Convert a timestamp to a yyyy-mm-dd string suitable for <input type="date">
export function dateInputValue(ts?: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Parse yyyy-mm-dd (from <input type="date">) into a timestamp at end-of-day local time.
export function parseDateInput(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function isOverdue(task: { dueDate?: number | null; dueEstimate?: string; createdAt: number }, threshold = 3) {
  // Prefer real due date when present
  if (task.dueDate) return Date.now() > task.dueDate;
  const days = daysBetween(task.createdAt, Date.now());
  if (task.dueEstimate === 'Today') return days >= 1;
  if (task.dueEstimate === 'This Week') return days >= 7;
  if (task.dueEstimate === 'This Month') return days >= 30;
  return days >= threshold * 7; // generous fallback
}


export function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function relativeDate(ts: number | null) {
  if (!ts) return 'Never';
  const days = daysBetween(ts, Date.now());
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Claude API call helper — proxied through /api/chat so the key never leaves the server.
// Household memory (the "Household Brain") is injected as the system prompt so every
// AI surface that routes through here is home-aware. Pass includeMemory=false to opt out
// (e.g. calls where household context is irrelevant or would waste tokens).
export async function callClaude(
  prompt: string,
  maxTokens = 1000,
  includeMemory = true
): Promise<{ ok: boolean; text: string }> {
  try {
    // Lazy import avoids a circular dependency (householdMemory imports from this file).
    let system = '';
    if (includeMemory) {
      try {
        const { assembleMemoryPrompt } = await import('./householdMemory');
        system = assembleMemoryPrompt();
      } catch { /* memory optional — proceed without it */ }
    }
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(system ? { prompt, maxTokens, system } : { prompt, maxTokens }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      return { ok: false, text: `API ${res.status}: ${errData.error || res.statusText}` };
    }
    const data = await res.json();
    return { ok: true, text: data?.text || '' };
  } catch (e: any) {
    return { ok: false, text: e?.message || 'Network error' };
  }
}

export async function callClaudeVision(imageBase64: string, mediaType: string, prompt: string): Promise<{ ok: boolean; text: string }> {
  try {
    // Route through server-side proxy so the API key is never exposed in the browser bundle
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mediaType, prompt }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      return { ok: false, text: `API ${res.status}: ${errData.error || res.statusText}` };
    }
    const data = await res.json();
    return { ok: true, text: data?.text || '' };
  } catch (e: any) {
    return { ok: false, text: e?.message || 'Network error' };
  }
}

const GEMINI_DAILY_LIMIT = 1500;
const GEMINI_WARN_AT = 1400;
const GEMINI_COUNT_KEY = 'gemini_daily_count';

function getTodayPT(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

export function getGeminiDailyUsage(): { count: number; limit: number; warnAt: number; date: string } {
  try {
    const raw = localStorage.getItem(GEMINI_COUNT_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    const today = getTodayPT();
    if (!stored || stored.date !== today) return { count: 0, limit: GEMINI_DAILY_LIMIT, warnAt: GEMINI_WARN_AT, date: today };
    return { count: stored.count, limit: GEMINI_DAILY_LIMIT, warnAt: GEMINI_WARN_AT, date: today };
  } catch {
    return { count: 0, limit: GEMINI_DAILY_LIMIT, warnAt: GEMINI_WARN_AT, date: getTodayPT() };
  }
}

export function resetGeminiCount() {
  localStorage.removeItem(GEMINI_COUNT_KEY);
}

function incrementGeminiCount() {
  const today = getTodayPT();
  const { count } = getGeminiDailyUsage();
  localStorage.setItem(GEMINI_COUNT_KEY, JSON.stringify({ date: today, count: count + 1 }));
}

async function uploadGeminiFile(imageBase64: string, mediaType: string, apiKey: string): Promise<{ uri: string; name: string } | { error: string }> {
  const binary = atob(imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const boundary = `gem${Date.now()}`;
  const meta = JSON.stringify({ file: { display_name: 'chore_scan' } });
  const enc = new TextEncoder();
  const prefix = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mediaType}\r\n\r\n`);
  const suffix = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(bytes, prefix.length);
  body.set(suffix, prefix.length + bytes.length);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}&uploadType=multipart`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      const retryMatch = errText.match(/"retryDelay":\s*"([\d.]+)s"/);
      const secs = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;
      return { error: `Upload rate limit hit. Retry in ${secs}s.` };
    }
    return { error: `Upload failed (${res.status}): ${errText.slice(0, 120)}` };
  }
  const data = await res.json();
  const uri = data?.file?.uri;
  const name = data?.file?.name;
  if (!uri) return { error: 'Files API returned no URI.' };
  return { uri, name };
}

export async function callGeminiVision(imageBase64: string, mediaType: string, prompt: string): Promise<{ ok: boolean; text: string }> {
  const apiKey = localStorage.getItem(KEYS.geminiApiKey) || '';
  if (!apiKey) return { ok: false, text: 'No Gemini API key set. Add one in Settings.' };

  const { count, limit } = getGeminiDailyUsage();
  if (count >= limit) {
    return { ok: false, text: `Gemini daily limit reached (${limit} requests). Resets at midnight PT, or switch to Claude.` };
  }

  try {
    // Upload image via Files API, then reference by URI
    const file = await uploadGeminiFile(imageBase64, mediaType, apiKey);
    if ('error' in file) return { ok: false, text: file.error };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { file_data: { file_uri: file.uri, mime_type: mediaType } },
            { text: prompt },
          ]}],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
        }),
      }
    );
    incrementGeminiCount();

    // Delete file after use (fire and forget)
    if (!('error' in file) && file.name) {
      fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {});
    }

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        const retryMatch = errText.match(/"retryDelay":\s*"([\d.]+)s"/);
        const secs = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;
        return { ok: false, text: `Rate limit hit. Retry in ${secs}s (or switch to Claude).` };
      }
      return { ok: false, text: `Gemini ${res.status}: ${errText}` };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { ok: true, text };
  } catch (e: any) {
    return { ok: false, text: e?.message || 'Network error' };
  }
}

export function tryParseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
  } catch {
    // ignore
  }
  return fallback;
}


// Recurrence helpers
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'custom';
export interface Recurrence {
  type: RecurrenceType;
  customDays?: number[]; // 0=Sun..6=Sat
}

export const RECURRENCE_OPTIONS: { id: RecurrenceType | 'none'; label: string }[] = [
  { id: 'none', label: 'No Repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Custom Days' },
];

export function nextRecurrence(from: number, rec: Recurrence): number {
  const d = new Date(from);
  if (rec.type === 'daily') {
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (rec.type === 'weekly') {
    d.setDate(d.getDate() + 7);
    return d.getTime();
  }
  if (rec.type === 'monthly') {
    d.setMonth(d.getMonth() + 1);
    return d.getTime();
  }
  if (rec.type === 'custom' && rec.customDays && rec.customDays.length > 0) {
    // Find the next day-of-week (1..7 days ahead) that's in customDays
    for (let i = 1; i <= 7; i++) {
      const candidate = new Date(from);
      candidate.setDate(candidate.getDate() + i);
      if (rec.customDays.includes(candidate.getDay())) return candidate.getTime();
    }
  }
  // Fallback: 1 day later
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function describeRecurrence(rec?: Recurrence | null): string {
  if (!rec) return '';
  if (rec.type === 'daily') return 'Daily';
  if (rec.type === 'weekly') return 'Weekly';
  if (rec.type === 'monthly') return 'Monthly';
  if (rec.type === 'custom') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (rec.customDays || []).map((d) => names[d]).join('/') || 'Custom';
  }
  return '';
}
