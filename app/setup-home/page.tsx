'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, CheckCircle2, ChevronRight, Loader2, Home, AlertCircle, RefreshCcw } from 'lucide-react';
import { useFamilyMembers } from '@/hooks/use-family';
import { useTasks } from '@/hooks/use-tasks';
import { checkLocalAIAvailability, runLocalAI } from '@/lib/local-ai';

export default function SetupHomePage() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'error' | 'generating' | 'done'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [logs, setLogs] = useState<{ id: string, text: string, status: 'pending' | 'done' | 'error' }[]>([]);
  
  const { addUser } = useFamilyMembers();
  const { addTask } = useTasks();

  const addLog = (text: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setLogs(prev => [...prev, { id, text, status: 'pending' }]);
    return id;
  };

  const updateLog = (id: string, status: 'done' | 'error') => {
    setLogs(prev => prev.map(log => log.id === id ? { ...log, status } : log));
  };

  useEffect(() => {
    async function check() {
      setStatus('checking');
      const { available, message } = await checkLocalAIAvailability();
      if (available) {
        setStatus('ready');
      } else {
        setStatus('error');
        setErrorMessage(message);
      }
    }
    check();
  }, []);

  const handleStartSetup = async () => {
    setStatus('generating');
    setLogs([]);
    
    try {
      // Step 1: Generate initial family setup
      const familyLogId = addLog('Generating family members...');
      const familyPrompt = `Generate a JSON array of 2 family members for a home management app. Each member should have 'name', 'role' ("parent" or "child"), 'color' ("bg-red-500", "bg-blue-500", etc), and 'points' (number). Only output valid JSON array, without markdown blocks.`;
      
      const familyJsonStr = await runLocalAI(familyPrompt);
      const cleanedFamilyStr = familyJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      const familyData: any[] = JSON.parse(cleanedFamilyStr);
      
      for (const member of familyData) {
        addUser({
          id: Math.random().toString(36).substring(7),
          name: member.name || 'Unknown',
          role: member.role === 'admin' ? 'admin' : member.role === 'superadmin' ? 'superadmin' : 'child',
          color: member.color || 'bg-indigo-500',
          points: member.points || 0
        });
      }
      updateLog(familyLogId, 'done');

      // Step 2: Generate starter chores
      const choresLogId = addLog('Creating starter chore missions...');
      const choresPrompt = `Generate a JSON array of 3 starter household chores. Each chore should have 'title' (string), and 'pointsValue' (number). Only output valid JSON array, without markdown blocks.`;
      
      const choresJsonStr = await runLocalAI(choresPrompt);
      const cleanedChoresStr = choresJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      const choresData: any[] = JSON.parse(cleanedChoresStr);

      for (const chore of choresData) {
        addTask({
          title: chore.title || 'Clean up',
          pointsValue: chore.pointsValue || 10,
          status: 'todo',
          completed: false,
          date: new Date().toISOString().split('T')[0],
          assigneeId: '1'
        });
      }
      updateLog(choresLogId, 'done');
      
      setStatus('done');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred during local AI generation.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">Setup Your Home</h1>
          <p className="text-slate-600">Use on-device AI to automatically configure your family profiles and starter chores.</p>
        </header>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
            <div className={`p-3 rounded-xl flex-shrink-0 ${status === 'ready' || status === 'done' || status === 'generating' ? 'bg-green-100 text-green-600' : (status === 'error' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600')}`}>
              {status === 'ready' || status === 'done' || status === 'generating' ? <CheckCircle2 className="w-6 h-6" /> : (status === 'error' ? <AlertCircle className="w-6 h-6" /> : <Loader2 className="w-6 h-6 animate-spin" />)}
            </div>
            <div>
              <h2 className="font-semibold text-lg text-slate-900">Local AI Status</h2>
              <p className="text-sm text-slate-500">
                {status === 'checking' && 'Checking device capabilities...'}
                {status === 'ready' && 'Gemini Nano is available and ready on your device.'}
                {status === 'done' && 'Setup completed successfully.'}
                {status === 'generating' && 'On-device AI is generating data...'}
                {status === 'error' && errorMessage}
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <AnimatePresence>
              {logs.map((log) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={log.id} 
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    {log.status === 'pending' ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : log.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                    <span className="text-sm font-medium text-slate-700">{log.text}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-3">
            {status === 'error' ? (
              <div className="p-4 bg-yellow-50 text-yellow-800 text-sm rounded-xl border border-yellow-200 flex flex-col gap-2">
                <p><strong>Important:</strong> To use this Local AI feature, you must have Gemini Nano available.</p>
                <ol className="list-decimal list-inside space-y-1 ml-1 text-xs">
                  <li>Download <a href="https://www.google.com/chrome/canary/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Chrome Canary</a> or use Chrome 127+</li>
                  <li>Go to <code>chrome://flags/#prompt-api-for-gemini-nano</code> and set it to <strong>Enabled</strong>.</li>
                  <li>Go to <code>chrome://flags/#optimization-guide-on-device-model</code> and set it to <strong>Enabled BypassPrefRequirement</strong>.</li>
                  <li>Relaunch Chrome.</li>
                  <li>Go to <code>chrome://components</code>, find <strong>Optimization Guide On Device Model</strong>, and click <strong>Check for update</strong> to download the model.</li>
                </ol>
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                onClick={handleStartSetup}
                disabled={status !== 'ready' && status !== 'error'}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === 'generating' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Working...
                  </>
                ) : (
                  <>
                    <Bot className="w-5 h-5" /> Start Auto-Setup
                  </>
                )}
              </button>

              {(status === 'error' || status === 'done') && (
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
                >
                  <RefreshCcw className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {status === 'error' && (
              <button
                onClick={async () => {
                  setStatus('generating');
                  setLogs([]);
                  const simLog = addLog('Simulating local AI process for demo...');
                  await new Promise(r => setTimeout(r, 1500));
                  
                  const fam = addLog('Adding dummy family members...');
                  await new Promise(r => setTimeout(r, 1000));
                  addUser({ id: 'dummy1', name: 'Mom (Demo)', role: 'admin', color: 'bg-rose-500', points: 0 });
                  addUser({ id: 'dummy2', name: 'Kid (Demo)', role: 'child', color: 'bg-blue-500', points: 0 });
                  updateLog(fam, 'done');

                  const chores = addLog('Adding dummy tasks...');
                  await new Promise(r => setTimeout(r, 1000));
                  addTask({
                    title: 'Clean the kitchen', pointsValue: 20, status: 'todo', date: new Date().toISOString().split('T')[0], assigneeId: 'dummy2', completed: false 
                  });
                  updateLog(chores, 'done');
                  updateLog(simLog, 'done');
                  setStatus('done');
                }}
                className="mt-4 text-xs text-slate-500 hover:text-slate-700 font-medium underline text-center"
              >
                Continue with simulated data setup (Ignore Local AI)
              </button>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
