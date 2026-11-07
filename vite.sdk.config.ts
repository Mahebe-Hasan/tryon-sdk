import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// SDK library build: dist/tryon.esm.js + dist/tryon.iife.js (global `TryOn`).
// Models, wasm and assets from public/ are copied into dist/ so jsDelivr can serve them.
export default defineConfig({
  publicDir: r('./public'),
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: r('./src/sdk/index.ts'),
      name: 'TryOn',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'tryon.esm.js' : 'tryon.iife.js'),
    },
  },
});
