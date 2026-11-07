import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Demo site build. Relative base so it works under any GitHub Pages sub-path.
export default defineConfig({
  root: r('./src/demo'),
  base: './',
  publicDir: r('./public'),
  server: { host: true },
  preview: { host: true },
  build: {
    outDir: r('./dist-demo'),
    emptyOutDir: true,
    target: 'es2022',
  },
});
