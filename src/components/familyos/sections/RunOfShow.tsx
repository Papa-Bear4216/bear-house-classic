import React, { useState } from 'react';
import { CalendarDays, Car, Receipt, AlertCircle, Plus } from 'lucide-react';
import { loadJSON, saveJSON, uid } from '@/lib/familyos';

export default function RunOfShow() {
  const [appointments, setAppointments] = useState<any[]>(() => loadJSON('familyos_appointments', []));
  const [bills, setBills] = useState<any[]>(() => loadJSON('familyos_bills', []));
  const [logistics, setLogistics] = useState<any[]>(() => loadJSON('familyos_logistics', []));
  const [newLogistic, setNewLogistic] = useState('');

  // Sort and filter logic
  const now = Date.now();
  const upcomingAppointments = appointments
    .filter(a => a.date && a.date >= now - 86400000)
    .sort((a, b) => a.date - b.date)
    .slice(0, 10);

  const unpaidBills = bills
    .filter(b => !b.paid)
    .sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));

  const addLogistic = () => {
    if (!newLogistic.trim()) return;
    const newItem = {
      id: uid(),
      text: newLogistic,
      createdAt: Date.now(),
      completed: false
    };
    const updated = [...logistics, newItem];
    setLogistics(updated);
    saveJSON('familyos_logistics', updated);
    setNewLogistic('');
  };

  const toggleLogistic = (id: string) => {
    const updated = logistics.map(l => l.id === id ? { ...l, completed: !l.completed } : l);
    setLogistics(updated);
    saveJSON('familyos_logistics', updated);
  };

  const removeLogistic = (id: string) => {
    const updated = logistics.filter(l => l.id !== id);
    setLogistics(updated);
    saveJSON('familyos_logistics', updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-400" />
          Run of Show
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Today's Logistics & Appointments */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Car className="w-4 h-4 text-emerald-400" />
            Schedule & Driving
          </h3>
          <div className="space-y-3">
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming events seeded from GCal.</p>
            ) : (
              upcomingAppointments.map((appt, i) => (
                <div key={i} className="flex flex-col p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-white font-medium text-sm">{appt.title || appt.type}</span>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-emerald-300">{appt.person}</span>
                    <span>{new Date(appt.date).toLocaleDateString()} {new Date(appt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {appt.doctor && <span className="text-xs text-slate-500 mt-1">Location: {appt.doctor}</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Admin & Deadlines */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-400" />
            Admin & Money Deadlines
          </h3>
          <div className="space-y-3">
            {unpaidBills.length === 0 ? (
              <p className="text-sm text-slate-500">No unpaid bills or active deadlines.</p>
            ) : (
              unpaidBills.map((bill, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border-l-2 border-orange-500">
                  <div className="flex flex-col">
                    <span className="text-white font-medium text-sm">{bill.name}</span>
                    <span className="text-xs text-slate-400">
                      Due: {bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <span className="text-orange-300 font-bold text-sm">${bill.amount}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Spoken Logistics Capture */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-400" />
          Tribal Knowledge (Spoken Logistics)
        </h3>
        
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="e.g. Michael picks up kids at 3pm today..."
            value={newLogistic}
            onChange={(e) => setNewLogistic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLogistic()}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
          />
          <button onClick={addLogistic} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          {logistics.filter(l => !l.completed).length === 0 ? (
            <p className="text-sm text-slate-500">No active tribal knowledge recorded.</p>
          ) : (
             logistics.map(log => {
              if (log.completed) return null;
              return (
              <div key={log.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-800">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={log.completed}
                    onChange={() => toggleLogistic(log.id)}
                    className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 bg-slate-700"
                  />
                  <span className={log.completed ? 'line-through text-slate-500 text-sm' : 'text-slate-200 text-sm'}>
                    {log.text}
                  </span>
                </div>
                <button onClick={() => removeLogistic(log.id)} className="text-slate-500 hover:text-red-400 transition">
                  <AlertCircle className="w-4 h-4" />
                </button>
              </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  );
}
