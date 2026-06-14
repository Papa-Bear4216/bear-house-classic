'use client';

import { useState, useRef } from 'react';
import { CalendarDays, RefreshCw, Check, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useEvents } from '@/hooks/use-events';
import { useFamilyMembers } from '@/hooks/use-family';
import CalendarPlugin, { NativeCalendar, NativeCalendarEvent } from '@/lib/calendar-plugin';
import { gcalSignIn, gcalGetCalendars, gcalGetEvents } from '@/lib/google-calendar';

type Step = 'idle' | 'loading-cals' | 'pick-cal' | 'loading-events' | 'preview' | 'done' | 'error';

export default function CalendarImport() {
  const { addEvent } = useEvents();
  const { users } = useFamilyMembers();
  const tokenRef = useRef<string | null>(null);

  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [calendars, setCalendars] = useState<NativeCalendar[]>([]);
  const [selectedCalId, setSelectedCalId] = useState<string>('');
  const [events, setEvents] = useState<NativeCalendarEvent[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [assigneeId, setAssigneeId] = useState(users[0]?.id || '1');
  const [importedCount, setImportedCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  const start = async () => {
    setStep('loading-cals');
    setError('');
    try {
      if (isNative) {
        const { granted } = await CalendarPlugin.requestPermission();
        if (!granted) {
          setError('Calendar permission denied. Go to Settings → Apps → Bear House → Permissions to enable it.');
          setStep('error');
          return;
        }
        const { calendars: cals } = await CalendarPlugin.getCalendars();
        if (cals.length === 0) {
          setError('No calendars found on this device. Make sure Google Calendar is synced.');
          setStep('error');
          return;
        }
        setCalendars(cals);
        setSelectedCalId(cals[0].id);
      } else {
        const token = await gcalSignIn();
        tokenRef.current = token;
        const cals = await gcalGetCalendars(token);
        if (cals.length === 0) {
          setError('No Google Calendars found for this account.');
          setStep('error');
          return;
        }
        setCalendars(cals);
        setSelectedCalId(cals[0].id);
      }
      setStep('pick-cal');
    } catch (e: any) {
      setError(e?.message || 'Failed to connect to Google Calendar.');
      setStep('error');
    }
  };

  const loadEvents = async () => {
    setStep('loading-events');
    try {
      let evs: NativeCalendarEvent[];
      if (isNative) {
        const result = await CalendarPlugin.getEvents({ calendarId: selectedCalId || undefined });
        evs = result.events;
      } else {
        evs = await gcalGetEvents(tokenRef.current!, selectedCalId || undefined);
      }
      setEvents(evs);
      setSelectedEvents(new Set(evs.map(e => e.id)));
      setStep('preview');
    } catch (e: any) {
      setError(e?.message || 'Failed to load events.');
      setStep('error');
    }
  };

  const toggleEvent = (id: string) => {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doImport = () => {
    const toImport = events.filter(e => selectedEvents.has(e.id));
    for (const e of toImport) {
      addEvent({
        title: e.title,
        userId: assigneeId,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
      });
    }
    setImportedCount(toImport.length);
    setStep('done');
  };

  const reset = () => {
    setStep('idle');
    setCalendars([]);
    setEvents([]);
    setSelectedEvents(new Set());
    setError('');
    setImportedCount(0);
    tokenRef.current = null;
  };

  if (step === 'idle') {
    return (
      <button
        onClick={start}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none rounded-xl text-sm font-bold text-slate-900 transition-all active:scale-95"
      >
        <CalendarDays className="w-4 h-4 text-blue-600" />
        Import from Google Calendar
      </button>
    );
  }

  if (step === 'loading-cals' || step === 'loading-events') {
    return (
      <div className="flex items-center gap-2 py-2.5 px-4 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        {step === 'loading-cals' ? 'Connecting to Google Calendar…' : 'Loading events…'}
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 p-3 bg-red-50 border-2 border-red-200 rounded-xl text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
        <button onClick={reset} className="w-full py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors">
          Try Again
        </button>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex items-center justify-between py-2.5 px-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl text-sm">
        <span className="font-bold text-emerald-800 flex items-center gap-1.5">
          <Check className="w-4 h-4" /> {importedCount} events imported
        </span>
        <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Sync again
        </button>
      </div>
    );
  }

  if (step === 'pick-cal') {
    return (
      <div className="space-y-3 bg-white border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] rounded-xl p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Choose Calendar</p>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {calendars.map(cal => (
            <button
              key={cal.id}
              onClick={() => setSelectedCalId(cal.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${selectedCalId === cal.id ? 'bg-blue-50 text-blue-800 border-2 border-blue-400' : 'hover:bg-slate-50 border-2 border-transparent'}`}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-slate-300"
                style={{ backgroundColor: `#${Math.abs(cal.color).toString(16).padStart(6, '0').slice(-6)}` }}
              />
              <span className="truncate">{cal.name}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={loadEvents} className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Load Events →</button>
        </div>
      </div>
    );
  }

  if (step === 'preview') {
    const selected = events.filter(e => selectedEvents.has(e.id));
    return (
      <div className="space-y-3 bg-white border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {selected.length} / {events.length} events selected
          </p>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setSelectedEvents(new Set(events.map(e => e.id)))} className="text-blue-600 font-bold hover:underline">All</button>
            <button onClick={() => setSelectedEvents(new Set())} className="text-slate-500 font-bold hover:underline">None</button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Assign imported events to</label>
          <select
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border-2 border-slate-200 bg-slate-50 font-medium text-slate-800 focus:outline-none focus:border-blue-400"
          >
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        <button
          onClick={() => setShowPreview(v => !v)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-600 py-1"
        >
          Preview events {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showPreview && (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {events.map(ev => (
              <button
                key={ev.id}
                onClick={() => toggleEvent(ev.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors border-2 ${selectedEvents.has(ev.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white opacity-50'}`}
              >
                <span className={`w-3 h-3 rounded border-2 shrink-0 ${selectedEvents.has(ev.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`} />
                <span className="font-medium truncate">{ev.title}</span>
                <span className="ml-auto shrink-0 text-slate-400">{ev.date}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={reset} className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors">Cancel</button>
          <button
            onClick={doImport}
            disabled={selected.length === 0}
            className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            Import {selected.length} events
          </button>
        </div>
      </div>
    );
  }

  return null;
}
