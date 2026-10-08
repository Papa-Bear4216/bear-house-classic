// src/lib/bulletinBoard.ts
// ADHD-friendly interactive family popup bulletin board with sticky notes

import { KEYS, loadJSON, saveJSON, uid } from './familyos';

export type BulletinColor = 'amber' | 'emerald' | 'rose' | 'sky' | 'violet';
export type BulletinCategory = 'urgent' | 'school' | 'reminder' | 'shoutout' | 'general';

export interface BulletinNote {
  id: string;
  title: string;
  content: string;
  color: BulletinColor;
  category: BulletinCategory;
  authorName: string;
  authorRole?: string;
  targetName: string; // 'Everyone' | specific member name
  pinned: boolean;
  createdAt: number;
}

export const BULLETIN_COLORS: { id: BulletinColor; label: string; bgClass: string; borderClass: string; textClass: string; badgeClass: string; pinColor: string }[] = [
  {
    id: 'amber',
    label: 'Warm Sticky',
    bgClass: 'bg-amber-950/40 hover:bg-amber-950/50',
    borderClass: 'border-amber-400/40',
    textClass: 'text-amber-100',
    badgeClass: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
    pinColor: '#f59e0b',
  },
  {
    id: 'rose',
    label: 'Urgent Note',
    bgClass: 'bg-rose-950/40 hover:bg-rose-950/50',
    borderClass: 'border-rose-500/40',
    textClass: 'text-rose-100',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    pinColor: '#f43f5e',
  },
  {
    id: 'emerald',
    label: 'School / Calm',
    bgClass: 'bg-emerald-950/40 hover:bg-emerald-950/50',
    borderClass: 'border-emerald-400/40',
    textClass: 'text-emerald-100',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    pinColor: '#10b981',
  },
  {
    id: 'sky',
    label: 'Reminder',
    bgClass: 'bg-sky-950/40 hover:bg-sky-950/50',
    borderClass: 'border-sky-400/40',
    textClass: 'text-sky-100',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pinColor: '#0ea5e9',
  },
  {
    id: 'violet',
    label: 'Family Love',
    bgClass: 'bg-violet-950/40 hover:bg-violet-950/50',
    borderClass: 'border-violet-400/40',
    textClass: 'text-violet-100',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    pinColor: '#8b5cf6',
  },
];

export const BULLETIN_CATEGORIES: { id: BulletinCategory; label: string; iconEmoji: string }[] = [
  { id: 'urgent', label: 'Urgent', iconEmoji: '🚨' },
  { id: 'school', label: 'School', iconEmoji: '🎒' },
  { id: 'reminder', label: 'Reminder', iconEmoji: '⏰' },
  { id: 'shoutout', label: 'Shoutout', iconEmoji: '💖' },
  { id: 'general', label: 'Note', iconEmoji: '📌' },
];

export const DEFAULT_BULLETIN_NOTES: BulletinNote[] = [
  {
    id: 'starter-1',
    title: 'School Early Release Friday',
    content: 'School releases early at 12:30 PM this Friday. Dad handling pickup and afternoon lunch.',
    color: 'emerald',
    category: 'school',
    authorName: 'Dad',
    authorRole: 'admin',
    targetName: 'Everyone',
    pinned: true,
    createdAt: Date.now() - 3600000 * 2,
  },
  {
    id: 'starter-2',
    title: 'Soccer Practice Gear',
    content: 'Shin guards and water bottles packed by the front door. Game at 10 AM Saturday.',
    color: 'amber',
    category: 'reminder',
    authorName: 'Mom',
    authorRole: 'admin',
    targetName: 'Everyone',
    pinned: false,
    createdAt: Date.now() - 3600000 * 5,
  },
];

export function loadBulletinNotes(): BulletinNote[] {
  const notes = loadJSON<BulletinNote[]>(KEYS.bulletinBoard, []);
  if (!notes || notes.length === 0) {
    return DEFAULT_BULLETIN_NOTES;
  }
  return notes;
}

export function saveBulletinNotes(notes: BulletinNote[]): void {
  saveJSON(KEYS.bulletinBoard, notes);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('familyos:bulletin-updated', { detail: notes }));
  }
}

export function addBulletinNote(params: {
  title: string;
  content: string;
  color?: BulletinColor;
  category?: BulletinCategory;
  authorName: string;
  authorRole?: string;
  targetName?: string;
  pinned?: boolean;
}): BulletinNote {
  const current = loadBulletinNotes();
  const newNote: BulletinNote = {
    id: `note-${uid()}`,
    title: params.title.trim(),
    content: params.content.trim(),
    color: params.color || 'amber',
    category: params.category || 'general',
    authorName: params.authorName || 'Family Member',
    authorRole: params.authorRole,
    targetName: params.targetName || 'Everyone',
    pinned: params.pinned ?? false,
    createdAt: Date.now(),
  };

  const updated = [newNote, ...current];
  saveBulletinNotes(updated);
  return newNote;
}

export function deleteBulletinNote(id: string): void {
  const current = loadBulletinNotes();
  const updated = current.filter((n) => n.id !== id);
  saveBulletinNotes(updated);
}

export function togglePinBulletinNote(id: string): void {
  const current = loadBulletinNotes();
  const updated = current.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
  saveBulletinNotes(updated);
}
