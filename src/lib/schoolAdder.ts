// src/lib/schoolAdder.ts
// School Stuff Ingest & Triage Parser for Hot Mess Express
// Ingests teacher emails, newsletters, permission slips, syllabi & flyers
import { z } from 'zod';
import { loadJSON, saveJSON, uid, KEYS } from './familyos';
import { apiUrl } from './api';
import { getAccessToken } from './householdAuth';

export type SchoolItemType = 'homework' | 'event' | 'action_item';

export interface SchoolItem {
  id: string;
  kid: string;
  type: SchoolItemType;
  title: string;
  subject: string;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  notes?: string;
  requiresParentSignoff?: boolean;
  requiresPayment?: boolean;
  paymentAmount?: number;
  source: 'text_paste' | 'ocr_scan' | 'quick_capture';
  selected?: boolean;
}

const optStr = z.string().nullish().transform((v) => v?.trim() || undefined);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((v) => v?.trim() || undefined)
  .catch(undefined);
const hhmm = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/)
  .nullish()
  .transform((v) => v?.trim() || undefined)
  .catch(undefined);

export const SchoolItemSchema = z.object({
  kid: optStr,
  type: z.enum(['homework', 'event', 'action_item']).catch('homework'),
  title: z.string().trim().min(1).max(120),
  subject: optStr,
  dueDate: isoDate,
  dueTime: hhmm,
  notes: optStr,
  requiresParentSignoff: z.boolean().catch(false),
  requiresPayment: z.boolean().catch(false),
  paymentAmount: z.coerce.number().nonnegative().max(10000).nullish().catch(undefined),
});

export const SchoolParseResponseSchema = z.object({
  items: z.array(z.unknown()).transform((a) =>
    a.flatMap((x) => {
      const r = SchoolItemSchema.safeParse(x);
      return r.success ? [r.data] : [];
    })
  ),
});

/**
 * Parses YYYY-MM-DD and optional HH:mm into local midnight/time milliseconds without UTC rollover.
 */
export function localDateMs(iso: string, hhmm = '00:00'): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const [h, mi] = (hhmm || '00:00').split(':').map(Number);
  const dt = new Date(y, mo - 1, d, h || 0, mi || 0);
  return dt.getMonth() === mo - 1 && dt.getDate() === d ? dt.getTime() : null;
}

/**
 * Fast regex-based offline heuristic parser for school texts/flyers.
 */
export function offlineParseSchoolStuff(
  text: string,
  availableKids: string[] = [],
  defaultKid?: string
): SchoolItem[] {
  const clean = (text || '').trim();
  if (!clean) return [];

  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: SchoolItem[] = [];

  // Match kid by earliest mention index, escaping special regex characters
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let detectedKid = defaultKid || availableKids[0] || 'Child';
  let firstKidIndex = Infinity;
  for (const k of availableKids) {
    const rx = new RegExp(`\\b${esc(k)}\\b`, 'i');
    const match = rx.exec(clean);
    if (match && match.index < firstKidIndex) {
      firstKidIndex = match.index;
      detectedKid = k;
    }
  }

  // Look for date patterns (ISO or month day)
  let parsedDueDate: string | undefined;
  const isoMatch = clean.match(/\b(202\d-\d{2}-\d{2})\b/);
  if (isoMatch) {
    parsedDueDate = isoMatch[1];
  } else {
    const monthMatch = clean.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\b/i
    );
    if (monthMatch) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const mIdx = months.findIndex((m) => monthMatch[1].toLowerCase().startsWith(m));
      if (mIdx >= 0) {
        const d = String(monthMatch[2]).padStart(2, '0');
        const m = String(mIdx + 1).padStart(2, '0');
        const y = new Date().getFullYear();
        parsedDueDate = `${y}-${m}-${d}`;
      }
    }
  }

  const isPermissionSlip = /\b(permission slip|consent form|waiver|sign-off|sign and return)\b/i.test(clean);
  const isPayment = /\$\s?\d|\b(fee|cost|cash|payment|lunch money)\b/i.test(clean);
  const isEvent = /\b(field trip|picture day|early release|assembly|open house|pto|ptsa|conference)\b/i.test(clean);

  // Extract dollar amount if present
  let feeAmount: number | undefined;
  const moneyMatch = clean.match(/\$(\d+(?:\.\d{2})?)/);
  if (moneyMatch) {
    feeAmount = parseFloat(moneyMatch[1]);
  }

  if (isPermissionSlip || isPayment) {
    items.push({
      id: uid(),
      kid: detectedKid,
      type: 'action_item',
      title: lines[0]?.slice(0, 60) || 'School Action Item',
      subject: 'School Admin',
      dueDate: parsedDueDate,
      notes: clean.slice(0, 300),
      requiresParentSignoff: isPermissionSlip,
      requiresPayment: isPayment,
      paymentAmount: feeAmount,
      source: 'text_paste',
      selected: true,
    });
  } else if (isEvent) {
    items.push({
      id: uid(),
      kid: detectedKid,
      type: 'event',
      title: lines[0]?.slice(0, 60) || 'School Event',
      subject: 'School',
      dueDate: parsedDueDate,
      notes: clean.slice(0, 300),
      requiresParentSignoff: false,
      requiresPayment: false,
      source: 'text_paste',
      selected: true,
    });
  } else {
    // Treat as homework or assignment
    items.push({
      id: uid(),
      kid: detectedKid,
      type: 'homework',
      title: lines[0]?.slice(0, 60) || 'School Assignment',
      subject: 'General',
      dueDate: parsedDueDate,
      notes: clean.slice(0, 300),
      requiresParentSignoff: false,
      requiresPayment: false,
      source: 'text_paste',
      selected: true,
    });
  }

  return items;
}

