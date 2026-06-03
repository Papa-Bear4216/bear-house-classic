import { useState, useCallback, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "@/components/familyos/Login";
import { getSession } from "@/lib/familyos";
import { pullFromCloud, subscribeToRealtime } from "@/lib/sync";

const queryClient = new QueryClient();

const App = () => {
  const [authed, setAuthed] = useState(() => getSession() !== null);
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    pullFromCloud().finally(() => setSyncReady(true));
    const unsub = subscribeToRealtime();
    return unsub;
  }, []);

  const handleAuth = useCallback(() => setAuthed(true), []);
  const handleLogout = useCallback(() => setAuthed(false), []);

  if (!syncReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading Family OS…</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <ThemeProvider defaultTheme="dark">
        <Login onAuth={handleAuth} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index onLogout={handleLogout} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
