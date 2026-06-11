'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { useAuth } from './FirebaseProvider';
import { auth, ALLOWED_EMAILS } from '@/lib/firebase';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || pathname === '/login') return;
    if (!user) { router.replace('/login'); return; }
    if (user.email && !ALLOWED_EMAILS.includes(user.email)) {
      signOut(auth).then(() => router.replace('/login'));
    }
  }, [user, loading, pathname, router]);

  if (loading) return (
    <div className="min-h-screen bg-[#facc15] flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-4 border-slate-900 border-t-transparent animate-spin" />
    </div>
  );

  if (pathname === '/login') return <>{children}</>;
  if (!user) return null;
  if (user.email && !ALLOWED_EMAILS.includes(user.email)) return null;

  return <>{children}</>;
}
