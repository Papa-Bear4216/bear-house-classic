import { describe, it, expect } from 'vitest';
import { reducer } from './use-toast';

const makeToast = (id: string, overrides: Partial<{ open: boolean }> = {}) => ({
  id, open: true, ...overrides,
});

describe('use-toast reducer', () => {
  it('ADD_TOAST prepends and caps the list at TOAST_LIMIT (1)', () => {
    const state = { toasts: [makeToast('a')] };
    const next = reducer(state, { type: 'ADD_TOAST', toast: makeToast('b') as any });
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe('b');
  });

  it('UPDATE_TOAST merges fields into the matching toast by id', () => {
    const state = { toasts: [makeToast('a', { open: true })] };
    const next = reducer(state, { type: 'UPDATE_TOAST', toast: { id: 'a', open: false } as any });
    expect(next.toasts[0].open).toBe(false);
  });

  it('UPDATE_TOAST leaves non-matching toasts untouched', () => {
    const state = { toasts: [makeToast('a')] };
    const next = reducer(state, { type: 'UPDATE_TOAST', toast: { id: 'other', open: false } as any });
    expect(next.toasts[0].open).toBe(true);
  });

  it('DISMISS_TOAST with an id sets open:false only on that toast', () => {
    const state = { toasts: [makeToast('a'), makeToast('b')] };
    const next = reducer(state, { type: 'DISMISS_TOAST', toastId: 'a' });
    expect(next.toasts.find(t => t.id === 'a')?.open).toBe(false);
    expect(next.toasts.find(t => t.id === 'b')?.open).toBe(true);
  });

  it('DISMISS_TOAST with no id sets open:false on every toast', () => {
    const state = { toasts: [makeToast('a'), makeToast('b')] };
    const next = reducer(state, { type: 'DISMISS_TOAST', toastId: undefined });
    expect(next.toasts.every(t => !t.open)).toBe(true);
  });

  it('REMOVE_TOAST with an id removes only that toast', () => {
    const state = { toasts: [makeToast('a'), makeToast('b')] };
    const next = reducer(state, { type: 'REMOVE_TOAST', toastId: 'a' });
    expect(next.toasts.map(t => t.id)).toEqual(['b']);
  });

  it('REMOVE_TOAST with no id clears all toasts', () => {
    const state = { toasts: [makeToast('a'), makeToast('b')] };
    const next = reducer(state, { type: 'REMOVE_TOAST', toastId: undefined });
    expect(next.toasts).toEqual([]);
  });
});
