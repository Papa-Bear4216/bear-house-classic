import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from './firebase-admin';
import { getAuth } from 'firebase-admin/auth';

export async function verifyAuth(req: NextRequest): Promise<boolean> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return false;
  try {
    const auth = getAuth(getAdminApp());
    await auth.verifyIdToken(token);
    return true;
  } catch {
    return false;
  }
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
