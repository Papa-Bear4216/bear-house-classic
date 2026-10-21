/** Shared-storage keys read by the server-side Hermes snapshot fallback. */
export const HERMES_SNAPSHOT_KEYS = {
  tasks: 'household_tasks',
  shopping: 'familyos_shopping',
  appointments: 'familyos_appointments',
  promises: 'family_promises',
} as const;
