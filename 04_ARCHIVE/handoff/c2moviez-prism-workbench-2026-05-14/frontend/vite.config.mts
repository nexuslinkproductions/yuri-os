import { fileURLToPath } from 'url';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  base: '/acquisition/',
  plugins: [react()],
  build: {
    outDir: path.resolve(rootDir, '../backend/public/acquisition'),
    emptyOutDir: true
  }
});