/**
 * Parses school announcement, flyer, or teacher email into actionable items.
 */
export async function parseSchoolAnnouncement(
  text: string,
  availableKids: string[] = [],
  defaultKid?: string
): Promise<{ items: SchoolItem[]; isFallback: boolean }> {
  const clean = (text || '').trim();
  if (!clean) return { items: [], isFallback: false };

  const prompt = `You are a school announcement and assignment parser for a family dashboard app.
Read the school announcement, email, syllabus, or flyer text below and extract all actionable items.
Classify each item into one of three types:
1. "homework": assignments, readings, study tasks, project milestones.
2. "event": field trips, picture day, assemblies, early release days, sports/concert dates.
3. "action_item": things parents need to sign or pay (permission slips, forms, lab fees, lunch account replenishment).

Children in this family: ${availableKids.length > 0 ? availableKids.join(', ') : 'Unknown'}.
Default child if not specified: "${defaultKid || availableKids[0] || 'Child'}".

Raw input:
"""
${clean}
"""

Respond with a JSON object in this exact schema:
{
  "items": [
    {
      "kid": "Child Name",
      "type": "homework" | "event" | "action_item",
      "title": "Clear concise summary",
      "subject": "e.g. Math, History, Field Trip, Admin",
      "dueDate": "YYYY-MM-DD or omit if none",
      "dueTime": "HH:MM or omit if none",
      "notes": "details, instructions, what to bring",
      "requiresParentSignoff": true | false,
      "requiresPayment": true | false,
      "paymentAmount": 15.00 or null
    }
  ]
}`;

  try {
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        prompt,
        format: 'json',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = typeof data.text === 'string' ? data.text : (typeof data.response === 'string' ? data.response : '');
      const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

      let candidate: unknown = null;
      try {
        candidate = JSON.parse(cleanJson);
      } catch {
        candidate = null;
      }

      if (candidate) {
        if (Array.isArray(candidate)) {
          candidate = { items: candidate };
        }
        const validated = SchoolParseResponseSchema.safeParse(candidate);
        if (validated.success) {
          const resolveKid = (k?: string) =>
            availableKids.find((a) => a.toLowerCase() === k?.toLowerCase()) ??
            defaultKid ??
            availableKids[0] ??
            'Child';

          const items: SchoolItem[] = validated.data.items.map((item) => ({
            id: uid(),
            kid: resolveKid(item.kid),
            type: item.type,
            title: item.title,
            subject: item.subject || 'General',
            dueDate: item.dueDate || undefined,
            dueTime: item.dueTime || undefined,
            notes: item.notes || undefined,
            requiresParentSignoff: item.requiresParentSignoff,
            requiresPayment: item.requiresPayment,
            paymentAmount: item.paymentAmount ?? undefined,
            source: 'text_paste',
            selected: true,
          }));
          return { items, isFallback: false };
        }
      }
    }
  } catch {
    // Non-fatal: fall through to heuristic parser
  }

  const fallbackItems = offlineParseSchoolStuff(clean, availableKids, defaultKid);
  return { items: fallbackItems, isFallback: true };
}

