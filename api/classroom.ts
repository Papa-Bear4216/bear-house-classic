export const config = { runtime: 'edge' };

/**
 * /api/classroom
 * Syncs Google Classroom assignments for a student into household_tasks.
 *
 * POST /api/classroom { accessToken, person, userId }
 *
 * Returns { added: number, assignments: Assignment[] }
 *
 * Requires Google Classroom API scopes (added to auth.ts):
 *   classroom.courses.readonly
 *   classroom.coursework.me.readonly
 *   classroom.student-submissions.me.readonly
 */

import { dbGet, dbSet, resolveHouseholdId } from './_db.js';

const TASKS_KEY = 'household_tasks';

async function getKey(key: string, householdId: string) {
  return (await dbGet(key, householdId)) ?? [];
}

async function setKey(key: string, householdId: string, value: any) {
  await dbSet(key, householdId, value);
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

async function gFetch(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json();
}

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessTokenSupabase = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessTokenSupabase ? await resolveHouseholdId(accessTokenSupabase) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({})) as any;
  const { accessToken, person } = body;
  if (!accessToken || !person) return j({ error: 'Missing accessToken or person' }, 400);

  try {
    // 1. Get active courses
    const coursesData = await gFetch(
      'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE',
      accessToken
    );
    const courses: any[] = coursesData.courses || [];

    if (courses.length === 0) {
      return j({ added: 0, assignments: [], message: 'No active courses found' });
    }

    // 2. Fetch coursework for each course in parallel (max 5 courses)
    const workPromises = courses.slice(0, 5).map(async (course: any) => {
      try {
        const cw = await gFetch(
          `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?courseWorkStates=PUBLISHED&orderBy=dueDate%20asc&pageSize=10`,
          accessToken
        );
        return (cw.courseWork || []).map((w: any) => ({ ...w, courseName: course.name }));
      } catch { return []; }
    });

    const allWork: any[] = (await Promise.all(workPromises)).flat();

    // 3. Filter to upcoming/not-yet-due assignments
    const now = Date.now();
    const upcoming = allWork.filter((w: any) => {
      if (!w.dueDate) return true; // no due date — include
      const { year, month, day } = w.dueDate;
      const due = new Date(year, month - 1, day, 23, 59).getTime();
      return due >= now - 86400000; // include if due yesterday or later
    });

    // 4. Load existing tasks
    const tasks: any[] = await getKey(TASKS_KEY, householdId);

    // 5. Upsert by gcClassroomId — update existing, add new
    let added = 0;
    const newTasks = [...tasks];

    for (const w of upcoming) {
      let dueTimestamp: number | null = null;
      if (w.dueDate) {
        const { year, month, day } = w.dueDate;
        dueTimestamp = new Date(year, month - 1, day, 23, 59).getTime();
      }

      const existingIdx = newTasks.findIndex(t => t.gcClassroomId === w.id);

      const taskData = {
        text: `[${w.courseName}] ${w.title}`,
        person,
        priority: dueTimestamp && dueTimestamp - now < 3 * 86400000 ? 'High' : 'Medium',
        dueDate: dueTimestamp,
        dueEstimate: dueTimestamp ? 'This Week' : 'No Deadline',
        category: 'Scheduling',
        completed: false,
        source: 'google_classroom',
        gcClassroomId: w.id,
        gcCourseId: w.courseId,
        courseName: w.courseName,
        description: w.description?.slice(0, 200) || '',
      };

      if (existingIdx >= 0) {
        // Only update if not already completed
        if (!newTasks[existingIdx].completed) {
          newTasks[existingIdx] = { ...newTasks[existingIdx], ...taskData };
        }
      } else {
        newTasks.unshift({ ...taskData, id: uid(), createdAt: Date.now() });
        added++;
      }
    }

    await setKey(TASKS_KEY, householdId, newTasks);

    return j({ added, total: upcoming.length, courses: courses.length, assignments: upcoming.map((w: any) => ({ id: w.id, title: w.title, course: w.courseName, dueDate: w.dueDate })) });
  } catch (e: any) {
    return j({ error: (e as any)?.message || 'Classroom sync failed' }, 500);
  }
}
