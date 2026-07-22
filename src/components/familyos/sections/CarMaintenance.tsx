import React, { useState } from 'react';
import { Plus, Trash2, Car, ChevronDown, ChevronUp } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

export const CARS_STORAGE_KEY = 'familyos_cars';
const STORAGE_KEY = CARS_STORAGE_KEY;

interface MaintenanceEntry {
  id: string;
  type: string;
  date: string;
  mileage: string;
  notes: string;
  createdAt: number;
}

interface CarRecord {
  id: string;
  name: string;
  year: string;
  make: string;
  model: string;
  entries: MaintenanceEntry[];
  createdAt: number;
  deletedAt?: number;
  deletedBy?: string;
}

const MAINTENANCE_TYPES = ['Oil Change', 'Tire Rotation', 'Registration', 'Brakes', 'Battery', 'Air Filter', 'Inspection', 'Other'];

const CarMaintenance: React.FC = () => {
  const { currentUser, currentRole } = useAppContext();
  const [cars, setCars] = useState<CarRecord[]>(() => loadJSON(STORAGE_KEY, []));
  const [expandedCar, setExpandedCar] = useState<string | null>(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [addEntryFor, setAddEntryFor] = useState<string | null>(null);

  // Car form
  const [carName, setCarName] = useState('');
  const [carYear, setCarYear] = useState('');
  const [carMake, setCarMake] = useState('');
  const [carModel, setCarModel] = useState('');

  // Entry form
  const [entryType, setEntryType] = useState('Oil Change');
  const [entryDate, setEntryDate] = useState('');
  const [entryMileage, setEntryMileage] = useState('');
  const [entryNotes, setEntryNotes] = useState('');

  const isAdm = currentRole && canDelete(currentRole);
  const save = (next: CarRecord[]) => { setCars(next); saveJSON(STORAGE_KEY, next); };

  const addCar = () => {
    if (!carName.trim()) return;
    const car: CarRecord = {
      id: uid(),
      name: carName.trim(),
      year: carYear,
      make: carMake,
      model: carModel,
      entries: [],
      createdAt: Date.now(),
    };
    save([...cars, car]);
    setCarName(''); setCarYear(''); setCarMake(''); setCarModel('');
    setShowAddCar(false);
    setExpandedCar(car.id);
  };

  const addEntry = (carId: string) => {
    if (!entryDate) return;
    const entry: MaintenanceEntry = {
      id: uid(),
      type: entryType,
      date: entryDate,
      mileage: entryMileage,
      notes: entryNotes,
      createdAt: Date.now(),
    };
    save(cars.map(c => c.id === carId ? { ...c, entries: [entry, ...c.entries] } : c));
    setEntryType('Oil Change'); setEntryDate(''); setEntryMileage(''); setEntryNotes('');
    setAddEntryFor(null);
  };

  const deleteCar = (id: string) => {
    if (!currentUser || !isAdm) return;
    save(cars.map(c => c.id === id ? { ...c, deletedAt: Date.now(), deletedBy: currentUser.id } : c));
  };

  const deleteEntry = (carId: string, entryId: string) => {
    save(cars.map(c => c.id === carId ? { ...c, entries: c.entries.filter(e => e.id !== entryId) } : c));
  };

  const activeCars = cars.filter(c => !c.deletedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Car Maintenance</h2>
        <button onClick={() => setShowAddCar(f => !f)} className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-white text-sm px-3 py-1.5 rounded-lg transition">
          <Plus className="w-4 h-4" /> Add Car
        </button>
      </div>

      {showAddCar && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Nickname (e.g. "The Truck")</label>
              <input value={carName} onChange={e => setCarName(e.target.value)} placeholder="Car nickname" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-amber-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Year</label>
              <input value={carYear} onChange={e => setCarYear(e.target.value)} placeholder="2022" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-amber-500 outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Make</label>
              <input value={carMake} onChange={e => setCarMake(e.target.value)} placeholder="Toyota" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-amber-500 outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Model</label>
              <input value={carModel} onChange={e => setCarModel(e.target.value)} placeholder="Tacoma" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-amber-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAddCar(false)} className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded transition">Cancel</button>
            <button onClick={addCar} className="bg-amber-600 hover:bg-amber-500 text-white text-sm px-4 py-1.5 rounded-lg transition">Add Car</button>
          </div>
        </div>
      )}

      {activeCars.length === 0 && !showAddCar && (
        <div className="text-center text-slate-500 py-8 text-sm">No cars tracked yet. Add one!</div>
      )}

      <div className="space-y-3">
        {activeCars.map(car => {
          const isExpanded = expandedCar === car.id;
          const lastOil = car.entries.find(e => e.type === 'Oil Change');
          return (
            <div key={car.id} className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden">
              <div
                className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800/60 transition"
                onClick={() => setExpandedCar(isExpanded ? null : car.id)}
              >
                <div className="w-9 h-9 rounded-lg bg-amber-900/40 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <Car className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">{car.name}</div>
                  <div className="text-slate-400 text-xs">{[car.year, car.make, car.model].filter(Boolean).join(' ')} · {car.entries.length} records</div>
                  {lastOil && <div className="text-slate-500 text-xs">Last oil change: {lastOil.date}{lastOil.mileage ? ` @ ${lastOil.mileage} mi` : ''}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {isAdm && (
                    <button onClick={(e) => { e.stopPropagation(); deleteCar(car.id); }} className="text-slate-600 hover:text-rose-400 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-700/50 px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">Maintenance History</span>
                    <button
                      onClick={() => setAddEntryFor(addEntryFor === car.id ? null : car.id)}
                      className="flex items-center gap-1 text-xs bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg transition"
                    >
                      <Plus className="w-3 h-3" /> Log Service
                    </button>
                  </div>

                  {addEntryFor === car.id && (
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-slate-400 text-xs mb-1 block">Service type</label>
                          <select value={entryType} onChange={e => setEntryType(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                            {MAINTENANCE_TYPES.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs mb-1 block">Date</label>
                          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs mb-1 block">Mileage</label>
                          <input value={entryMileage} onChange={e => setEntryMileage(e.target.value)} placeholder="e.g. 45000" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-600 outline-none" />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs mb-1 block">Notes</label>
                          <input value={entryNotes} onChange={e => setEntryNotes(e.target.value)} placeholder="Optional" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-600 outline-none" />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setAddEntryFor(null)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
                        <button onClick={() => addEntry(car.id)} className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
                      </div>
                    </div>
                  )}

                  {car.entries.length === 0 && (
                    <div className="text-center text-slate-600 py-3 text-xs">No maintenance records yet.</div>
                  )}

                  <div className="space-y-2">
                    {car.entries.map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 bg-slate-900/40 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm">{entry.type}</div>
                          <div className="text-slate-400 text-xs">{entry.date}{entry.mileage ? ` · ${entry.mileage} mi` : ''}</div>
                          {entry.notes && <div className="text-slate-500 text-xs mt-0.5">{entry.notes}</div>}
                        </div>
                        {isAdm && (
                          <button onClick={() => deleteEntry(car.id, entry.id)} className="text-slate-600 hover:text-rose-400 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CarMaintenance;
