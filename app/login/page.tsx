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
    <div className="min-h-screen bg-[#facc15] flex flex-col items-center justify-center p-6">
      <div className="bg-white p-8 rounded-[2rem] border-4 border-slate-900 shadow-[8px_8px_0_#1e293b] flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full border-4 border-slate-900 border-t-transparent animate-spin" />
        <p className="font-display font-black text-xl text-slate-900 uppercase">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#facc15] flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <main className="w-full max-w-md my-8">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl font-black tracking-tighter text-slate-900 uppercase flex items-center justify-center gap-2 drop-shadow-[2px_2px_0_rgba(255,255,255,1)]">
            Bear House <Sparkles className="w-8 h-8 text-[#be185d] fill-[#be185d]" />
          </h1>
          <p className="text-slate-900 font-bold mt-2 text-sm uppercase tracking-wide bg-white inline-block px-3 py-1 border-2 border-slate-900 shadow-[2px_2px_0_#1e293b]">
            Family Members Only
          </p>
        </div>

        <div className="bg-white rounded-[2rem] border-4 border-slate-900 shadow-[8px_8px_0_#1e293b] overflow-hidden">
          <AnimatePresence mode="wait">
            {!needsOnboarding ? (
              <motion.div key="auth" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="p-6 sm:p-8 space-y-6">
                {error && (
                  <div className="p-4 bg-red-100 border-2 border-red-500 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
                    <Shield className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="text-center space-y-2">
                  <p className="text-slate-600 text-sm font-medium">Sign in with your Bear House Google account.</p>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-4 bg-white text-slate-900 font-bold text-sm uppercase tracking-wider rounded-xl border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all flex items-center justify-center gap-3"
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
              <motion.div key="onboard" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="p-6 sm:p-8 space-y-6">
                {onboardStep === 'choice' && (
                  <div className="space-y-6 text-center">
                    <h2 className="font-display font-black text-2xl uppercase tracking-tight text-slate-900">Welcome to Bear House!</h2>
                    <p className="text-slate-600 text-sm font-medium leading-relaxed">
                      Let&apos;s set up your family system. Create a new family unit or join an existing one with a code.
                    </p>
                    <div className="grid grid-cols-1 gap-4">
                      <button onClick={() => setOnboardStep('create')} className="p-5 bg-[#c084fc] hover:bg-[#b074ec] border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] rounded-2xl flex flex-col items-center gap-1 transition-all hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95">
                        <UserPlus className="w-8 h-8 text-slate-900" />
                        <span className="font-display font-black text-lg uppercase text-slate-900">Create New Family</span>
                        <span className="text-xs font-bold text-slate-800">For home administrators</span>
                      </button>
                      <button onClick={() => setOnboardStep('join')} className="p-5 bg-[#ccff00] hover:bg-[#bceb00] border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] rounded-2xl flex flex-col items-center gap-1 transition-all hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95">
                        <Key className="w-8 h-8 text-slate-900" />
                        <span className="font-display font-black text-lg uppercase text-slate-900">Join Existing Family</span>
                        <span className="text-xs font-bold text-slate-800">Requires a family invitation code</span>
                      </button>
                    </div>
                  </div>
                )}

                {onboardStep === 'create' && (
                  <form onSubmit={handleCreateFamily} className="space-y-6">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setOnboardStep('choice')} className="text-xs font-black uppercase text-slate-500 hover:text-slate-900">&larr; Back</button>
                      <h2 className="font-display font-black text-xl uppercase tracking-tight text-slate-900 ml-auto">Create Your Family</h2>
                    </div>
                    {error && <div className="p-3 bg-red-100 border-2 border-red-500 text-red-800 rounded-xl text-xs font-bold">{error}</div>}
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1"><User className="w-3.5 h-3.5" /> Your Name</label>
                      <input type="text" required value={userName} onChange={e => setUserName(e.target.value)} placeholder="E.G. MICHAEL" className="w-full px-4 py-3 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] focus:outline-none text-sm font-bold bg-white text-slate-900 uppercase" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-700">Profile Color</label>
                      <div className="flex flex-wrap gap-2">
                        {colors.map(c => <button key={c.value} type="button" onClick={() => setUserColor(c.value)} className={`w-8 h-8 rounded-full border-2 border-slate-900 transition-all ${c.value} ${userColor === c.value ? 'ring-4 ring-slate-900 scale-110' : ''}`} title={c.name} />)}
                      </div>
                    </div>
                    <button type="submit" disabled={!userName.trim()} className="w-full py-3 bg-[#c084fc] text-slate-900 font-display font-black text-lg uppercase tracking-wider rounded-xl border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                      <Sparkles className="w-5 h-5" /> Generate Family OS!
                    </button>
                  </form>
                )}

                {onboardStep === 'join' && (
                  <form onSubmit={handleJoinFamily} className="space-y-6">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setOnboardStep('choice')} className="text-xs font-black uppercase text-slate-500 hover:text-slate-900">&larr; Back</button>
                      <h2 className="font-display font-black text-xl uppercase tracking-tight text-slate-900 ml-auto">Join a Family</h2>
                    </div>
                    {error && <div className="p-3 bg-red-100 border-2 border-red-500 text-red-800 rounded-xl text-xs font-bold">{error}</div>}
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1"><Key className="w-3.5 h-3.5" /> Family Code</label>
                      <input type="text" required value={familyCodeInput} onChange={e => setFamilyCodeInput(e.target.value)} placeholder="E.G. BEAR12" className="w-full px-4 py-3 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] focus:outline-none text-sm font-mono font-black bg-white text-slate-900 uppercase text-center" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1"><User className="w-3.5 h-3.5" /> Your Name</label>
                      <input type="text" required value={userName} onChange={e => setUserName(e.target.value)} placeholder="E.G. JULIA" className="w-full px-4 py-3 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] focus:outline-none text-sm font-bold bg-white text-slate-900 uppercase" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-700">Profile Color</label>
                      <div className="flex flex-wrap gap-2">
                        {colors.map(c => <button key={c.value} type="button" onClick={() => setUserColor(c.value)} className={`w-8 h-8 rounded-full border-2 border-slate-900 transition-all ${c.value} ${userColor === c.value ? 'ring-4 ring-slate-900 scale-110' : ''}`} title={c.name} />)}
                      </div>
                    </div>
                    <button type="submit" disabled={!userName.trim() || !familyCodeInput.trim()} className="w-full py-3 bg-[#ccff00] text-slate-900 font-display font-black text-lg uppercase tracking-wider rounded-xl border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                      <ChevronRight className="w-5 h-5" /> Join and Sync
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
