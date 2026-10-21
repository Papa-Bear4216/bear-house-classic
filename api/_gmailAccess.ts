// gmail.readonly is a Google "restricted" scope: until the app passes Google verification + CASA,
// only approved testers may connect. Households that already have a connection are grandfathered.
import { dbGetHouseholdGmailStatus } from './_db.js';

export async function gmailConnectAllowed(householdId: string): Promise<boolean> {
  const allow = (process.env.GMAIL_ALLOWED_HOUSEHOLDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allow.includes(householdId)) return true;
  try {
    const rows = await dbGetHouseholdGmailStatus(householdId);
    return rows.some(r => !!r.gmail_connected_email);
  } catch {
    return false; // fail closed
  }
}
