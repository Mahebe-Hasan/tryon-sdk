// Copies the MediaPipe WASM runtime from node_modules into public/wasm so it is self-hosted
// (never loaded from Google's CDN at runtime). Runs automatically after `npm install`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'wasm');
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`copied MediaPipe wasm → public/wasm (${files.join(', ')})`);
