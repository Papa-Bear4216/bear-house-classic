// src/lib/bulletinBoard.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadBulletinNotes,
  saveBulletinNotes,
  addBulletinNote,
  deleteBulletinNote,
  togglePinBulletinNote,
  DEFAULT_BULLETIN_NOTES,
  type BulletinNote,
} from './bulletinBoard';
import { KEYS } from './familyos';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  [name: string]: any;
}

const mockLocalStorage = new MemoryStorage();
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
} catch {
  (globalThis as any).localStorage = mockLocalStorage;
}

describe('Bulletin Board Module', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('loads default starter notes when storage is empty', () => {
    const notes = loadBulletinNotes();
    expect(notes.length).toBe(DEFAULT_BULLETIN_NOTES.length);
    expect(notes[0].title).toBe('School Early Release Friday');
    expect(notes[0].pinned).toBe(true);
  });

  it('saves and reloads custom bulletin notes', () => {
    const customNotes: BulletinNote[] = [
      {
        id: 'test-1',
        title: 'Dentist Appointment',
        content: 'Liam dentist visit at 3:15 PM on Tuesday.',
        color: 'sky',
        category: 'reminder',
        authorName: 'Dad',
        targetName: 'Liam',
        pinned: false,
        createdAt: 1000,
      },
    ];

    saveBulletinNotes(customNotes);
    const loaded = loadBulletinNotes();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('test-1');
    expect(loaded[0].title).toBe('Dentist Appointment');
  });

  it('adds a new bulletin note with defaults', () => {
    const newNote = addBulletinNote({
      title: 'Don’t forget raincoats!',
      content: 'Heavy rain expected this afternoon.',
      authorName: 'Mom',
      color: 'rose',
      category: 'urgent',
    });

    expect(newNote.id).toBeDefined();
    expect(newNote.title).toBe('Don’t forget raincoats!');
    expect(newNote.authorName).toBe('Mom');
    expect(newNote.color).toBe('rose');
    expect(newNote.category).toBe('urgent');
    expect(newNote.targetName).toBe('Everyone');

    const loaded = loadBulletinNotes();
    expect(loaded.some((n) => n.id === newNote.id)).toBe(true);
  });

  it('toggles pinned status of a note', () => {
    const note = addBulletinNote({
      title: 'Pin test',
      content: 'Testing pin toggle',
      authorName: 'Dad',
      pinned: false,
    });

    expect(note.pinned).toBe(false);

    togglePinBulletinNote(note.id);
    let loaded = loadBulletinNotes();
    expect(loaded.find((n) => n.id === note.id)?.pinned).toBe(true);

    togglePinBulletinNote(note.id);
    loaded = loadBulletinNotes();
    expect(loaded.find((n) => n.id === note.id)?.pinned).toBe(false);
  });

  it('deletes a note by ID', () => {
    const note = addBulletinNote({
      title: 'To be deleted',
      content: 'Goodbye note',
      authorName: 'Dad',
    });

    expect(loadBulletinNotes().some((n) => n.id === note.id)).toBe(true);

    deleteBulletinNote(note.id);
    expect(loadBulletinNotes().some((n) => n.id === note.id)).toBe(false);
  });
});
