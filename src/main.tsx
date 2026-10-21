
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Returning from the parental-consent card verification: stash the Stripe session id.
try {
  const sid = new URLSearchParams(window.location.search).get('coppa_session');
  if (sid) {
    const raw = sessionStorage.getItem('coppa_pending_invite');
    const pending = raw ? JSON.parse(raw) : {};
    sessionStorage.setItem('coppa_pending_invite', JSON.stringify({ ...pending, sessionId: sid }));
    window.history.replaceState({}, '', window.location.pathname);
  }
} catch { /* storage unavailable */ }

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
