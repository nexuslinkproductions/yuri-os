/**
 * main.tsx — standalone entry for the YURI Trading Observatory.
 *
 * Mounts ObservatoryPage on its own (no BrowserRouter / no nexuslink site shell).
 * This app is intentionally SEPARATE from the root site (:4200) — it runs on its
 * own port (4250) via vite.observatory.config.mts and reuses the shared dashboard
 * components from ../src/. Backend data comes from the observatory server (:4243)
 * through the /api/observatory dev-proxy configured in vite.observatory.config.mts.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ObservatoryPage from '../src/pages/ObservatoryPage';

const el = document.getElementById('root');
if (!el) throw new Error('observatory: #root element missing');

createRoot(el).render(
  <StrictMode>
    <ObservatoryPage />
  </StrictMode>,
);
