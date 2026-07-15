// api/household.ts
export const config = { runtime: 'edge' };

import {
  dbGetHouseholdMemberByEmail,
  dbGetHouseholdMemberById,
  dbGetHouseholdMembersByHouseholdId,
  dbGetHouseholdId,
  dbCreateHouseholdMember,
} from './_db.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  const body = (await req.json().catch(() => ({}))) as any;
  const { action, ...params } = body;

  if (action === 'getMemberByEmail') {
    const { email } = params;
    if (!email) return j({ error: 'Missing email' }, 400);
    const member = await dbGetHouseholdMemberByEmail(email);
    return j({ member });
  }

  if (action === 'getMemberById') {
    const { id } = params;
    if (!id) return j({ error: 'Missing id' }, 400);
    const member = await dbGetHouseholdMemberById(id);
    return j({ member });
  }

  if (action === 'getMembersByHouseholdId') {
    const { householdId } = params;
    if (!householdId) return j({ error: 'Missing householdId' }, 400);
    const members = await dbGetHouseholdMembersByHouseholdId(householdId);
    return j({ members });
  }

  if (action === 'getHouseholdId') {
    const householdId = await dbGetHouseholdId();
    return j({ householdId });
  }

  if (action === 'createMember') {
    const { id, name, email, role, color, householdId } = params;
    if (!id || !name || !email || !role || !color || !householdId) {
      return j({ error: 'Missing required member fields' }, 400);
    }
    try {
      await dbCreateHouseholdMember({ id, name, email, role, color, household_id: householdId });
      return j({ ok: true });
    } catch (e: any) {
      return j({ error: e?.message || 'createMember failed' }, 500);
    }
  }

  return j({ error: 'Unknown action. Use: getMemberByEmail, getMemberById, getMembersByHouseholdId, getHouseholdId, createMember' }, 400);
}
