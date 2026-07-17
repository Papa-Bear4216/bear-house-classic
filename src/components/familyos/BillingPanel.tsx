import { useState, useEffect } from 'react';
import { CreditCard } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';

export function BillingPanel() {
  const { currentRole, householdId } = useAppContext();
  const [seats, setSeats] = useState<number | null>(null);
  const [extraSeats, setExtraSeats] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshSeats = async () => {
    if (!householdId) return;
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch('/api/billing-seats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ householdId }),
    });
    if (res.ok) {
      const data = await res.json();
      setSeats(data.seats);
      setExtraSeats(data.extraSeats);
    }
  };

  useEffect(() => { refreshSeats(); }, [householdId]);

  if (currentRole !== 'superadmin' && currentRole !== 'admin') return null;

  const openBillingPortal = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ householdId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <CreditCard className="w-4 h-4 text-emerald-400" /> Billing
      </div>
      <div className="text-xs text-slate-400">
        {seats === null
          ? 'Loading…'
          : `${seats} member${seats === 1 ? '' : 's'} (${extraSeats} extra seat${extraSeats === 1 ? '' : 's'} beyond the included 3)`}
      </div>
      <button
        onClick={openBillingPortal}
        disabled={loading}
        className="text-xs bg-slate-800 hover:bg-slate-700 text-white rounded px-3 py-1.5 disabled:opacity-50"
      >
        {loading ? 'Opening…' : 'Manage Billing'}
      </button>
    </div>
  );
}
