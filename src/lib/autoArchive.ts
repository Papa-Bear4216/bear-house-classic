// Auto-archives completed items older than a threshold by soft-deleting them
// (setting deletedAt), reusing whatever section already has a "Removed"
// restore UI — no new state, no new UI concept, just automatic instead of
// requiring a manual "Clear completed" click. Call once per section on
// mount/load; idempotent (already-archived items are untouched).

const DEFAULT_ARCHIVE_AFTER_DAYS = 30;

interface Archivable {
  completed?: boolean;
  paid?: boolean;
  completedAt?: number;
  paidAt?: number;
  deletedAt?: number;
  deletedBy?: string;
}

export function autoArchiveOld<T extends Archivable>(
  items: T[],
  archivedBy: string,
  archiveAfterDays = DEFAULT_ARCHIVE_AFTER_DAYS
): { items: T[]; archivedCount: number } {
  const cutoff = Date.now() - archiveAfterDays * 86400000;
  let archivedCount = 0;
  const next = items.map((item) => {
    if (item.deletedAt) return item; // already archived/deleted
    const isDone = item.completed || item.paid;
    const doneAt = item.completedAt ?? item.paidAt;
    if (!isDone || !doneAt || doneAt > cutoff) return item;
    archivedCount++;
    return { ...item, deletedAt: Date.now(), deletedBy: archivedBy };
  });
  return { items: next, archivedCount };
}
