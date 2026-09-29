// src/components/familyos/CoParentAddressForm.tsx
import { useState, useEffect } from 'react';
import { MapPin, Lock, Check, Loader } from 'lucide-react';
import { authedFetch } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';

interface Address {
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  contactPhone: string | null;
  confidential: boolean;
  complete: boolean;
}

interface Statute {
  stateName: string;
  citation: string | null;
  summary: string | null;
  confidence: 'unreviewed' | 'likely' | 'not found';
  sourceUrl: string | null;
}

interface AddressResponse {
  mine: Address | null;
  other: (Partial<Address> & { confidential: boolean; complete: boolean }) | null;
  statute: Statute | null;
  statuteDisclaimer: string;
}

const inputCls =
  'w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50';

/** Own address/phone form plus, in co-parent mode, the other home's. */
export function CoParentAddressForm({ isCoparent, onSaved }: { isCoparent: boolean; onSaved?: () => void }) {
  const [data, setData] = useState<AddressResponse | null>(null);
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await authedFetch(apiUrl('/api/coparent-address'));
      if (!res.ok) return;
      const body = (await res.json()) as AddressResponse & { ok: boolean };
      if (!body.ok) return;
      setData(body);
      const m = body.mine;
      setStreet(m?.addressStreet ?? '');
      setCity(m?.addressCity ?? '');
      setState(m?.addressState ?? '');
      setZip(m?.addressZip ?? '');
      setPhone(m?.contactPhone ?? '');
      setConfidential(!!m?.confidential);
    } catch {
      // ignore — the form still works for entry
    }
  };

  useEffect(() => {
    load();
  }, [isCoparent]);

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const fields = { addressStreet: street, addressCity: city, addressState: state, addressZip: zip, contactPhone: phone };
      // Blank fields are omitted so a confidential household can save with none.
      const body: Record<string, unknown> = { confidential };
      for (const [k, v] of Object.entries(fields)) if (v.trim()) body[k] = v.trim();
      const res = await authedFetch(apiUrl('/api/coparent-address'), { method: 'POST', body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) {
        setError(out.error || 'Failed to save address');
      } else {
        setSaved(true);
        await load();
        onSaved?.();
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const other = data?.other;
  const statute = data?.statute;

  return (
    <div className="space-y-2 pt-1 border-t border-slate-800">
      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
        <MapPin className="w-3.5 h-3.5" /> Your household address &amp; phone
      </div>
      {!isCoparent && (
        <div className="text-xs text-slate-500">Required before you can enable co-parenting, so the other parent can reach you.</div>
      )}

      <input className={inputCls} placeholder="Street address" value={street} onChange={(e) => setStreet(e.target.value)} disabled={saving} maxLength={200} />
      <div className="grid grid-cols-6 gap-2">
        <input className={`${inputCls} col-span-3`} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} disabled={saving} maxLength={100} />
        <input className={`${inputCls} col-span-1 uppercase`} placeholder="ST" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} disabled={saving} />
        <input className={`${inputCls} col-span-2`} placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} disabled={saving} maxLength={10} />
      </div>
      <input className={inputCls} placeholder="Contact phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} maxLength={20} />

      <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
        <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} disabled={saving} className="mt-0.5" />
        <span>
          <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Keep my address confidential</span>
          <span className="text-slate-500">
            Use this if a protective order or similar requires it. The other parent will not see your address or phone. Address fields become optional.
          </span>
        </span>
      </label>

      {error && <div className="text-xs text-red-400 bg-red-950/50 rounded px-3 py-2">{error}</div>}
      <button
        onClick={save}
        disabled={saving}
        className="w-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded px-3 py-1.5 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save address'}
      </button>

      {isCoparent && other && (
        <div className="text-xs bg-slate-950 border border-slate-800 rounded px-3 py-2 space-y-0.5">
          <div className="text-slate-400 font-medium">Other household</div>
          {other.confidential ? (
            <div className="text-slate-500">Address withheld.</div>
          ) : other.complete ? (
            <>
              <div className="text-slate-200">{other.addressStreet}</div>
              <div className="text-slate-200">{other.addressCity}, {other.addressState} {other.addressZip}</div>
              <div className="text-slate-200">{other.contactPhone}</div>
            </>
          ) : (
            <div className="text-slate-500">They haven't entered an address yet.</div>
          )}
        </div>
      )}

      {statute && statute.citation && (
        <div className="text-xs text-slate-400 space-y-1">
          <div>
            {statute.stateName}: {statute.citation}
            {statute.confidence !== 'unreviewed' && <span className="text-amber-400"> ({statute.confidence})</span>}
          </div>
          {statute.summary && <div className="text-slate-500 line-clamp-3">{statute.summary}</div>}
          <div className="text-amber-400/80">{data?.statuteDisclaimer}</div>
        </div>
      )}
    </div>
  );
}
