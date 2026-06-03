import React, { useState, useEffect, useRef } from 'react';
import { USERS, setSession, User } from '@/lib/familyos';
import { GOOGLE_CLIENT_ID, decodeGoogleJWT, matchUserByEmail, requestAccessToken } from '@/lib/auth';
import { ChevronLeft, Loader2, ShieldAlert } from 'lucide-react';

interface LoginProps { onAuth: () => void; }

const COLOR_BG: Record<string, string> = {
  indigo: 'bg-indigo-600 hover:bg-indigo-500',
  pink: 'bg-pink-600 hover:bg-pink-500',
  purple: 'bg-purple-600 hover:bg-purple-500',
  blue: 'bg-blue-600 hover:bg-blue-500',
};
const COLOR_RING: Record<string, string> = {
  indigo: 'ring-indigo-500', pink: 'ring-pink-500', purple: 'ring-purple-500', blue: 'ring-blue-500',
};

type Phase = 'select' | 'google_loading' | 'pin' | 'error';

const PIN_USER_ID = 'abriana'; // only user without Google account

const Login: React.FC<LoginProps> = ({ onAuth }) => {
  const [phase, setPhase] = useState<Phase>('select');
  const [gsiReady, setGsiReady] = useState(false);
  const [pinUser, setPinUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Load Google Identity Services
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      (window as any).google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      setGsiReady(true);
    };
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  // Render Google button once GSI is ready
  useEffect(() => {
    if (gsiReady && googleBtnRef.current) {
      (window as any).google?.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'rectangular',
        width: 320,
        text: 'signin_with',
      });
    }
  }, [gsiReady, phase]);

  const handleGoogleCredential = (response: { credential: string }) => {
    setPhase('google_loading');
    setError('');
    const info = decodeGoogleJWT(response.credential);
    if (!info) { setError('Could not read Google account. Try again.'); setPhase('select'); return; }

    const user = matchUserByEmail(info.email);
    if (!user) {
      setError(`${info.email} isn't registered in Bear House. Ask Daddy to add your account.`);
      setPhase('error');
      return;
    }

    // Request access token (Calendar + Gmail scopes)
    requestAccessToken(
      (_token) => {
        setSession(user.id, user.role);
        onAuth();
      },
      (err) => {
        // Token request declined or failed — still allow login, just without Gmail/Calendar
        console.warn('Scope request declined:', err);
        setSession(user.id, user.role);
        onAuth();
      }
    );
  };

  // PIN login for Abriana (no Google account)
  const handlePinUser = (user: User) => {
    setPinUser(user);
    setPin('');
    setConfirm('');
    setError('');
    setPhase('pin');
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinUser) return;
    const pinKey = `familyos_pin_${pinUser.id}`;
    const savedPin = localStorage.getItem(pinKey);
    if (!savedPin) {
      if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
      if (pin !== confirm) { setError('PINs do not match.'); return; }
      localStorage.setItem(pinKey, pin);
      setSession(pinUser.id, pinUser.role);
      onAuth();
    } else {
      if (pin === savedPin) { setSession(pinUser.id, pinUser.role); onAuth(); }
      else { setError('Wrong PIN.'); setPin(''); }
    }
  };

  const handleNumKey = (digit: string, field: 'pin' | 'confirm') => {
    const setter = field === 'pin' ? setPin : setConfirm;
    const val = field === 'pin' ? pin : confirm;
    if (digit === 'back') setter(val.slice(0, -1));
    else if (digit === 'clear') setter('');
    else if (val.length < 8) setter(val + digit);
  };

  // ── PIN screen ──────────────────────────────────────────────────────────────
  if (phase === 'pin' && pinUser) {
    const isNew = !localStorage.getItem(`familyos_pin_${pinUser.id}`);
    const c = pinUser.color;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <button onClick={() => { setPhase('select'); setError(''); }} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-6">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-center mb-6">
            <div className={`w-20 h-20 rounded-2xl ${COLOR_BG[c]?.split(' ')[0]} flex items-center justify-center font-bold text-3xl mx-auto mb-3 ring-2 ${COLOR_RING[c]} ring-offset-2 ring-offset-slate-950`}>
              {pinUser.name[0]}
            </div>
            <h2 className="text-xl font-bold text-white">{pinUser.name}</h2>
            <p className="text-sm text-slate-400 mt-0.5">{isNew ? 'Create a PIN' : 'Enter your PIN'}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div className="flex gap-2 justify-center">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <div key={i} className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${i < pin.length ? `border-${c}-500 bg-${c}-600/20 text-white` : 'border-slate-600 bg-slate-900'}`}>
                    {i < pin.length ? '●' : ''}
                  </div>
                ))}
              </div>
              {isNew && (
                <>
                  <p className="text-slate-400 text-xs text-center">Confirm PIN</p>
                  <div className="flex gap-2 justify-center">
                    {Array.from({ length: Math.max(4, confirm.length) }).map((_, i) => (
                      <div key={i} className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${i < confirm.length ? `border-${c}-500 bg-${c}-600/20 text-white` : 'border-slate-600 bg-slate-900'}`}>
                        {i < confirm.length ? '●' : ''}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {error && <p className="text-rose-400 text-sm text-center">{error}</p>}
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','clear','0','back'].map((k) => (
                  <button key={k} type="button"
                    onClick={() => {
                      const field = isNew && pin.length >= 4 ? 'confirm' : 'pin';
                      handleNumKey(k, field);
                    }}
                    className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg transition"
                  >{k === 'back' ? '⌫' : k === 'clear' ? 'C' : k}</button>
                ))}
              </div>
              <button type="submit" className={`w-full ${COLOR_BG[c]} text-white font-semibold py-3 rounded-lg transition`}>
                {isNew ? 'Set PIN & Enter' : 'Unlock'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Error screen ────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <p className="text-white font-semibold">Account not recognized</p>
          <p className="text-slate-400 text-sm">{error}</p>
          <button onClick={() => { setError(''); setPhase('select'); }} className="px-6 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm transition">
            Try a different account
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (phase === 'google_loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">Signing you in…</span>
        </div>
      </div>
    );
  }

  // ── Main select screen ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center font-bold text-2xl mx-auto mb-4 shadow-xl shadow-indigo-500/20">
            🐻
          </div>
          <h1 className="text-3xl font-bold text-white">Bear House</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in with your Google account</p>
        </div>

        <div className="flex flex-col items-center gap-6">
          {/* Google Sign-In button */}
          {GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} className="rounded-xl overflow-hidden" />
          ) : (
            <div className="bg-slate-800/60 border border-amber-500/40 text-amber-300 text-sm rounded-xl px-4 py-3 text-center max-w-xs">
              Google login not configured yet. Ask Daddy to add the Google Client ID in Settings.
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 w-full max-w-xs">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-slate-500 text-xs">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Abriana PIN login (no Google account) */}
          {USERS.filter(u => !u.email).map(user => (
            <button
              key={user.id}
              onClick={() => handlePinUser(user)}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-purple-500/60 hover:bg-slate-800 transition w-full max-w-xs`}
            >
              <div className={`w-9 h-9 rounded-lg ${COLOR_BG[user.color]?.split(' ')[0]} flex items-center justify-center font-bold text-base`}>
                {user.name[0]}
              </div>
              <div className="text-left">
                <div className="text-white text-sm font-medium">{user.name}</div>
                <div className="text-slate-400 text-xs">Sign in with PIN</div>
              </div>
            </button>
          ))}

          <p className="text-slate-600 text-xs text-center max-w-xs">
            Only registered Bear House accounts can sign in. Each person uses their own Google account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
