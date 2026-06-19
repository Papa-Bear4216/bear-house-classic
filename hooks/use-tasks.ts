import { useState, useCallback, useEffect } from 'react';
import { Task, STORAGE_KEYS, INITIAL_TASKS } from '../lib/familyos';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) {
      const stored = localStorage.getItem(STORAGE_KEYS.TASKS);
      if (stored) {
        try {
          setTasks(JSON.parse(stored));
        } catch (e) {
           
          setTasks(INITIAL_TASKS);
        }
      } else {
         
        setTasks(INITIAL_TASKS);
      }
       
      setIsLoaded(true);
      return;
    }

    const path = 'tasks';
    const q = query(collection(db, path), orderBy('date', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fbTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      
      setTasks(fbTasks.length > 0 ? fbTasks : []);
      if (fbTasks.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(fbTasks));
        } catch (e) {
          console.warn('LocalStorage quota exceeded for tasks');
        }
      }
      setIsLoaded(true);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        // Silently continue to fallback after logging
      }
      
      // Fallback to local storage on permission error or offline
      const stored = localStorage.getItem(STORAGE_KEYS.TASKS);
      if (stored) {
        try {
           
          setTasks(JSON.parse(stored));
        } catch (e) {
           
          setTasks(INITIAL_TASKS);
        }
      } else {
         
        setTasks(INITIAL_TASKS);
      }
       
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [user]);

  const addTask = useCallback(async (task: Omit<Task, 'id'>) => {
    const path = 'tasks';
    try {
      // Optimistic update
      const tempId = Math.random().toString(36).substring(7);
      const newTask = { ...task, id: tempId } as Task;
      setTasks(prev => [...prev, newTask]);
      
      await addDoc(collection(db, path), {
        ...task,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }, []);

  const updateTaskStatus = useCallback(async (id: string, newStatus: 'todo' | 'pending' | 'done') => {
    const path = `tasks/${id}`;
    try {
      // Optimistic update
      setTasks(prev => prev.map(t => 
        t.id === id ? { ...t, status: newStatus, completed: newStatus === 'done' } : t
      ));
      
      const taskRef = doc(db, 'tasks', id);
      await updateDoc(taskRef, { 
        status: newStatus, 
        completed: newStatus === 'done',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    const path = `tasks/${id}`;
    try {
      // Optimistic update
      setTasks(prev => prev.filter(t => t.id !== id));
      
      const taskRef = doc(db, 'tasks', id);
      await deleteDoc(taskRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }, []);

  return { tasks, isLoaded, addTask, updateTaskStatus, deleteTask };
}

