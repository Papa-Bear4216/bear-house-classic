'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isToday, addMonths, subMonths, isSameDay,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, RefreshCw, LogIn, LogOut,
  CalendarDays, Loader2, Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGoogleCalendar } from '@/hooks/use-google-calendar';
import { useEvents } from '@/hooks/use-events';
import { useFamilyMembers } from '@/hooks/use-family';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { isSignedIn, events: gcalEvents, isSyncing, lastSynced, error, signIn, signOut, sync } =
    useGoogleCalendar();
  const { events: localEvents } = useEvents();
  const { users } = useFamilyMembers();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = monthStart.getDay();
  const paddingDays = Array.from({ length: startDay }).map((_, i) => {
    const d = new Date(monthStart);
    d.setDate(d.getDate() - (startDay - i));
    return d;
  });
  const allDays = [...paddingDays, ...daysInMonth];

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedGcal = gcalEvents.filter(e => e.date === selectedDateStr);
  const selectedLocal = localEvents.filter(e => e.date === selectedDateStr);

  return (
    <main className="flex flex-col xl:flex-row bg-slate-50 h-full">
      {/* ── Left: Calendar grid ── */}
      <section className="flex-1 p-4 sm:p-8 xl:p-12 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto flex flex-col h-full space-y-6">

          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="font-display text-4xl font-black tracking-tighter text-slate-900 uppercase">
                Family Calendar <CalendarDays className="inline w-8 h-8 text-[#be185d]" />
              </h1>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <span className={`font-bold text-sm px-3 py-1 border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] inline-block ${
                  isSignedIn ? 'bg-[#a7f3d0] text-slate-900' : 'bg-[#fef9c3] text-slate-900'
                }`}>
                  {isSignedIn ? '● Synced with Google Calendar' : '○ Not connected to Google Calendar'}
                </span>
                {lastSynced && (
                  <span className="text-xs text-slate-400 font-medium">
                    Updated {format(lastSynced, 'h:mm a')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isSignedIn ? (
                <>
                  <button
                    onClick={sync}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-black uppercase tracking-wider bg-[#ccff00] border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all rounded-xl disabled:opacity-60"
                  >
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isSyncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                  <button
                    onClick={signOut}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-black uppercase tracking-wider bg-white border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all rounded-xl"
                  >
                    <LogOut className="w-4 h-4" />
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={signIn}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-black uppercase tracking-wider bg-[#4285f4] text-white border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all rounded-xl"
                >
                  <LogIn className="w-4 h-4" />
                  Connect Google Calendar
                </button>
              )}
            </div>
          </header>

          {error && (
            <div className="bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 text-sm text-red-700 font-bold">
              {error}
            </div>
          )}

          {/* Calendar grid */}
          <div className="bg-[#a7f3d0] rounded-[2rem] shadow-[8px_8px_0_#1e293b] border-4 border-slate-900 p-4 sm:p-6 flex-1 flex flex-col min-h-[560px]">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tighter uppercase">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                  className="p-2 border-2 border-slate-900 bg-white rounded-xl shadow-[2px_2px_0_#1e293b] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all"
                >
                  <ChevronLeft className="w-5 h-5 stroke-[3]" />
                </button>
                <button
                  onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                  className="px-3 border-2 border-slate-900 bg-white rounded-xl shadow-[2px_2px_0_#1e293b] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all text-sm font-black"
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                  className="p-2 border-2 border-slate-900 bg-white rounded-xl shadow-[2px_2px_0_#1e293b] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all"
                >
                  <ChevronRight className="w-5 h-5 stroke-[3]" />
                </button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-xs font-black uppercase tracking-widest text-slate-900/60 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-2 flex-1">
              {allDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayGcal = gcalEvents.filter(e => e.date === dayStr);
                const dayLocal = localEvents.filter(e => e.date === dayStr);
                const inMonth = isSameMonth(day, currentDate);
                const isSelected = isSameDay(day, selectedDate);
                const today = isToday(day);

                return (
                  <button
                    key={dayStr}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative flex flex-col p-2 rounded-2xl transition-all duration-200 border-2 focus:outline-none
                      ${!inMonth ? 'opacity-30 hover:opacity-70' : 'hover:-translate-y-1 hover:shadow-[4px_4px_0_#1e293b]'}
                      ${isSelected
                        ? 'bg-[#facc15] border-slate-900 shadow-[4px_4px_0_#1e293b]'
                        : 'bg-white border-slate-900 shadow-[2px_2px_0_#1e293b]'}
                    `}
                  >
                    <span className={`text-sm sm:text-base font-black text-left leading-none mb-1 ${today ? 'text-[#be185d]' : 'text-slate-900'}`}>
                      {format(day, 'd')}
                    </span>
                    <div className="flex flex-col gap-0.5 w-full mt-auto">
                      {dayGcal.slice(0, 2).map(ev => (
                        <div key={ev.id} className="w-full h-1 rounded-full" style={{ backgroundColor: ev.calendarColor }} title={ev.title} />
                      ))}
                      {dayLocal.slice(0, 1).map(ev => (
                        <div key={ev.id} className="w-full h-1 rounded-full bg-[#be185d]" title={ev.title} />
                      ))}
                      {dayGcal.length + dayLocal.length > 3 && (
                        <span className="text-[8px] font-black text-slate-500 leading-none">+{dayGcal.length + dayLocal.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-600">
            {isSignedIn && <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#4285f4]" /> Google Calendar</div>}
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#be185d]" /> Bear House Events</div>
          </div>
        </div>
      </section>

      {/* ── Right: Selected day panel ── */}
      <aside className="w-full xl:w-96 bg-white flex flex-col border-t-4 xl:border-t-0 xl:border-l-4 border-slate-900 min-h-0">
        <div className="p-6 border-b-4 border-slate-900 bg-white sticky top-0 z-10">
          <h3 className="font-display text-2xl font-black uppercase tracking-tighter text-slate-900">
            {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE, MMM do')}
          </h3>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {selectedGcal.length + selectedLocal.length} event{selectedGcal.length + selectedLocal.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {!isSignedIn && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-5 text-center">
              <CalendarDays className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-blue-800 mb-3">
                Connect Google Calendar to see your real events here, kept in sync automatically.
              </p>
              <button
                onClick={signIn}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-[#4285f4] text-white border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all rounded-xl"
              >
                <LogIn className="inline w-3.5 h-3.5 mr-1" />
                Connect Now
              </button>
            </div>
          )}

          {selectedGcal.length > 0 && (
            <div>
              <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-lg border-2 inline-block mb-3"
                style={{ color: '#1a73e8', backgroundColor: '#e8f0fe', borderColor: '#1a73e8' }}>
                Google Calendar
              </span>
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {selectedGcal.map(ev => (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-stretch gap-3 p-4 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] bg-white"
                    >
                      <div className="w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.calendarColor }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-900 leading-snug">{ev.title}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 font-medium">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {ev.allDay ? 'All day' : `${ev.startTime} – ${ev.endTime}`}
                        </div>
                        {ev.calendarName && <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">{ev.calendarName}</p>}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {selectedLocal.length > 0 && (
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-[#be185d] px-3 py-1 rounded-lg border-2 border-[#be185d] bg-pink-50 inline-block mb-3">
                Bear House
              </span>
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {selectedLocal.map(ev => {
                    const user = users.find(u => u.id === ev.userId);
                    return (
                      <motion.div
                        key={ev.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="flex items-stretch gap-3 p-4 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] bg-white"
                      >
                        <div className="w-1.5 rounded-full flex-shrink-0 bg-[#be185d]" />
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-900 leading-snug">{ev.title}</p>
                          {ev.startTime && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 font-medium">
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              {ev.startTime} – {ev.endTime}
                            </div>
                          )}
                          {user && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {user.avatarUrl ? (
                                <Image src={user.avatarUrl} alt={user.name} width={16} height={16} className="w-4 h-4 rounded-full border border-slate-900" referrerPolicy="no-referrer" />
                              ) : (
                                <div className={`w-3 h-3 rounded-full ${user.color} border border-slate-900`} />
                              )}
                              <span className="text-[10px] text-slate-500 font-bold uppercase">{user.name}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}

          {selectedGcal.length === 0 && selectedLocal.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center space-y-3">
              <div className="w-14 h-14 rounded-full border-4 border-slate-200 flex items-center justify-center">
                <CalendarDays className="w-7 h-7 text-slate-300" />
              </div>
              <p className="font-bold text-sm text-slate-500">Nothing scheduled</p>
              <p className="text-xs text-slate-400 max-w-[200px]">
                {isSignedIn
                  ? 'No events on this day in Google Calendar or Bear House.'
                  : 'Connect Google Calendar to see your events.'}
              </p>
            </div>
          )}
        </div>

        {isSignedIn && (
          <div className="p-4 border-t-4 border-slate-900 bg-slate-50 text-center">
            <p className="text-xs text-slate-400 font-medium">
              {isSyncing ? 'Syncing…' : lastSynced ? `Auto-syncs every 5 min · Last: ${format(lastSynced, 'h:mm a')}` : 'Ready to sync'}
            </p>
          </div>
        )}
      </aside>
    </main>
  );
}
