import { VERSION, PRIVACY_STATEMENT, checkSupport } from '../sdk/index';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

el('version').textContent = `v${VERSION}`;
el('privacy').textContent = PRIVACY_STATEMENT;

const support = checkSupport();
const rows: [string, boolean][] = [
  ['Secure connection (HTTPS)', support.secureContext],
  ['Camera API', support.camera],
  ['WebGL2 graphics', support.webgl2],
];

const list = el<HTMLUListElement>('checks');
for (const [label, ok] of rows) {
  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'bad';
  li.textContent = `${ok ? '✓' : '✗'} ${label}`;
  list.append(li);
}
