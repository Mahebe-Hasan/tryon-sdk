import {
  VERSION,
  PRIVACY_STATEMENT,
  checkSupport,
  Camera,
  FaceView,
  type CameraState,
} from '../sdk/index';
import { mountTestEffect } from './testEffect';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const num = (k: string): number | undefined => {
  const v = params.get(k);
  return v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v);
};

el('version').textContent = `v${VERSION}`;
el('privacy').textContent = PRIVACY_STATEMENT;
const debugLink = el<HTMLAnchorElement>('debug-link');
debugLink.href = debug ? '?' : '?debug=1';
debugLink.textContent = debug ? 'Normal view' : 'Debug view';

// Environment checks (small print under the stage).
const support = checkSupport();
for (const [label, ok] of [
  ['HTTPS', support.secureContext],
  ['Camera API', support.camera],
  ['WebGL2', support.webgl2],
] as const) {
  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'bad';
  li.textContent = `${ok ? '✓' : '✗'} ${label}`;
  el('checks').append(li);
}

const panel = el('panel');
const panelTitle = el('panel-title');
const panelText = el('panel-text');
const startBtn = el<HTMLButtonElement>('start');
const photoBtn = el<HTMLButtonElement>('photo');
const progress = el('progress');
const progressBar = el('progress-bar');
const controls = el('controls');
const switchBtn = el<HTMLButtonElement>('switch');
const hint = el('hint');

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
const isAndroid = /Android/.test(navigator.userAgent);

const view = new FaceView({
  container: el('stage'),
  assetsBaseUrl: new URL('./', location.href).href,
  debug,
  debugToggles: {
    landmarks: params.get('landmarks') !== '0',
    regions: params.get('regions') === '1',
    indices: params.get('ids') === '1',
  },
  smoothing: {
    ...(num('minCutoff') !== undefined && { minCutoff: num('minCutoff') }),
    ...(num('beta') !== undefined && { beta: num('beta') }),
    ...(num('dCutoff') !== undefined && { dCutoff: num('dCutoff') }),
  },
  ...(num('detect') !== undefined && { detectMaxSize: num('detect') }),
  renderer: params.get('renderer') === '2d' ? 'canvas2d' : 'auto',
});
mountTestEffect(el('fx'), view, params.get('fx'));
el('renderer-info').textContent =
  `Renderer: ${view.rendererKind === 'webgl2' ? 'WebGL2' : 'Canvas 2D'}`;
const rendererLink = el<HTMLAnchorElement>('renderer-link');
const otherParams = new URLSearchParams(location.search);
if (view.rendererKind === 'canvas2d' && params.get('renderer') === '2d') {
  otherParams.delete('renderer');
  rendererLink.textContent = 'Use WebGL2';
} else {
  otherParams.set('renderer', '2d');
  rendererLink.textContent = 'Try Canvas 2D fallback';
}
rendererLink.href = `?${otherParams.toString()}`;

function showPanel(
  title: string,
  text: string,
  opts: { start?: string; photo?: boolean } = {},
): void {
  panel.hidden = false;
  panelTitle.textContent = title;
  panelText.textContent = text;
  startBtn.hidden = !opts.start;
  if (opts.start) startBtn.textContent = opts.start;
  photoBtn.hidden = !opts.photo;
  progress.hidden = true;
}

function deniedHelp(): string {
  if (isIOS)
    return 'Camera access is blocked. On iPhone/iPad: open Settings → Safari → Camera → Allow, or tap "aA" in the address bar → Website Settings → Camera → Allow. Then reload.';
  if (isAndroid)
    return 'Camera access is blocked. In Chrome: tap the icon left of the address → Permissions → Camera → Allow. Then reload.';
  return 'Camera access is blocked. Click the camera or lock icon in the address bar, allow the camera for this site, then reload.';
}

function renderState(state: CameraState): void {
  switch (state) {
    case 'asking':
      showPanel('Allow camera', 'Your browser is asking for camera permission.');
      break;
    case 'active':
      panel.hidden = true;
      controls.hidden = false;
      break;
    case 'denied':
      showPanel('Camera blocked', deniedHelp(), { start: 'Try again', photo: true });
      controls.hidden = true;
      break;
    case 'no-camera':
      showPanel('No camera found', 'This device has no camera we can use.', { photo: true });
      controls.hidden = true;
      break;
    case 'in-use':
      showPanel(
        'Camera is busy',
        'Another app or tab is using the camera. Close it and try again.',
        { start: 'Try again', photo: true },
      );
      controls.hidden = true;
      break;
    case 'insecure':
      showPanel(
        'Secure connection needed',
        'The camera only works over HTTPS (or on localhost). Open the https:// link instead.',
        { photo: true },
      );
      break;
    case 'unsupported':
      showPanel('Camera not supported', 'This browser cannot access the camera.', { photo: true });
      break;
    case 'error':
      showPanel('Camera error', 'Something went wrong starting the camera.', {
        start: 'Try again',
        photo: true,
      });
      controls.hidden = true;
      break;
    case 'idle':
      hint.hidden = true;
      controls.hidden = true;
      showPanel('Camera stopped', 'Start again whenever you like.', { start: 'Start camera' });
      break;
  }
}

view.events.on('camera-state', renderState);
view.events.on('model-progress', ({ loaded, total }) => {
  if (!total || view.camera.state !== 'active') return;
  if (progress.hidden) showPanel('Loading face model…', '');
  progress.hidden = false;
  panelText.textContent = `${(loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
  progressBar.style.width = `${Math.round((loaded / total) * 100)}%`;
});
view.events.on('ready', () => {
  if (view.camera.state === 'active') panel.hidden = true;
});
view.events.on('tracking-lost', () => (hint.hidden = false));
view.events.on('tracking-found', () => (hint.hidden = true));
view.events.on('error', (err) => {
  console.error(err);
  showPanel('Could not start face tracking', String(err instanceof Error ? err.message : err), {
    start: 'Try again',
  });
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  try {
    await view.start('user');
    switchBtn.hidden = (await Camera.countCameras()) < 2;
  } finally {
    startBtn.disabled = false;
  }
});
switchBtn.addEventListener('click', () => void view.switchCamera());
const compareBtn = el<HTMLButtonElement>('compare');
compareBtn.addEventListener('click', () => {
  const on = !view.compareEnabled;
  view.setCompare(on);
  compareBtn.setAttribute('aria-pressed', String(on));
  compareBtn.classList.toggle('on', on);
});
el('stop').addEventListener('click', () => view.stop());
photoBtn.addEventListener('click', () => {
  alert('Photo mode arrives in Phase 7.');
});
