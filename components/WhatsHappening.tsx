'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, CheckSquare, Sparkles } from 'lucide-react';
import { useTasks } from '@/hooks/use-tasks';
import { useEvents } from '@/hooks/use-events';
import { format } from 'date-fns';
import CalendarImport from './CalendarImport';

export function WhatsHappening() {
  const [isOpen, setIsOpen] = useState(false);
  const { tasks, isLoaded: tasksLoaded } = useTasks();
  const { events, isLoaded: eventsLoaded } = useEvents();

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('openBriefing', handleOpen);
    
    // Only show once per session or on first load daily
    const hasSeen = sessionStorage.getItem('hasSeenBriefing');
    if (!hasSeen && tasksLoaded && eventsLoaded) {
      // Check if we have anything today
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayTasks = tasks.filter(t => t.date === todayStr);
      const todayEvents = events.filter(e => e.date === todayStr);
      
      setIsOpen(true);
      sessionStorage.setItem('hasSeenBriefing', 'true');
    }

    return () => window.removeEventListener('openBriefing', handleOpen);
  }, [tasksLoaded, eventsLoaded, tasks, events]);

  if (!isOpen) return null;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayTasks = tasks.filter(t => t.date === todayStr && !t.completed && t.status !== 'done');
  const todayEvents = events.filter(e => e.date === todayStr);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20, rotate: -2 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20, rotate: 2 }}
            className="bg-white border-4 border-slate-900 rounded-3xl shadow-[16px_16px_0_#1e293b] w-full max-w-md relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-40 bg-[url('https://picsum.photos/seed/gradient/800/400')] bg-cover border-b-4 border-slate-900 z-0">
               <div className="absolute inset-0 bg-gradient-to-tr from-[#ff00ff]/80 to-[#00ffff]/80 backdrop-blur-sm mix-blend-multiply" />
            </div>
            <div className="absolute top-0 inset-x-0 h-40 p-6 z-0 flex flex-col justify-end pb-8">
              <h2 className="text-4xl font-display font-black text-white flex items-center gap-2 uppercase tracking-tighter drop-shadow-[4px_4px_0_#1e293b]">
                <Sparkles className="w-8 h-8 text-white fill-[#ccff00]" />
                What&apos;s Up!
              </h2>
              <p className="text-white font-bold mt-1 tracking-tight drop-shadow-[2px_2px_0_#1e293b]">Your daily breakdown.</p>
            </div>
            
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-2 bg-white border-4 border-slate-900 hover:bg-slate-100 rounded-full shadow-[4px_4px_0_#1e293b] text-slate-900 transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none z-20"
            >
              <X className="w-6 h-6 stroke-[3]" />
            </button>

            <div className="pt-32 px-6 pb-6 relative z-10">
              <CalendarImport />
              <div className="bg-white rounded-2xl border-4 border-slate-900 shadow-[8px_8px_0_#1e293b] p-5 -mt-2 mb-6 space-y-4">
                
                {todayEvents.length > 0 && (
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#be185d] flex items-center gap-1.5 mb-3 bg-pink-100 px-3 py-1.5 rounded-lg border-2 border-[#be185d] w-max">
                      <Calendar className="w-4 h-4 stroke-[3]" /> Schedule
                    </h3>
                    <div className="space-y-3">
                      {todayEvents.slice(0, 3).map(e => (
                        <div key={e.id} className="flex gap-4 text-base items-center">
                          <span className="font-black text-slate-900 bg-[#fef08a] px-2 py-1 rounded-md border-2 border-slate-900">{e.startTime}</span>
                          <span className="text-slate-900 font-bold truncate">{e.title}</span>
                        </div>
                      ))}
                      {todayEvents.length > 3 && (
                        <p className="text-sm text-slate-500 font-bold">+ {todayEvents.length - 3} more events</p>
                      )}
                    </div>
                  </div>
                )}

                {todayEvents.length > 0 && todayTasks.length > 0 && <div className="h-1 bg-slate-200 rounded-full my-4" />}

                {todayTasks.length > 0 && (
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#0369a1] flex items-center gap-1.5 mb-3 bg-sky-100 px-3 py-1.5 rounded-lg border-2 border-[#0369a1] w-max">
                      <CheckSquare className="w-4 h-4 stroke-[3]" /> To Do
                    </h3>
                    <div className="space-y-3">
                      {todayTasks.slice(0, 4).map(t => (
                        <div key={t.id} className="flex gap-3 items-center text-base">
                          <div className="w-4 h-4 rounded border-2 border-slate-900 flex-shrink-0 bg-white" />
                          <span className="text-slate-900 font-bold truncate">{t.title}</span>
                        </div>
                      ))}
                      {todayTasks.length > 4 && (
                        <p className="text-sm text-slate-500 font-bold pl-7">+ {todayTasks.length - 4} more tasks</p>
                      )}
                    </div>
                  </div>
                )}

                {todayTasks.length === 0 && todayEvents.length === 0 && (
                  <p className="text-center text-slate-500 py-6 font-black text-lg">Clear schedule today! 🎉</p>
                )}
              </div>

              <button 
                onClick={() => setIsOpen(false)}
                className="w-full py-4 bg-[#ccff00] hover:bg-[#b5e600] text-slate-900 border-4 border-slate-900 shadow-[4px_4px_0_#1e293b] font-black text-xl uppercase tracking-wider rounded-2xl transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:scale-95"
              >
                Let&apos;s go!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