/**
 * Saves extracted school items into the respective app storage tables:
 * - 'homework' -> 'familyos_homework'
 * - 'event' -> 'quality_activities' (KEYS.activities)
 * - 'action_item' -> 'household_tasks' (KEYS.tasks)
 */
export function saveSchoolItems(
  items: SchoolItem[],
  actorName: string = 'Parent'
): { homeworkAdded: number; eventsAdded: number; tasksAdded: number } {
  const selected = items.filter((i) => i.selected !== false);
  let homeworkAdded = 0;
  let eventsAdded = 0;
  let tasksAdded = 0;

  const now = Date.now();

  const hwList = loadJSON<any[]>('familyos_homework', []);
  const activities = loadJSON<any[]>(KEYS.activities, []);
  const tasks = loadJSON<any[]>(KEYS.tasks, []);

  for (const item of selected) {
    if (item.type === 'homework') {
      const isDupe = hwList.some(
        (h) => h.kid.toLowerCase() === item.kid.toLowerCase() &&
               h.task.toLowerCase() === item.title.toLowerCase() &&
               (h.dueDate || '') === (item.dueDate || '') &&
               !h.deletedAt
      );
      if (!isDupe) {
        hwList.unshift({
          id: uid(),
          kid: item.kid,
          subject: item.subject || 'General',
          task: item.title,
          dueDate: item.dueDate || '',
          status: 'Not Started',
          createdAt: now,
          notes: item.notes,
        });
        homeworkAdded++;
      }
    } else if (item.type === 'event') {
      const scheduledAt = (item.dueDate ? localDateMs(item.dueDate, item.dueTime || '09:00') : null) ?? (now + 86400000);
      const activityName = `[${item.kid}] ${item.title}`;
      const isDupe = activities.some(
        (a) => a.person.toLowerCase() === item.kid.toLowerCase() &&
               a.name.toLowerCase() === activityName.toLowerCase() &&
               a.scheduledAt === scheduledAt &&
               !a.deletedAt
      );
      if (!isDupe) {
        activities.unshift({
          id: uid(),
          name: activityName,
          person: item.kid,
          scheduledAt,
          notes: item.notes || `School event for ${item.kid}`,
          createdAt: now,
          completed: false,
          source: 'school_adder',
        });
        eventsAdded++;
      }
    } else if (item.type === 'action_item') {
      const priority = item.requiresParentSignoff || item.requiresPayment ? 'High' : 'Medium';
      const paymentTag = item.requiresPayment && item.paymentAmount ? ` ($${item.paymentAmount})` : '';
      const signoffTag = item.requiresParentSignoff ? ' [Sign-off Required]' : '';
      const taskText = `[School: ${item.kid}] ${item.title}${signoffTag}${paymentTag}`;
      const parsedDue = item.dueDate ? localDateMs(item.dueDate, '23:59') : null;

      const isDupe = tasks.some(
        (t) => t.text.toLowerCase() === taskText.toLowerCase() &&
               t.dueDate === parsedDue &&
               !t.completed
      );
      if (!isDupe) {
        tasks.unshift({
          id: uid(),
          text: taskText,
          person: actorName,
          priority,
          category: 'Important Dates',
          dueEstimate: parsedDue ? undefined : 'This Week',
          dueDate: parsedDue,
          completed: false,
          createdAt: now,
          notes: item.notes,
          source: 'school_adder',
        });
        tasksAdded++;
      }
    }
  }

  if (homeworkAdded > 0) saveJSON('familyos_homework', hwList);
  if (eventsAdded > 0) saveJSON(KEYS.activities, activities);
  if (tasksAdded > 0) saveJSON(KEYS.tasks, tasks);

  return { homeworkAdded, eventsAdded, tasksAdded };
}
