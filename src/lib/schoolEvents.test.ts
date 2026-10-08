import { describe, expect, it } from 'vitest';
import { isSchoolEvent, localDateKey, nextSchoolEvent, readSchoolEvents, schoolEventKey, schoolMonthDays, type SchoolEvent } from './schoolEvents';

const event = (date: string): SchoolEvent => ({ id: date, date, title: 'Wear blue', kind: 'dress-up', details: '', author: 'Maya', authorId: 'maya-member', createdAt: 1 });

describe('school events', () => {
  it('fills the month with weekday-aligned dates, including a leap day', () => {
    const days = schoolMonthDays(2028, 1);
    expect(days[0]).toEqual({ date: '2028-01-30', inMonth: false });
    expect(days.find((day) => day.date === '2028-02-29')?.inMonth).toBe(true);
    expect(days.length % 7).toBe(0);
  });

  it('uses local calendar dates rather than UTC day shifts', () => {
    expect(localDateKey(new Date(2026, 8, 24))).toBe('2026-09-24');
  });

  it('sorts upcoming days and ignores past dates without changing the source array', () => {
    const events = [event('2026-09-28'), event('2026-09-20'), event('2026-09-24')];
    expect(nextSchoolEvent(events, '2026-09-24')?.date).toBe('2026-09-24');
    expect(events[0].date).toBe('2026-09-28');
  });

  it('rejects malformed shared event records', () => {
    expect(isSchoolEvent(event('2026-09-24'))).toBe(true);
    expect(isSchoolEvent({ ...event('2026-09-24'), authorId: undefined })).toBe(false);
    expect(isSchoolEvent({ ...event('2026-09-24'), authorId: ' ' })).toBe(false);
    expect(isSchoolEvent({ ...event('2026-09-24'), authorId: 42 })).toBe(false);
    expect(isSchoolEvent({ id: '1', date: 'today', title: 'Pep rally', kind: 'pep-rally', author: 'Maya' })).toBe(false);
    expect(isSchoolEvent({ id: '1', date: '2026-02-31', title: 'Pep rally', kind: 'pep-rally', author: 'Maya' })).toBe(false);
    expect(isSchoolEvent({ id: '1', date: '2026-09-24', title: 'Pep rally', kind: 'pep-rally', author: 'Maya', createdAt: 1, details: {} })).toBe(false);
    expect(isSchoolEvent({ ...event('2026-09-24'), deletedAt: 'yesterday' })).toBe(false);
  });

  it('keeps different members’ additions independent and excludes tombstones', () => {
    const records = new Map([
      [schoolEventKey('home-a', 'maya'), JSON.stringify({ ...event('2026-09-25'), id: 'maya' })],
      [schoolEventKey('home-a', 'jordan'), JSON.stringify({ ...event('2026-09-26'), id: 'jordan', author: 'Jordan' })],
      [schoolEventKey('home-b', 'other'), JSON.stringify({ ...event('2026-09-27'), id: 'other' })],
    ]);
    const storage = {
      get length() { return records.size; },
      key(index: number) { return [...records.keys()][index] ?? null; },
      getItem(key: string) { return records.get(key) ?? null; },
    };
    expect(readSchoolEvents(storage, 'home-a').map((entry) => entry.id)).toEqual(['maya', 'jordan']);
    records.set(schoolEventKey('home-a', 'maya'), JSON.stringify({ ...event('2026-09-25'), id: 'maya', deletedAt: 2 }));
    expect(readSchoolEvents(storage, 'home-a').map((entry) => entry.id)).toEqual(['jordan']);
    records.set(schoolEventKey('home-a', 'broken'), '{');
    records.set(schoolEventKey('home-a', 'wrong-id'), JSON.stringify({ ...event('2026-09-25'), id: 'other-id' }));
    expect(readSchoolEvents(storage, 'home-a').map((entry) => entry.id)).toEqual(['jordan']);
  });
});
