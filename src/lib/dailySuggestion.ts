export type SuggestedModule = 'household' | 'quality' | 'promises' | 'emotions' | 'family';

interface DailySignals {
  tasks: { text?: string; person?: string; priority?: string; completed?: boolean; dueDate?: number | null; dueEstimate?: string; createdAt?: number }[];
  activities: { name?: string; scheduledAt?: number; completed?: boolean }[];
  promises: { text?: string; person?: string; completed?: boolean; dueDate?: number | null; dueEstimate?: string; createdAt?: number }[];
  memberName?: string;
  isChild?: boolean;
  now: number;
}

export interface DailySuggestion {
  module: SuggestedModule;
  title: string;
  reason: string;
}

export function getDailySuggestion({ tasks, activities, promises, memberName, isChild, now }: DailySignals): DailySuggestion {
  const myTasks = tasks.filter((task) => !task.completed && (!task.person || task.person === memberName));
  const myPromises = promises.filter((promise) => !promise.person || promise.person === memberName);
  const urgent = myTasks.find((task) =>
    task.priority === 'High' ||
    (typeof task.dueDate === 'number' && Number.isFinite(task.dueDate) && task.dueDate <= now) ||
    (task.dueEstimate === 'Today' && typeof task.createdAt === 'number' && now - task.createdAt >= 86400000)
  );

  if (urgent) return { module: 'household', title: 'One thing worth doing next.', reason: urgent.text ? `“${urgent.text}” is waiting on your list.` : 'A chore on your list needs attention.' };

  if (!isChild) {
    const upcoming = activities.find((activity) =>
      !activity.completed && typeof activity.scheduledAt === 'number' && activity.scheduledAt >= now && activity.scheduledAt <= now + 2 * 86400000
    );
    if (upcoming) return { module: 'quality', title: 'Something good is coming up.', reason: upcoming.name ? `${upcoming.name} is happening soon.` : 'You have a plan in the next two days.' };

    const duePromise = myPromises.find((promise) =>
      !promise.completed && typeof promise.dueDate === 'number' && Number.isFinite(promise.dueDate) && promise.dueDate <= now
    );
    if (duePromise) return { module: 'promises', title: 'A promise to keep close.', reason: duePromise.text ? `“${duePromise.text}” is due.` : 'A commitment is coming due.' };
  }

  if (myTasks.length > 0) return { module: 'household', title: 'Make a little progress.', reason: `${myTasks.length} ${myTasks.length === 1 ? 'chore' : 'chores'} on your list. Pick the easiest win.` };
  if (isChild) return { module: 'family', title: 'See what’s happening at home.', reason: 'Your chore list is clear for now.' };
  if (myPromises.some((promise) => !promise.completed)) return { module: 'promises', title: 'Keep a promise in view.', reason: 'You have a commitment you can check in on.' };
  return { module: 'emotions', title: 'Take a moment for yourself.', reason: 'Nothing urgent needs you right now. How are you feeling?' };
}
