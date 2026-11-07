import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * The demo root is src/demo, so Vite's watcher doesn't cover src/sdk. TS imports are tracked
 * through the module graph, but `?raw` shader imports were not, so edits to .glsl files could
 * be served stale until restart. Watch the SDK and reload the page when a shader changes.
 */
function watchSdk(): Plugin {
  return {
    name: 'tryon-watch-sdk',
    configureServer(server) {
      server.watcher.add(r('./src/sdk'));
      server.watcher.on('change', (file) => {
        if (!file.endsWith('.glsl')) return;
        for (const mods of server.moduleGraph.getModulesByFile(file) ?? []) {
          server.moduleGraph.invalidateModule(mods);
        }
        server.moduleGraph.invalidateAll();
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

// Demo site build. Relative base so it works under any GitHub Pages sub-path.
export default defineConfig({
  root: r('./src/demo'),
  base: './',
  publicDir: r('./public'),
  plugins: [watchSdk()],
  server: { host: true },
  preview: { host: true },
  build: {
    outDir: r('./dist-demo'),
    emptyOutDir: true,
    target: 'es2022',
  },
});
