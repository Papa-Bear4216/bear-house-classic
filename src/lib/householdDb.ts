// Client-side shim for api/household.ts — proxies household_members reads/writes
// through the server (service_role key never reaches the browser).

interface HouseholdMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  color: string;
  household_id: string;
  pin_hash: string | null;
}

async function call<T>(action: string, params: object = {}): Promise<T> {
  const res = await fetch('/api/household', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) throw new Error(`householdDb(${action}) failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function dbGetHouseholdMemberByEmail(email: string): Promise<HouseholdMember | null> {
  const { member } = await call<{ member: HouseholdMember | null }>('getMemberByEmail', { email });
  return member;
}

export async function dbGetHouseholdMemberById(id: string): Promise<HouseholdMember | null> {
  const { member } = await call<{ member: HouseholdMember | null }>('getMemberById', { id });
  return member;
}

export async function dbGetHouseholdMembersByHouseholdId(householdId: string): Promise<HouseholdMember[]> {
  const { members } = await call<{ members: HouseholdMember[] }>('getMembersByHouseholdId', { householdId });
  return members;
}

export async function dbGetHouseholdId(): Promise<string | null> {
  const { householdId } = await call<{ householdId: string | null }>('getHouseholdId');
  return householdId;
}

export async function dbCreateHouseholdMember(member: {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  household_id: string;
}): Promise<void> {
  await call<{ ok: true }>('createMember', {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    color: member.color,
    householdId: member.household_id,
  });
}
