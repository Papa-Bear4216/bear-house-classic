import React, { useState } from 'react';
import { Plus, Trash2, Smartphone, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, formatDueBadge, householdPersons } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { DEVICES_STORAGE_KEY } from './deviceWarrantyKeys';

export { DEVICES_STORAGE_KEY };
const STORAGE_KEY = DEVICES_STORAGE_KEY;

const CATEGORIES = ['Phone', 'Tablet', 'Laptop', 'TV', 'Appliance', 'Wearable', 'Other'] as const;
type Category = typeof CATEGORIES[number];

interface DeviceRecord {
  id: string;
  name: string;
  category: Category;
  owner: string;
  purchaseDate: string;
  warrantyExpires: string;
  carePlanExpires: string;
  serialOrImei: string;
  notes: string;
  createdAt: number;
  deletedAt?: number;
  deletedBy?: string;
}

const BADGE_TONE: Record<string, string> = {
  overdue: 'bg-rose-900/40 border-rose-500/30 text-rose-300',
  today: 'bg-rose-900/40 border-rose-500/30 text-rose-300',
  soon: 'bg-amber-900/40 border-amber-500/30 text-amber-300',
  future: 'bg-bark-700 border-cream-400/10 text-cream-400/60',
};

function toTs(dateStr: string): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? null : t;
}

function ExpiryBadge({ label, dateStr }: { label: string; dateStr: string }) {
  const ts = toTs(dateStr);
  if (ts === null) return null;
  const badge = formatDueBadge(ts);
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${BADGE_TONE[badge.tone]}`}>
      {label}: {badge.label}
    </span>
  );
}

const DeviceWarranty: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const persons = householdPersons(householdMembers).filter((p) => p !== 'Family' && p !== 'General');
  const [devices, setDevices] = useState<DeviceRecord[]>(() => loadJSON(STORAGE_KEY, []));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('Phone');
  const [owner, setOwner] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [warrantyExpires, setWarrantyExpires] = useState('');
  const [carePlanExpires, setCarePlanExpires] = useState('');
  const [serialOrImei, setSerialOrImei] = useState('');
  const [notes, setNotes] = useState('');

  const isAdm = currentRole && canDelete(currentRole);
  const save = (next: DeviceRecord[]) => { setDevices(next); saveJSON(STORAGE_KEY, next); };

  const resetForm = () => {
    setName(''); setCategory('Phone'); setOwner(''); setPurchaseDate('');
    setWarrantyExpires(''); setCarePlanExpires(''); setSerialOrImei(''); setNotes('');
    setShowAdd(false);
  };

  const addDevice = () => {
    if (!name.trim()) return;
    const device: DeviceRecord = {
      id: uid(),
      name: name.trim(),
      category,
      owner,
      purchaseDate,
      warrantyExpires,
      carePlanExpires,
      serialOrImei,
      notes,
      createdAt: Date.now(),
    };
    save([device, ...devices]);
    resetForm();
  };

  const deleteDevice = (id: string) => {
    if (!currentUser || !isAdm) return;
    save(devices.map(d => d.id === id ? { ...d, deletedAt: Date.now(), deletedBy: currentUser.id } : d));
  };

  const activeDevices = devices.filter(d => !d.deletedAt);

  // Sort so soonest-expiring (warranty or care plan) surfaces first — mirrors the
  // "surface what needs attention now" principle used across the rest of the app.
  const soonestExpiry = (d: DeviceRecord): number => {
    const dates = [toTs(d.warrantyExpires), toTs(d.carePlanExpires)].filter((t): t is number => t !== null);
    return dates.length ? Math.min(...dates) : Infinity;
  };
  const sortedDevices = [...activeDevices].sort((a, b) => soonestExpiry(a) - soonestExpiry(b));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Device Warranty</h2>
        <button onClick={() => setShowAdd(f => !f)} className="flex items-center gap-1 bg-honey-500 hover:bg-honey-400 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring">
          <Plus className="w-4 h-4" /> Add Device
        </button>
      </div>

      {showAdd && (
        <div className="bg-bark-700/60 border border-cream-400/10 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Device name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Julia's Galaxy Tab" className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 focus:border-honey-500 outline-none focus-ring" autoFocus />
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as Category)} className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Owner</label>
              <select value={owner} onChange={e => setOwner(e.target.value)} className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring">
                <option value="">Unassigned</option>
                {persons.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Purchase date</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring" />
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Warranty expires</label>
              <input type="date" value={warrantyExpires} onChange={e => setWarrantyExpires(e.target.value)} className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring" />
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Care plan expires</label>
              <input type="date" value={carePlanExpires} onChange={e => setCarePlanExpires(e.target.value)} className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring" />
            </div>
            <div className="col-span-2">
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Serial / IMEI</label>
              <input value={serialOrImei} onChange={e => setSerialOrImei(e.target.value)} placeholder="Optional" className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 outline-none focus-ring" />
            </div>
            <div className="col-span-2">
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 outline-none focus-ring" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={resetForm} className="text-cream-400/60 hover:text-white text-sm px-3 py-1.5 rounded transition focus-ring">Cancel</button>
            <button onClick={addDevice} className="bg-honey-500 hover:bg-honey-400 text-white text-sm px-4 py-1.5 rounded-lg transition focus-ring">Add Device</button>
          </div>
        </div>
      )}

      {sortedDevices.length === 0 && !showAdd && (
        <div className="text-center text-cream-400/60 py-8 text-sm">No devices tracked yet. Add one!</div>
      )}

      <div className="space-y-3">
        {sortedDevices.map(device => {
          const isExpanded = expanded === device.id;
          return (
            <div key={device.id} className="bg-bark-700/40 border border-cream-400/10 rounded-xl overflow-hidden">
              <div
                className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-bark-700/60 transition focus-ring"
                onClick={() => setExpanded(isExpanded ? null : device.id)}
              >
                <div className="w-9 h-9 rounded-lg bg-honey-700/40 border border-honey-500/30 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-honey-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">{device.name}</div>
                  <div className="text-cream-400/60 text-xs">{device.category}{device.owner ? ` · ${device.owner}` : ''}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <ExpiryBadge label="Warranty" dateStr={device.warrantyExpires} />
                    <ExpiryBadge label="Care plan" dateStr={device.carePlanExpires} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdm && (
                    <button onClick={(e) => { e.stopPropagation(); deleteDevice(device.id); }} className="text-cream-400/60 hover:text-rose-400 transition focus-ring">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-cream-400/60" /> : <ChevronDown className="w-4 h-4 text-cream-400/60" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-cream-400/10 px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-cream-400/60">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Purchased {device.purchaseDate || 'unknown'}</span>
                  </div>
                  {device.serialOrImei && <div className="text-cream-400/50 text-xs">S/N or IMEI: {device.serialOrImei}</div>}
                  {device.notes && <div className="text-cream-400/50 text-xs">{device.notes}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DeviceWarranty;
