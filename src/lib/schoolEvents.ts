const SCHOOL_EVENT_KEY_PREFIX = 'familyos_school_event:';

export const SCHOOL_EVENT_KINDS = [
  { id: 'dress-up', label: 'Dress-up day', color: '#f4cb73' },
  { id: 'pep-rally', label: 'Pep rally', color: '#e391a5' },
  { id: 'track-meet', label: 'Track meet', color: '#87c9a5' },
  { id: 'other', label: 'School event', color: '#9dbbea' },
] as const;

export type SchoolEventKind = typeof SCHOOL_EVENT_KINDS[number]['id'];

export interface SchoolEvent {
  id: string;
  date: string;
  title: string;
  kind: SchoolEventKind;
  details: string;
  author: string;
  authorId: string;
  createdAt: number;
  deletedAt?: number;
}

export function schoolEventKey(householdId: string, eventId: string): string {
  return `${schoolEventPrefix(householdId)}${eventId}`;
}

export function schoolEventPrefix(householdId: string): string {
  return `${SCHOOL_EVENT_KEY_PREFIX}${householdId}:`;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function schoolMonthDays(year: number, month: number): { date: string; inMonth: boolean }[] {
  const offset = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => {
    const day = new Date(year, month, index - offset + 1);
    return { date: localDateKey(day), inMonth: day.getMonth() === month };
  });
}

export function isSchoolEvent(value: unknown): value is SchoolEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<SchoolEvent>;
  const date = typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? new Date(`${event.date}T12:00:00`) : null;
  return typeof event.id === 'string' && event.id.length > 0 && typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date)
    && date !== null && Number.isFinite(date.getTime()) && localDateKey(date) === event.date
    && typeof event.title === 'string' && event.title.trim().length > 0
    && typeof event.details === 'string' && typeof event.author === 'string' && event.author.trim().length > 0
    && typeof event.authorId === 'string' && event.authorId.trim().length > 0
    && typeof event.createdAt === 'number' && Number.isFinite(event.createdAt)
    && (event.deletedAt === undefined || (typeof event.deletedAt === 'number' && Number.isFinite(event.deletedAt)))
    && SCHOOL_EVENT_KINDS.some((kind) => kind.id === event.kind);
}

export function readSchoolEvents(storage: Pick<Storage, 'length' | 'key' | 'getItem'>, householdId: string): SchoolEvent[] {
  const prefix = schoolEventPrefix(householdId);
  const events: SchoolEvent[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const record: unknown = JSON.parse(storage.getItem(key) || 'null');
      if (isSchoolEvent(record) && record.deletedAt === undefined && key === schoolEventKey(householdId, record.id)) events.push(record);
    } catch {}
  }
  return events;
}

export function nextSchoolEvent(events: SchoolEvent[], today: string): SchoolEvent | undefined {
  return events.filter((event) => event.date >= today).sort((first, second) => first.date.localeCompare(second.date))[0];
}
