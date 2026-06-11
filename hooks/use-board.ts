import { useState, useEffect, useCallback } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, isPlaceholder } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export type BoardPost = {
  id: string;
  authorId: string;
  content: string;
  type: 'note' | 'shopping' | 'alert';
  createdAt?: any;
};

export function useBoard() {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoaded(true);
      return;
    }

    const q = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BoardPost[];
      
      setPosts(postsData);
      setIsLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'posts');
    });

    return () => unsubscribe();
  }, [user]);

  const addPost = useCallback(async (postData: Omit<BoardPost, 'id' | 'createdAt'>) => {
    const newId = Math.random().toString(36).substring(7);
    const postRef = doc(db, 'posts', newId);
    try {
      await setDoc(postRef, {
        id: newId,
        ...postData,
        createdAt: serverTimestamp()
      });
    } catch (error) {
       handleFirestoreError(error, OperationType.CREATE, 'posts');
    }
  }, []);

  const deletePost = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'posts', id));
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, 'posts');
    }
  }, []);

  return {
    posts,
    isLoaded,
    addPost,
    deletePost
  };
}
