'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppUser, Role } from '../lib/familyos';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

// Email → profile defaults for the Bear House family
const EMAIL_PROFILES: Record<string, { name: string; role: Role; color: string }> = {
  'michael711hebert@gmail.com': { name: 'Daddy (Mike)',  role: 'superadmin', color: 'bg-blue-500'   },
  'hpfanatic009@gmail.com':     { name: 'Mommy (Gwen)', role: 'admin',       color: 'bg-pink-500'   },
  'littlebear8991@gmail.com':   { name: 'Julia',         role: 'child',       color: 'bg-green-500'  },
  'jchebert2010@gmail.com':     { name: 'Abriana',       role: 'child',       color: 'bg-yellow-500' },
};

const FAMILY_CODE = 'BEAR12';

type CurrentUserContextType = {
  currentUser: AppUser | null;
  setCurrentUser: (id: string) => void;
};

const CurrentUserContext = createContext<CurrentUserContextType>({
  currentUser: null,
  setCurrentUser: () => {},
});

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [currentUser, setCurrentUserState] = useState<AppUser | null>(null);

  // Always follow the authenticated Firebase user
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        localStorage.removeItem('viewing_user_id');
        setViewingId(user.uid);
      } else {
        setViewingId(null);
        setCurrentUserState(null);
      }
    });
    return unsub;
  }, []);

  // Subscribe to the Firestore user document; auto-create it on first sign-in
  useEffect(() => {
    if (!viewingId) return;
    const unsub = onSnapshot(doc(db, 'users', viewingId), async (snap) => {
      if (snap.exists()) {
        setCurrentUserState({ ...snap.data(), id: snap.id } as AppUser);
      } else {
        // First sign-in — create the user document from their Google profile
        const googleUser = auth.currentUser;
        if (!googleUser) return;

        const email = googleUser.email ?? '';
        const profile = EMAIL_PROFILES[email];
        const newUser: AppUser = {
          id: viewingId,
          name: profile?.name ?? googleUser.displayName ?? email.split('@')[0],
          color: profile?.color ?? 'bg-slate-500',
          role: profile?.role ?? 'child',
          points: 0,
          familyCode: FAMILY_CODE,
          avatarUrl: googleUser.photoURL ?? undefined,
        };

        try {
          await setDoc(doc(db, 'users', viewingId), {
            ...newUser,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          // setCurrentUserState will fire from the next onSnapshot callback
        } catch (err) {
          console.error('Failed to create user doc:', err);
          // Still set it locally so the app doesn't hang
          setCurrentUserState(newUser);
        }
      }
    }, (err) => {
      console.error('useCurrentUser Firestore error:', err);
    });
    return unsub;
  }, [viewingId]);

  const setCurrentUser = (id: string) => setViewingId(id);

  return (
    <CurrentUserContext.Provider value={{ currentUser, setCurrentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export const useCurrentUser = () => useContext(CurrentUserContext);
