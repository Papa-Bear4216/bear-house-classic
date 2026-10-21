import { KEYS, loadJSON, saveJSON, uid, loadPantry, decrementPantry, savePantry } from '@/lib/familyos';
import { defaultPlan, MEALS_STORAGE_KEY, applyMealCooked, type Day, type MealType, type WeekPlan } from '@/components/familyos/sections/mealPlannerShared';
import { CARS_STORAGE_KEY } from '@/components/familyos/sections/carMaintenanceKeys';
import { runGenericAction, setMealPlanAction } from '@/lib/hermesActions';
import { getAccessToken } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';
import { addHermesMemory } from '@/lib/hermesMemory';

export type ActionType = 'addTask'|'completeTask'|'uncompleteTask'|'deleteTask'|'addShopping'|'completeShoppingItem'|'addBill'|'markBillPaid'|'addAppointment'|'addPromise'|'completePromise'|'logEmotion'|'updateMemory'|'clearWeekMeals'|'setMealPlan'|'genericAction'|'markMealCooked'|'addCarMaintenanceEntry'|'controlDevice'|'discoverSmartHome'|'notifyPerson'|'manageMember'|'queryTriad';
export interface ActionParams extends Record<string, any> {}
export interface Action { type: ActionType; params: ActionParams }
export async function executeAction(
  action: Action,
  defaultPerson: string,
  householdMembers: { id: string; name: string; role: string }[]
): Promise<{ result: string; ok: boolean }> {
  try {
    const p = action.params;

    // ── Tasks ──────────────────────────────────────────────────────────────
    if (action.type === 'addTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const task = {
        id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        text: p.text || 'Untitled task',
        person: p.person || defaultPerson,
        priority: p.priority || 'Medium',
        category: p.category || 'General',
        dueEstimate: p.dueEstimate || 'No Deadline',
        dueDate: p.dueDate || null,
      };
      saveJSON(KEYS.tasks, [task, ...tasks]);
      return { result: `Added task: "${task.text}" for ${task.person}`, ok: true };
    }

    if (action.type === 'completeTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const match = (p.match || '').toLowerCase();
      const idx = tasks.findIndex(t => !t.completed && (t.id === p.id || t.text?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `No open task matching "${p.match}"`, ok: false };
      tasks[idx] = { ...tasks[idx], completed: true, completedAt: Date.now(), completedBy: p.person || 'Hermes' };
      saveJSON(KEYS.tasks, tasks);
      return { result: `Completed: "${tasks[idx].text}"`, ok: true };
    }

    if (action.type === 'uncompleteTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const match = (p.match || '').toLowerCase();
      const idx = tasks.findIndex(t => t.completed && (t.id === p.id || t.text?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `No completed task matching "${p.match}"`, ok: false };
      tasks[idx] = { ...tasks[idx], completed: false, completedAt: null };
      saveJSON(KEYS.tasks, tasks);
      return { result: `Reopened: "${tasks[idx].text}"`, ok: true };
    }

    if (action.type === 'deleteTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const match = (p.match || '').toLowerCase();
      const before = tasks.length;
      const after = tasks.filter(t => t.id !== p.id && !t.text?.toLowerCase().includes(match));
      saveJSON(KEYS.tasks, after);
      return { result: `Removed ${before - after.length} task(s)`, ok: true };
    }

    // ── Shopping ───────────────────────────────────────────────────────────
    if (action.type === 'addShopping') {
      const items = loadJSON<any[]>('familyos_shopping', []);
      const item = {
        id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        name: p.name || 'Unknown item',
        category: p.category || 'General',
        quantity: p.quantity || '1',
        assignedTo: p.assignedTo || 'General',
      };
      saveJSON('familyos_shopping', [item, ...items]);
      return { result: `Added to shopping: "${item.name}" ×${item.quantity}`, ok: true };
    }

    if (action.type === 'completeShoppingItem') {
      const items = loadJSON<any[]>('familyos_shopping', []);
      const match = (p.match || '').toLowerCase();
      const idx = items.findIndex(i => !i.completed && (i.id === p.id || i.name?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `Item not found: "${p.match}"`, ok: false };
      items[idx] = { ...items[idx], completed: true, completedAt: Date.now() };
      saveJSON('familyos_shopping', items);
      return { result: `Got "${items[idx].name}" ✓`, ok: true };
    }

    // ── Bills ──────────────────────────────────────────────────────────────
    if (action.type === 'addBill') {
      const bills = loadJSON<any[]>('familyos_bills', []);
      const bill = {
        id: uid(), createdAt: Date.now(), paid: false, source: 'hermes',
        name: p.name || 'Unnamed bill',
        amount: typeof p.amount === 'number' ? p.amount : parseFloat(p.amount) || 0,
        dueDate: p.dueDate || null,
        recurring: p.recurring || false,
        category: p.category || 'General',
      };
      saveJSON('familyos_bills', [bill, ...bills]);
      return { result: `Added bill: "${bill.name}" $${bill.amount}`, ok: true };
    }

    if (action.type === 'markBillPaid') {
      const bills = loadJSON<any[]>('familyos_bills', []);
      const match = (p.match || '').toLowerCase();
      const idx = bills.findIndex(b => !b.paid && (b.id === p.id || b.name?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `Unpaid bill not found: "${p.match}"`, ok: false };
      bills[idx] = { ...bills[idx], paid: true, paidAt: Date.now() };
      saveJSON('familyos_bills', bills);
      return { result: `Marked paid: "${bills[idx].name}"`, ok: true };
    }

    // ── Appointments ───────────────────────────────────────────────────────
    if (action.type === 'addAppointment') {
      const appts = loadJSON<any[]>('familyos_appointments', []);
      const appt = {
        id: uid(), createdAt: Date.now(), source: 'hermes',
        person: p.person || defaultPerson,
        title: p.title || p.type || 'Appointment',
        type: p.type || 'General',
        doctor: p.doctor || '',
        date: p.date ? new Date(p.date).getTime() : null,
        notes: p.notes || '',
      };
      saveJSON('familyos_appointments', [appt, ...appts]);
      return { result: `Added appointment: "${appt.title}" for ${appt.person}`, ok: true };
    }

    // ── Promises ───────────────────────────────────────────────────────────
    if (action.type === 'addPromise') {
      const promises = loadJSON<any[]>(KEYS.promises, []);
      const promise = {
        id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        person: p.person || defaultPerson,
        text: p.text || 'Unnamed promise',
        dueDate: p.dueDate ? new Date(p.dueDate).getTime() : null,
        priority: p.priority || 'Medium',
      };
      saveJSON(KEYS.promises, [promise, ...promises]);
      return { result: `Logged promise to ${promise.person}: "${promise.text}"`, ok: true };
    }

    if (action.type === 'completePromise') {
      const promises = loadJSON<any[]>(KEYS.promises, []);
      const match = (p.match || '').toLowerCase();
      const idx = promises.findIndex(pr => !pr.completed && (pr.id === p.id || pr.text?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `Promise not found: "${p.match}"`, ok: false };
      promises[idx] = { ...promises[idx], completed: true, completedAt: Date.now() };
      saveJSON(KEYS.promises, promises);
      return { result: `Promise kept: "${promises[idx].text}"`, ok: true };
    }

    // ── Emotions ───────────────────────────────────────────────────────────
    if (action.type === 'logEmotion') {
      const emotions = loadJSON<any[]>(KEYS.emotions, []);
      const entry = {
        id: uid(), createdAt: Date.now(), source: 'hermes',
        person: p.person || defaultPerson,
        emotion: p.emotion || 'neutral',
        intensity: Math.min(5, Math.max(1, parseInt(p.intensity) || 3)),
        note: p.note || '',
      };
      saveJSON(KEYS.emotions, [entry, ...emotions]);
      return { result: `Logged ${entry.emotion} (${entry.intensity}/5) for ${entry.person}`, ok: true };
    }

    // ── Meals ──────────────────────────────────────────────────────────────
    if (action.type === 'clearWeekMeals') {
      saveJSON(MEALS_STORAGE_KEY, defaultPlan());
      return { result: `Cleared the week's meal plan`, ok: true };
    }

    if (action.type === 'setMealPlan') {
      return setMealPlanAction(p.day, p.meal, p.name, p.cook, {
        description: p.description, time: p.time, difficulty: p.difficulty,
        servings: p.servings, ingredients: p.ingredients, steps: p.steps,
      });
    }

    if (action.type === 'markMealCooked') {
      const day = p.day as Day;
      const meal = p.meal as MealType;
      const weekPlan = loadJSON<WeekPlan>(MEALS_STORAGE_KEY, defaultPlan());
      const ingredients = weekPlan[day]?.cookedIngredients?.[meal];
      if (!ingredients) return { result: `No recipe recorded for ${day} ${meal} — plan it from the Meals tab first`, ok: false };

      const pantryItems = loadPantry();
      savePantry(decrementPantry(pantryItems, ingredients));

      const updated = applyMealCooked(weekPlan, day, meal, ingredients, ingredients.length, ingredients.length);
      saveJSON(MEALS_STORAGE_KEY, updated);
      return { result: `Marked ${meal} cooked for ${day} and updated the pantry`, ok: true };
    }

    // ── Cars ───────────────────────────────────────────────────────────────
    if (action.type === 'addCarMaintenanceEntry') {
      const cars = loadJSON<any[]>(CARS_STORAGE_KEY, []);
      const match = (p.carMatch || '').toLowerCase();
      const idx = cars.findIndex((c) => String(c.name ?? '').toLowerCase().includes(match));
      if (idx === -1) return { result: `No car matching "${p.carMatch}"`, ok: false };

      const entry = {
        id: uid(), createdAt: Date.now(),
        type: p.type || 'Other', date: p.date || '', mileage: p.mileage || '', notes: p.notes || '',
      };
      cars[idx] = { ...cars[idx], entries: [entry, ...(cars[idx].entries || [])] };
      saveJSON(CARS_STORAGE_KEY, cars);
      return { result: `Logged ${entry.type} for ${cars[idx].name}`, ok: true };
    }

    // ── Generic domain actions ────────────────────────────────────────────
    if (action.type === 'genericAction') {
      return runGenericAction(p.domain, p.op, p.params ?? p);
    }

    // ── Home Assistant device control ─────────────────────────────────────
    if (action.type === 'controlDevice') {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/ha-control'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ domain: p.domain, service: p.service, entityId: p.entityId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { result: `Couldn't control ${p.entityId}: ${data.error || res.statusText}`, ok: false };
      }
      return { result: `${p.service.replace('_', ' ')}: ${p.entityId}`, ok: true };
    }

    // ── Smart home discovery ──────────────────────────────────────────────
    if (action.type === 'discoverSmartHome') {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/ha-discover'), {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { result: `Couldn't list devices: ${data.error || res.statusText}`, ok: false };
      }
      const data = await res.json();
      const list = (data.entities || [])
        .map((e: any) => `${e.friendly_name} (${e.entity_id}, ${e.state})`)
        .join(', ');
      return { result: data.count ? `Found ${data.count} device(s): ${list}` : 'No controllable devices found', ok: true };
    }

    // ── Targeted notification ───────────────────────────────────────────────
    if (action.type === 'notifyPerson') {
      const target = householdMembers.find(
        (m) => m.name.toLowerCase() === String(p.person || '').toLowerCase()
      );
      if (!target) return { result: `No family member named "${p.person}"`, ok: false };

      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/notify-person'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ personId: target.id, title: p.title || 'Bear House', body: p.body || p.message || '' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { result: `Couldn't notify ${target.name}: ${data.error || res.statusText}`, ok: false };
      }
      return { result: `Notified ${target.name}`, ok: true };
    }

    // ── Member management (superadmin only, enforced server-side too) ──────
    if (action.type === 'manageMember') {
      const token = await getAccessToken();
      if (p.op === 'remove') {
        const target = householdMembers.find(
          (m) => m.name.toLowerCase() === String(p.person || '').toLowerCase()
        );
        if (!target) return { result: `No family member named "${p.person}"`, ok: false };
        const res = await fetch(apiUrl('/api/setup'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ action: 'removeMember', memberId: target.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { result: `Couldn't remove ${target.name}: ${data.error || res.statusText}`, ok: false };
        return { result: `Removed ${target.name} from the family`, ok: true };
      }
      if (p.op === 'updateRole') {
        const target = householdMembers.find(
          (m) => m.name.toLowerCase() === String(p.person || '').toLowerCase()
        );
        if (!target) return { result: `No family member named "${p.person}"`, ok: false };
        const res = await fetch(apiUrl('/api/setup'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ action: 'updateRole', memberId: target.id, role: p.role }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { result: `Couldn't update ${target.name}'s role: ${data.error || res.statusText}`, ok: false };
        return { result: `Updated ${target.name}'s role to ${p.role}`, ok: true };
      }
      return { result: `Unknown member management operation: "${p.op}"`, ok: false };
    }

    // ── Triad Engine query ──────────────────────────────────────────────────
    if (action.type === 'queryTriad') {
      const token = await getAccessToken();
      const queryStr = p.query || p.prompt || 'doctor';
      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: `triad ${queryStr}` }),
      });
      if (!res.ok) {
        return { result: `Couldn't reach Triad engine`, ok: false };
      }
      const data = await res.json();
      let text = data.text || '';
      try {
        const parsed = JSON.parse(text);
        if (parsed.text) text = parsed.text;
      } catch {
        // use raw
      }
      return { result: text || 'Triad query executed', ok: true };
    }

    // ── Memory ─────────────────────────────────────────────────────────────
    if (action.type === 'updateMemory') {
      const note = `[${new Date().toLocaleDateString()}] ${p.memory}`;
      addHermesMemory(note); // household-wide, fire-and-forget
      return { result: `Memory updated`, ok: true };
    }

    return { result: `Unknown action: ${action.type}`, ok: false };
  } catch (e: any) {
    return { result: `Error: ${e?.message}`, ok: false };
  }
}

// ─── Context builder ─────────────────────────────────────────────────────────
