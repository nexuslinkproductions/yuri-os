import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/global.css';

const rootEl = document.getElementById('app-root');
if (rootEl) {
    createRoot(rootEl).render(<App />);
} else if (!document.getElementById('app-lobby')) {
    console.warn('[index.tsx] Neither #app-root nor #app-lobby found in DOM');
}
