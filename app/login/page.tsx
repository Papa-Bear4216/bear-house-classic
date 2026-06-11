'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, signInWithGoogle, ALLOWED_EMAILS } from '@/lib/firebase';
import { AppUser } from '@/lib/familyos';
import { Sparkles, Key, User, Shield, ChevronRight, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardStep, setOnboardStep] = useState<'choice' | 'create' | 'join'>('choice');

  const [userName, setUserName] = useState('');
  const [userColor, setUserColor] = useState('bg-blue-500');
  const [familyCodeInput, setFamilyCodeInput] = useState('');

  const colors = [
    { name: 'Blue', value: 'bg-blue-500' },
    { name: 'Pink', value: 'bg-pink-500' },
    { name: 'Green', value: 'bg-green-500' },
    { name: 'Yellow', value: 'bg-yellow-500' },
    { name: 'Purple', value: 'bg-purple-500' },
    { name: 'Indigo', value: 'bg-indigo-500' },
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!ALLOWED_EMAILS.includes(user.email ?? '')) {
          await signOut(auth);
          setError('This app is for the Bear House family only.');
          setLoading(false);
          return;
        }
        setFbUser(user);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          localStorage.setItem('current_user_id', user.uid);
          router.push('/');
        } else {
          setNeedsOnboarding(true);
        }
      } else {
        setFbUser(null);
        setNeedsOnboarding(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
      setLoading(false);
    }
  };

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbUser || !userName.trim()) return;
    setLoading(true);
    const newFamilyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newUserDoc: AppUser = {
      id: fbUser.uid, name: userName.trim(), color: userColor,
      role: 'superadmin', points: 0, familyCode: newFamilyCode,
    };
    try {
      await setDoc(doc(db, 'users', fbUser.uid), newUserDoc);
      localStorage.setItem('current_user_id', fbUser.uid);
      router.push('/');
    } catch {
      setError('Failed to create family profile. Check Firestore rules.');
      setLoading(false);
    }
  };

  const handleJoinFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbUser || !familyCodeInput.trim() || !userName.trim()) return;
    setLoading(true);
    setError(null);
    const targetCode = familyCodeInput.trim().toUpperCase();
    try {
      const q = query(collection(db, 'users'), where('familyCode', '==', targetCode));
      const snap = await getDocs(q);
      if (snap.empty) {
        setError('No family found with that code.');
        setLoading(false);
        return;
      }
      const newUserDoc: AppUser = {
        id: fbUser.uid, name: userName.trim(), color: userColor,
        role: 'child', points: 0, familyCode: targetCode,
      };
      await setDoc(doc(db, 'users', fbUser.uid), newUserDoc);
      localStorage.setItem('current_user_id', fbUser.uid);
      router.push('/');
    } catch {
      setError('Error joining family. Check Firestore permissions.');
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#020817] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-slate-700 border-t-indigo-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020817] flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <main className="w-full max-w-sm my-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-black">FO</span>
          </div>
          <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-2">
            Bear House <Sparkles className="w-6 h-6 text-violet-400" />
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Family members only</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          <AnimatePresence mode="wait">
            {!needsOnboarding ? (
              <motion.div key="auth" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="p-6 space-y-5">
                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-500/40 text-red-400 rounded-xl text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <p className="text-slate-400 text-sm text-center">Sign in with your Bear House Google account.</p>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#ea4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.3 1 3.4 3.7 1.5 7.7l3.7 2.9C6.1 7.4 8.8 5 12 5z"/>
                    <path fill="#4285f4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.5H12v4.8h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                    <path fill="#fbbc05" d="M5.2 14.8c-.3-.8-.4-1.7-.4-2.8s.1-2 .4-2.8L1.5 6.3C.5 8.1 0 10 0 12s.5 3.9 1.5 5.7l3.7-2.9z"/>
                    <path fill="#34a853" d="M12 23c3.2 0 6-1.1 8-2.9l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.2 0-5.9-2.4-6.8-5.6l-3.7 2.9C3.4 20.3 7.3 23 12 23z"/>
                  </svg>
                  Sign in with Google
                </button>
              </motion.div>
            ) : (
              <motion.div key="onboard" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="p-6 space-y-5">
                {onboardStep === 'choice' && (
                  <div className="space-y-4 text-center">
                    <h2 className="text-xl font-bold text-white">Welcome to Bear House!</h2>
                    <p className="text-slate-400 text-sm">Create a new family or join an existing one with a code.</p>
                    <div className="grid grid-cols-1 gap-3">
                      <button onClick={() => setOnboardStep('create')} className="p-4 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 rounded-xl flex flex-col items-center gap-1 transition-colors">
                        <UserPlus className="w-6 h-6 text-indigo-400" />
                        <span className="font-semibold text-white text-sm">Create New Family</span>
                        <span className="text-xs text-slate-500">For home administrators</span>
                      </button>
                      <button onClick={() => setOnboardStep('join')} className="p-4 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 rounded-xl flex flex-col items-center gap-1 transition-colors">
                        <Key className="w-6 h-6 text-violet-400" />
                        <span className="font-semibold text-white text-sm">Join Existing Family</span>
                        <span className="text-xs text-slate-500">Requires a family invitation code</span>
                      </button>
                    </div>
                  </div>
                )}

                {onboardStep === 'create' && (
                  <form onSubmit={handleCreateFamily} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setOnboardStep('choice')} className="text-xs text-slate-500 hover:text-slate-300">&larr; Back</button>
                      <h2 className="font-bold text-white ml-auto">Create Your Family</h2>
                    </div>
                    {error && <div className="p-3 bg-red-900/30 border border-red-500/40 text-red-400 rounded-xl text-xs">{error}</div>}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1"><User className="w-3 h-3" /> Your Name</label>
                      <input type="text" required value={userName} onChange={e => setUserName(e.target.value)} placeholder="Michael" className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 focus:outline-none focus:border-indigo-500 text-sm text-white placeholder-slate-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Profile Color</label>
                      <div className="flex flex-wrap gap-2">
                        {colors.map(c => <button key={c.value} type="button" onClick={() => setUserColor(c.value)} className={`w-7 h-7 rounded-full border-2 transition-all ${c.value} ${userColor === c.value ? 'border-white scale-110' : 'border-transparent'}`} title={c.name} />)}
                      </div>
                    </div>
                    <button type="submit" disabled={!userName.trim()} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                      <Sparkles className="w-4 h-4" /> Create Family OS
                    </button>
                  </form>
                )}

                {onboardStep === 'join' && (
                  <form onSubmit={handleJoinFamily} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setOnboardStep('choice')} className="text-xs text-slate-500 hover:text-slate-300">&larr; Back</button>
                      <h2 className="font-bold text-white ml-auto">Join a Family</h2>
                    </div>
                    {error && <div className="p-3 bg-red-900/30 border border-red-500/40 text-red-400 rounded-xl text-xs">{error}</div>}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1"><Key className="w-3 h-3" /> Family Code</label>
                      <input type="text" required value={familyCodeInput} onChange={e => setFamilyCodeInput(e.target.value)} placeholder="BEAR12" className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 focus:outline-none focus:border-indigo-500 text-sm font-mono text-white placeholder-slate-500 uppercase text-center tracking-widest" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1"><User className="w-3 h-3" /> Your Name</label>
                      <input type="text" required value={userName} onChange={e => setUserName(e.target.value)} placeholder="Julia" className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 focus:outline-none focus:border-indigo-500 text-sm text-white placeholder-slate-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Profile Color</label>
                      <div className="flex flex-wrap gap-2">
                        {colors.map(c => <button key={c.value} type="button" onClick={() => setUserColor(c.value)} className={`w-7 h-7 rounded-full border-2 transition-all ${c.value} ${userColor === c.value ? 'border-white scale-110' : 'border-transparent'}`} title={c.name} />)}
                      </div>
                    </div>
                    <button type="submit" disabled={!userName.trim() || !familyCodeInput.trim()} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                      <ChevronRight className="w-4 h-4" /> Join and Sync
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
