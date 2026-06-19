import { useState, useCallback, useEffect } from 'react';
import { CalendarEvent, STORAGE_KEYS, INITIAL_EVENTS } from '../lib/familyos';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function useEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) {
      const stored = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (stored) {
        try {
          setEvents(JSON.parse(stored));
        } catch (e) {
           
          setEvents(INITIAL_EVENTS);
        }
      } else {
         
        setEvents(INITIAL_EVENTS);
      }
       
      setIsLoaded(true);
      return;
    }

    const path = 'events';
    const q = query(collection(db, path), orderBy('date', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fbEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CalendarEvent[];
      
      setEvents(fbEvents.length > 0 ? fbEvents : []);
      if (fbEvents.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(fbEvents));
        } catch (e) {
          console.warn('LocalStorage quota exceeded for events');
        }
      }
      setIsLoaded(true);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        // Continue to fallback
      }
      
      const stored = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (stored) {
        try {
           
          setEvents(JSON.parse(stored));
        } catch (e) {
           
          setEvents(INITIAL_EVENTS);
        }
      } else {
         
        setEvents(INITIAL_EVENTS);
      }
       
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [user]);

  const addEvent = useCallback(async (event: Omit<CalendarEvent, 'id'>) => {
    const path = 'events';
    try {
      // Optimistic update
      const tempId = Math.random().toString(36).substring(7);
      const newEvent = { ...event, id: tempId } as CalendarEvent;
      setEvents(prev => [...prev, newEvent]);
      
      await addDoc(collection(db, path), {
        ...event,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    const path = `events/${id}`;
    try {
      // Optimistic update
      setEvents(prev => prev.filter(e => e.id !== id));
      
      const eventRef = doc(db, 'events', id);
      await deleteDoc(eventRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }, []);

  return { events, isLoaded, addEvent, deleteEvent };
}
