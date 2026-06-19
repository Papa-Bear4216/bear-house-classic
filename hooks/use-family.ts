import { useState, useCallback, useEffect, useRef } from 'react';
import { AppUser, Role, USERS as INITIAL_USERS, STORAGE_KEYS } from '../lib/familyos';
import { generateFamilyAvatar } from '../lib/avatar-service';
import { 
  collection, 
  onSnapshot, 
  setDoc,
  doc, 
  serverTimestamp,
  query,
  updateDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function useFamilyMembers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  const generatingRef = useRef<Set<string>>(new Set());

  // Subscribe to users collection
  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) {
      const stored = localStorage.getItem(STORAGE_KEYS.POINTS);
      if (stored) {
        try {
          setUsers(JSON.parse(stored));
        } catch (e) {
           
          setUsers(INITIAL_USERS);
        }
      } else {
         
        setUsers(INITIAL_USERS);
      }
       
      setIsLoaded(true);
      return;
    }

    const path = 'users';
    const q = query(collection(db, path));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fbUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AppUser[];
      
      if (fbUsers.length === 0) {
        // Initial seeding if collection is empty
        const seedUsers = async () => {
          try {
            for (const user of INITIAL_USERS) {
              await setDoc(doc(db, 'users', user.id), {
                ...user,
                createdAt: serverTimestamp()
              });
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, path);
          }
        };
        seedUsers().catch(console.error);
        fbUsers = INITIAL_USERS;
      }
      
      // Deduplicate by ID
      const deduplicated = Array.from(new Map(fbUsers.map(u => [u.id, u])).values());
      setUsers(deduplicated);
      
      try {
        localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(deduplicated));
      } catch (e) {
        console.warn('LocalStorage quota exceeded for users');
      }
      setIsLoaded(true);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        // Logged already
      }
      
      // Fallback
      const stored = localStorage.getItem(STORAGE_KEYS.POINTS);
      if (stored) {
        try {
           
          setUsers(JSON.parse(stored));
        } catch (e) {
           
          setUsers(INITIAL_USERS);
        }
      } else {
         
        setUsers(INITIAL_USERS);
      }
       
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [user]);

  const updateAvatar = useCallback(async (userId: string, avatarUrl: string) => {
    const path = `users/${userId}`;
    try {
      // Optimistic update
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, avatarUrl } : u));
      
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { 
        avatarUrl,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
       // If document doesn't exist yet, we might need setDoc, but it should exist from loadFamily
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }, []);

  const updatePoints = useCallback(async (userId: string, delta: number) => {
    const path = `users/${userId}`;
    try {
      setUsers(prev => {
        const user = prev.find(u => u.id === userId);
        if (!user) return prev;
        const newPoints = user.points + delta;
        
        // Push update to Firebase in the background
        const userRef = doc(db, 'users', userId);
        updateDoc(userRef, { 
          points: newPoints,
          updatedAt: serverTimestamp()
        }).catch(err => {
          handleFirestoreError(err, OperationType.UPDATE, path);
        });
        
        return prev.map(u => u.id === userId ? { ...u, points: newPoints } : u);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }, []);

  const addUser = useCallback(async (user: AppUser) => {
    const path = `users`;
    try {
      setUsers(prev => {
        if (prev.find(u => u.id === user.id)) return prev;
        return [...prev, user];
      });
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, {
        ...user,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }, []);

  const updateUserRole = useCallback(async (userId: string, role: Role) => {
    const path = `users/${userId}`;
    try {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { 
        role,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }, []);

  const generateFamilyCode = useCallback(() => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }, []);

  // Automatically generate missing avatars
  useEffect(() => {
    if (!isLoaded || users.length === 0) return;

    const generateMissing = async () => {
      for (const user of users) {
        if (!user.avatarUrl && !generatingRef.current.has(user.id)) {
          generatingRef.current.add(user.id);
          try {
            const url = await generateFamilyAvatar(user.name, user.color);
            if (url) {
              await updateAvatar(user.id, url);
            }
          } catch (e) {
            console.error(`Failed to generate avatar for ${user.name}`, e);
          } finally {
            // Rate limit generation
            await new Promise(resolve => setTimeout(resolve, 5000));
            generatingRef.current.delete(user.id);
          }
        }
      }
    };
    generateMissing().catch(console.error);
  }, [isLoaded, users, updateAvatar]);

  return { users, isLoaded, updatePoints, updateAvatar, addUser, updateUserRole, generateFamilyCode };
}
