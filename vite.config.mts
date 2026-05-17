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
  server: { port: 4200, host: '127.0.0.1' },
  appType: 'spa',
});
