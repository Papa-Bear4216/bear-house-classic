import { auth } from './firebase';

// Returns the household/family ID for the current user.
// Family documents are keyed by the authenticated user's UID.
export async function getMyFamilyId(): Promise<string> {
  const user = auth.currentUser;
  if (user) return user.uid;

  // If no user yet, wait for auth to initialize
  return new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      if (u) resolve(u.uid);
      else reject(new Error('Not authenticated'));
    });
  });
}
