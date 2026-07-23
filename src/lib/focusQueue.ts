export interface FocusQueueTask {
  id: string;
  priority: string;
  dueDate?: number | null;
}

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function buildFocusQueue<T extends FocusQueueTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (rankDiff !== 0) return rankDiff;

    const aDate = a.dueDate ?? Infinity;
    const bDate = b.dueDate ?? Infinity;
    return aDate - bDate;
  });
}
