import { STORAGE_KEYS } from './familyos';

const BOARD_KEY = 'bearhouse_board';
const SYNC_VERSION = 1;

export type SyncPackage = {
  version: number;
  exportedAt: string;
  tasks: any[];
  events: any[];
  users: any[];
  posts: any[];
};

function readKey(key: string): any[] {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export function exportSyncPackage(): string {
  const pkg: SyncPackage = {
    version: SYNC_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: readKey(STORAGE_KEYS.TASKS),
    events: readKey(STORAGE_KEYS.EVENTS),
    users: readKey(STORAGE_KEYS.POINTS),
    posts: readKey(BOARD_KEY),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(pkg))));
}

export function importSyncPackage(code: string): { success: boolean; message: string } {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const pkg: SyncPackage = JSON.parse(json);

    if (!pkg.version || !pkg.exportedAt) {
      return { success: false, message: 'Invalid sync code format.' };
    }

    // Merge strategy: incoming records overwrite local by id, new records are appended
    const mergeById = (local: any[], incoming: any[]): any[] => {
      const map = new Map(local.map((i: any) => [i.id, i]));
      for (const item of incoming) {
        map.set(item.id, item);
      }
      return Array.from(map.values());
    };

    const tasks = mergeById(readKey(STORAGE_KEYS.TASKS), pkg.tasks);
    const events = mergeById(readKey(STORAGE_KEYS.EVENTS), pkg.events);
    const users = mergeById(readKey(STORAGE_KEYS.POINTS), pkg.users);
    const posts = mergeById(readKey(BOARD_KEY), pkg.posts);

    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(users));
    localStorage.setItem(BOARD_KEY, JSON.stringify(posts));

    return {
      success: true,
      message: `Synced ${pkg.tasks.length} tasks, ${pkg.events.length} events, ${pkg.users.length} members.`,
    };
  } catch (e) {
    return { success: false, message: 'Could not read sync code. Make sure you pasted it correctly.' };
  }
}
