import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from './firebase-admin';
import { getAuth } from 'firebase-admin/auth';

export async function verifyAuth(req: NextRequest): Promise<boolean> {
  return (await getVerifiedUid(req)) !== null;
}

/** Verifies the bearer token and returns the caller's uid, or null if invalid/missing. */
export async function getVerifiedUid(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
