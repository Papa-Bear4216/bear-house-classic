import React, { useState } from 'react';
import { USERS, setSession, User } from '@/lib/familyos';
import { ChevronLeft } from 'lucide-react';

interface LoginProps {
  onAuth: () => void;
}

const COLOR_BG: Record<string, string> = {
  indigo: 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500',
  pink: 'bg-pink-600 hover:bg-pink-500 border-pink-500',
  purple: 'bg-purple-600 hover:bg-purple-500 border-purple-500',
  blue: 'bg-blue-600 hover:bg-blue-500 border-blue-500',
};

const COLOR_RING: Record<string, string> = {
  indigo: 'ring-indigo-500',
  pink: 'ring-pink-500',
  purple: 'ring-purple-500',
  blue: 'ring-blue-500',
};

const COLOR_TEXT: Record<string, string> = {
  indigo: 'text-indigo-400',
  pink: 'text-pink-400',
  purple: 'text-purple-400',
  blue: 'text-blue-400',
};

const isParentRole = (role: string) => role === 'superadmin' || role === 'admin';

const anyParentHasPin = () =>
  USERS.filter(u => isParentRole(u.role)).some(u => !!localStorage.getItem(`familyos_pin_${u.id}`));

const Login: React.FC<LoginProps> = ({ onAuth }) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [pinVisible, setPinVisible] = useState(false);

  const pinKey = selectedUser ? `familyos_pin_${selectedUser.id}` : null;
  const isFirstTime = pinKey ? !localStorage.getItem(pinKey) : false;

  const handleUserSelect = (user: User) => {
    const hasPin = !!localStorage.getItem(`familyos_pin_${user.id}`);
    // Block PIN creation on parent accounts once any parent is set up
    if (isParentRole(user.role) && !hasPin && anyParentHasPin()) {
      setError(`${user.name}'s account can only be set up by a parent from inside the app.`);
      return;
    }
    setSelectedUser(user);
    setPin('');
    setConfirm('');
    setError('');
  };

  const handleBack = () => {
    setSelectedUser(null);
    setPin('');
    setConfirm('');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !pinKey) return;
    setError('');

    const savedPin = localStorage.getItem(pinKey);

    if (isFirstTime) {
      if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
      if (pin !== confirm) { setError('PINs do not match.'); return; }
      localStorage.setItem(pinKey, pin);
      setSession(selectedUser.id, selectedUser.role);
      onAuth();
    } else {
      if (pin === savedPin) {
        setSession(selectedUser.id, selectedUser.role);
        onAuth();
      } else {
        setError('Incorrect PIN. Try again.');
        setPin('');
      }
    }
  };

  const handlePinKey = (digit: string) => {
    if (digit === 'back') {
      setPin(p => p.slice(0, -1));
    } else if (digit === 'clear') {
      setPin('');
    } else if (pin.length < 8) {
      setPin(p => p + digit);
    }
  };

  const handleConfirmKey = (digit: string) => {
    if (digit === 'back') {
      setConfirm(p => p.slice(0, -1));
    } else if (digit === 'clear') {
      setConfirm('');
    } else if (confirm.length < 8) {
      setConfirm(p => p + digit);
    }
  };

  if (selectedUser) {
    const color = selectedUser.color;
    const ringClass = COLOR_RING[color] || 'ring-indigo-500';
    const textClass = COLOR_TEXT[color] || 'text-indigo-400';
    const bgClass = COLOR_BG[color] || 'bg-indigo-600 hover:bg-indigo-500';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-6 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Back to family selection
          </button>

          <div className="text-center mb-6">
            <div className={`w-20 h-20 rounded-2xl ${bgClass.split(' ')[0]} flex items-center justify-center font-bold text-3xl mx-auto mb-3 ring-2 ${ringClass} ring-offset-2 ring-offset-slate-950`}>
              {selectedUser.name[0]}
            </div>
            <h2 className="text-xl font-bold text-white">{selectedUser.name}</h2>
            <p className={`text-sm ${textClass} mt-0.5`}>
              {isFirstTime ? 'Create a PIN' : 'Enter your PIN'}
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide mb-2 block">
                  {isFirstTime ? 'New PIN' : 'PIN'}
                </label>
                <div className="flex gap-2 justify-center mb-3">
                  {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all ${
                        i < pin.length
                          ? `border-${color}-500 bg-${color}-600/20 text-white`
                          : 'border-slate-600 bg-slate-900'
                      }`}
                    >
                      {i < pin.length ? (pinVisible ? pin[i] : '●') : ''}
                    </div>
                  ))}
                </div>
              </div>

              {isFirstTime && (
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide mb-2 block">Confirm PIN</label>
                  <div className="flex gap-2 justify-center mb-3">
                    {Array.from({ length: Math.max(4, confirm.length) }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all ${
                          i < confirm.length
                            ? `border-${color}-500 bg-${color}-600/20 text-white`
                            : 'border-slate-600 bg-slate-900'
                        }`}
                      >
                        {i < confirm.length ? (pinVisible ? confirm[i] : '●') : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-rose-400 text-sm text-center">{error}</p>}

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {['1','2','3','4','5','6','7','8','9','clear','0','back'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (isFirstTime && pin.length >= 4 && confirm.length < 8) {
                        // filling confirm
                        if (pin.length >= 4) {
                          // determine which field to fill - use pin first, then confirm
                          // Actually let's fill pin first until submitted, then confirm
                          handleConfirmKey(k);
                        }
                      } else {
                        handlePinKey(k);
                      }
                    }}
                    className={`py-3 rounded-xl text-lg font-semibold transition ${
                      k === 'back' || k === 'clear'
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm'
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    {k === 'back' ? '⌫' : k === 'clear' ? 'C' : k}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className={`w-full ${bgClass} text-white font-semibold py-3 rounded-lg transition`}
              >
                {isFirstTime ? 'Set PIN & Enter' : 'Unlock'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center font-bold text-2xl mx-auto mb-4">
            FO
          </div>
          <h1 className="text-3xl font-bold text-white">Family OS</h1>
          <p className="text-slate-400 text-sm mt-1">Who's using the app?</p>
        </div>

        {error && (
          <div className="mb-4 bg-rose-900/40 border border-rose-500/40 text-rose-300 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {USERS.map((user) => {
            const bg = COLOR_BG[user.color] || 'bg-indigo-600';
            const ring = COLOR_RING[user.color] || 'ring-indigo-500';
            return (
              <button
                key={user.id}
                onClick={() => handleUserSelect(user)}
                className={`flex flex-col items-center gap-3 p-6 rounded-2xl bg-slate-800/60 border border-slate-700 hover:border-${user.color}-500/60 hover:bg-slate-800 transition-all group`}
              >
                <div className={`w-16 h-16 rounded-2xl ${bg.split(' ')[0]} flex items-center justify-center font-bold text-2xl group-hover:ring-2 ${ring} group-hover:ring-offset-2 group-hover:ring-offset-slate-950 transition-all`}>
                  {user.name[0]}
                </div>
                <div className="text-center">
                  <div className="text-white font-semibold">{user.name}</div>
                  <div className="text-slate-400 text-xs capitalize">{user.role}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Login;
