import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 4200, host: '127.0.0.1' },
  appType: 'spa',
  build: {
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
});
