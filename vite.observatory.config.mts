import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Repo root (this config sits at the repo root) — used to allow the dev server
// to serve the shared dashboard components from _SYSTEM/src (outside this app root).
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// Standalone YURI Trading Observatory frontend — SEPARATE from the root site (:4200).
// Its own root dir, own port (4250), own build (dist-observatory), own /api proxy.
export default defineConfig({
  plugins: [react()],
  root: '_SYSTEM/observatory-ui',
  build: {
    outDir: '../../dist-observatory',
    emptyOutDir: true,
  },
  server: {
    port: 4250,
    host: '127.0.0.1',
    // Allow importing the shared dashboard components from _SYSTEM/src (outside root).
    fs: { allow: [repoRoot] },
    proxy: {
      // Forward /api/observatory/* to the observatory backend.
      // Default 4243 (4242 is the YURI health-aggregator); override with OBSERVATORY_PORT.
      '/api/observatory': {
        target: `http://127.0.0.1:${process.env.OBSERVATORY_PORT || 4243}`,
        changeOrigin: false,
        // Preserve EventSource (SSE) — flush chunks immediately.
        configure: (proxy) => {
          proxy.on('proxyRes', (_proxyRes, _req, res) => {
            const r = res as { flushHeaders?: () => void };
            if (typeof r.flushHeaders === 'function') r.flushHeaders();
          });
        },
      },
    },
  },
  appType: 'spa',
});
