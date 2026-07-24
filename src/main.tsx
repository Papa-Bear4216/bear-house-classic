
import { createRoot } from 'react-dom/client'
import { injectSpeedInsights } from '@vercel/speed-insights'
import App from './App.tsx'
import './index.css'

injectSpeedInsights();

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
