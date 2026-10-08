import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAccessToken, signOut } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import logo from '@/assets/familyos-logo.svg';
import '@/styles/app-shell.css';

interface SetupProps {
  onHouseholdCreated: () => void;
}

export default function Setup({ onHouseholdCreated }: SetupProps) {
  const [householdName, setHouseholdName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelledNotice] = useState(
    () => new URLSearchParams(window.location.search).get('billing') === 'cancelled'
  );

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

      const res = await fetch(apiUrl('/api/setup'), {
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

      const checkoutRes = await fetch(apiUrl('/api/billing-checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ householdId: data.householdId }),
      });
      const checkoutData = await checkoutRes.json();

      if (!checkoutRes.ok || !checkoutData.url) {
        setError(checkoutData.error || 'Household created, but starting checkout failed. Please try again.');
        setSubmitting(false);
        return;
      }

      window.location.href = checkoutData.url;
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fo-setup">
      <div className="fo-setup-panel">
        <div className="fo-setup-story">
          <img src={logo} alt="FamilyOS" />
          <div>
            <span className="fo-setup-eyebrow"><Sparkles className="w-4 h-4" aria-hidden="true" /> A home for the whole household</span>
            <h1>Let's make room for <span>more living.</span></h1>
            <p>Give your household a name, then we’ll build your shared space. You can invite everyone else afterward.</p>
          </div>
          <div className="fo-setup-story-foot"><span><Check className="w-4 h-4" /> One place for the little things</span><span><Check className="w-4 h-4" /> Built for beautifully imperfect days</span></div>
        </div>

        <div className="fo-setup-form-wrap">
          <div className="fo-setup-step">YOUR SPACE <span>·</span> STEP 1 OF 2</div>
          <h2>Start with your home.</h2>
          <p className="fo-setup-description">Just two details. You can fine-tune everything once you're in.</p>
          <form onSubmit={handleSubmit} className="fo-setup-form">
            <div>
              <Label htmlFor="householdName">What do you call your household?</Label>
              <Input id="householdName" autoComplete="organization" placeholder="e.g. The Hebert House" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} disabled={submitting} />
            </div>
            <div>
              <Label htmlFor="memberName">And what should we call you?</Label>
              <Input id="memberName" autoComplete="name" placeholder="Your first name" value={memberName} onChange={(e) => setMemberName(e.target.value)} disabled={submitting} />
            </div>
            {cancelledNotice && <p className="fo-setup-notice" role="status">Checkout was cancelled. You can try again below.</p>}
            {error && <p className="fo-setup-error" role="alert">{error}</p>}
            <button type="submit" className="fo-setup-submit" disabled={submitting}>
              {submitting ? 'Creating your space…' : 'Create my household'} <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </form>
          <button type="button" onClick={() => signOut()} className="fo-setup-signout">Not ready yet? Sign out</button>
        </div>
      </div>
    </div>
  );
}
