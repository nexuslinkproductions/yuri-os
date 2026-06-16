import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '_SYSTEM/src',
  publicDir: '../public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('src/operator/') || id.includes('src/main.ts') || id.includes('src/lib/moduleRegistry')) {
            return 'operator';
          }
        },
      },
    },
  },
  server: {
    port: 4200,
    host: '127.0.0.1',
    proxy: {
      // Dev-proxy: forward /api/observatory/* to the observatory server (default port 4242)
      '/api/observatory': {
        target: 'http://127.0.0.1:4242',
        changeOrigin: false,
        // Preserve EventSource connections (SSE) — disable response buffering
        configure: (proxy) => {
          proxy.on('proxyRes', (_proxyRes, _req, res) => {
            // Flush SSE chunks immediately
            if (typeof (res as { flushHeaders?: () => void }).flushHeaders === 'function') {
              (res as { flushHeaders: () => void }).flushHeaders();
            }
          });
        },
      },
    },
  },
  appType: 'spa',
});
