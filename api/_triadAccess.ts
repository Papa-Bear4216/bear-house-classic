// Triad is a private tool running on the owner's own machine (TRIAD_URL). It
// is scoped to the owner's household only — no other household may query the
// daemon, read its telemetry, or fire its alerts.
//
// TRIAD_HOUSEHOLD_ID (comma-separated for more than one) lists the allowed
// household ids. Unset = fail closed: nobody gets Triad.
export function isTriadHousehold(householdId: string | null | undefined): boolean {
  if (!householdId) return false;
  const allowed = (process.env.TRIAD_HOUSEHOLD_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(householdId);
}
