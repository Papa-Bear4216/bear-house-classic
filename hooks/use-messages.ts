'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, limit } from 'firebase/firestore';

export interface Message {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userColor: string;
  avatarUrl?: string;
  createdAt: { seconds: number; nanoseconds: number } | null;
}

export function useMessages(familyCode?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !familyCode) { setLoading(false); return; }
    const ref = collection(db, 'familyMessages', familyCode, 'messages');
    const q = query(ref, orderBy('createdAt', 'asc'), limit(200));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
      setLoading(false);
    });
    return unsub;
  }, [familyCode]);

  async function sendMessage(params: {
    text: string;
    userId: string;
    userName: string;
    userColor: string;
    avatarUrl?: string;
  }) {
    if (!db || !familyCode || !params.text.trim()) return;
    await addDoc(collection(db, 'familyMessages', familyCode, 'messages'), {
      ...params,
      text: params.text.trim(),
      createdAt: serverTimestamp(),
    });
  }

  return { messages, loading, sendMessage };
}
