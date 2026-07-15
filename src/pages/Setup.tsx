import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAccessToken, signOut } from '@/lib/householdAuth';

interface SetupProps {
  onHouseholdCreated: () => void;
}

export default function Setup({ onHouseholdCreated }: SetupProps) {
  const [householdName, setHouseholdName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!householdName.trim() || !memberName.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Your session expired. Please sign in again.');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'createHousehold', householdName, memberName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      onHouseholdCreated();
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-3xl font-bold text-white">🐻 Welcome to Bear House</div>
      <p className="text-slate-400 text-sm text-center max-w-sm">
        Let's set up your household. You'll be the superadmin — you can add the rest of your family afterward.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="space-y-2">
          <Label htmlFor="householdName">Household name</Label>
          <Input
            id="householdName"
            placeholder="The Hebert House"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="memberName">Your name</Label>
          <Input
            id="memberName"
            placeholder="Daddy"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            disabled={submitting}
          />
        </div>

        {error && <p className="text-rose-400 text-sm">{error}</p>}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create household'}
        </Button>

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full text-slate-500 hover:text-slate-300 text-xs text-center"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
