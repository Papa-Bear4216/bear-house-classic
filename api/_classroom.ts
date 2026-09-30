/**
 * Server-side Google Classroom helpers for a linked (per-member) school
 * account. The refresh token is encrypted at rest; grades and coursework are
 * only ever read with the linked member's own token.
 */
import { dbGetMemberClassroomToken } from './_db.js';
import { decryptSecret } from './_crypto.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://classroom.googleapis.com/v1';

export interface GradeEntry {
  courseId: string;
  courseName: string;
  workId: string;
  title: string;
  state: string;
  grade: number | null;
  maxPoints: number | null;
  late: boolean;
  dueDate: { year: number; month: number; day: number } | null;
}

/** Fresh access token for this member's linked school account, or null if not linked or revoked. */
export async function getMemberClassroomAccessToken(memberId: string): Promise<string | null> {
  const stored = await dbGetMemberClassroomToken(memberId);
  if (!stored) return null;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  let refreshToken: string;
  try {
    refreshToken = await decryptSecret(stored.encryptedRefreshToken);
  } catch {
    return null;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as any).access_token || null;
}

async function gGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}`);
  return res.json();
}

/** Grades and submission state for the linked student across up to 8 active courses. */
export async function fetchGrades(token: string): Promise<GradeEntry[]> {
  const courses: any[] = (await gGet('/courses?courseStates=ACTIVE&studentId=me', token)).courses || [];
  const perCourse = await Promise.all(courses.slice(0, 8).map(async (course: any): Promise<GradeEntry[]> => {
    try {
      const [cw, subs] = await Promise.all([
        gGet(`/courses/${course.id}/courseWork?pageSize=30&orderBy=updateTime%20desc`, token),
        gGet(`/courses/${course.id}/courseWork/-/studentSubmissions?userId=me&pageSize=60`, token),
      ]);
      const work = new Map<string, any>((cw.courseWork || []).map((w: any) => [w.id, w]));
      return (subs.studentSubmissions || []).flatMap((s: any) => {
        const w = work.get(s.courseWorkId);
        if (!w) return [];
        const grade = typeof s.assignedGrade === 'number' ? s.assignedGrade : null;
        return [{
          courseId: String(course.id),
          courseName: course.name,
          workId: s.courseWorkId,
          title: w.title,
          state: s.state,
          grade,
          maxPoints: typeof w.maxPoints === 'number' ? w.maxPoints : null,
          late: !!s.late,
          dueDate: w.dueDate ?? null,
        }];
      });
    } catch {
      return [];
    }
  }));
  return perCourse.flat();
}
