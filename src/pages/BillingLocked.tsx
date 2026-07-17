import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';

export default function BillingLockedPage() {
  const { currentRole, householdId } = useAppContext();
  const isPayer = currentRole === 'superadmin' || currentRole === 'admin';

  const resumeBilling = async () => {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch('/api/billing-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ householdId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-2xl font-bold text-white">Subscription needed</div>
      {isPayer ? (
        <>
          <p className="text-slate-400 text-sm max-w-sm">
            Your household's subscription is inactive. Update billing to keep using FamilyOS.
          </p>
          <Button onClick={resumeBilling}>Update Billing</Button>
        </>
      ) : (
        <p className="text-slate-400 text-sm max-w-sm">
          Ask a household admin to update the family's billing to keep using FamilyOS.
        </p>
      )}
    </div>
  );
}
