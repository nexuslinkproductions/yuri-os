import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const extensionRoot = __dirname;
const repoRoot = path.resolve(extensionRoot, '../..');

export default defineConfig({
    root: extensionRoot,
    plugins: [react()],
    publicDir: false,
    build: {
        outDir: path.join(repoRoot, 'dist/chrome-design-assistant'),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                sidepanel: path.join(extensionRoot, 'sidepanel.html'),
                devtools: path.join(extensionRoot, 'devtools.html'),
                devtoolsPanel: path.join(extensionRoot, 'devtoolsPanel.html'),
                serviceWorker: path.join(extensionRoot, 'src/serviceWorker.ts'),
                contentScript: path.join(extensionRoot, 'src/contentScript.ts')
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name][extname]'
            }
        }
    }
});
