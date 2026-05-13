import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AcquisitionApp } from './AcquisitionApp';
import './acquisition.css';

const root = document.getElementById('acquisition-root');

if (!root) throw new Error('acquisition-root missing');

createRoot(root).render(
  <StrictMode>
    <AcquisitionApp />
  </StrictMode>
);
