import type { OneEuroParams } from '../tracking/smoothing';

export interface HudStats {
  fps: number;
  detectMs: number;
  renderMs: number;
  delegate: string;
  videoSize: string;
  detectSize: string;
  tracked: boolean;
  opacity: number;
  blendshapes: Record<string, number>;
}

export interface HudToggles {
  landmarks: boolean;
  regions: boolean;
  indices: boolean;
}

export interface HudCallbacks {
  onToggle(t: HudToggles): void;
  onSmoothing(p: Partial<OneEuroParams>): void;
}

const SHOWN_BLENDSHAPES = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen'];

/** `?debug=1` heads-up display: fps, timings, overlay toggles, smoothing sliders. */
export class DebugHud {
  readonly el: HTMLDivElement;
  private readonly statsEl: HTMLPreElement;
  readonly toggles: HudToggles;

  constructor(
    initial: HudToggles,
    smoothing: OneEuroParams,
    private cb: HudCallbacks,
  ) {
    this.toggles = { ...initial };
    const el = document.createElement('div');
    el.className = 'tryon-hud';
    el.style.cssText =
      'position:absolute;top:8px;left:8px;z-index:5;max-width:calc(100% - 16px);' +
      'background:rgb(0 0 0 / .65);color:#fff;font:12px/1.4 ui-monospace,monospace;' +
      'padding:8px 10px;border-radius:8px;pointer-events:auto;';
    this.statsEl = document.createElement('pre');
    this.statsEl.style.cssText = 'margin:0 0 6px;white-space:pre-wrap;';
    el.append(this.statsEl);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 12px;';
    for (const key of ['landmarks', 'regions', 'indices'] as const) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:4px;min-height:28px;';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = this.toggles[key];
      box.addEventListener('change', () => {
        this.toggles[key] = box.checked;
        this.cb.onToggle({ ...this.toggles });
      });
      label.append(box, key[0]?.toUpperCase() + key.slice(1));
      row.append(label);
    }
    el.append(row);

    el.append(
      this.slider('minCutoff', smoothing.minCutoff, 0.05, 10, 0.05),
      this.slider('beta', smoothing.beta, 0, 400, 5),
      this.slider('dCutoff', smoothing.dCutoff, 0.5, 10, 0.5),
    );
    this.el = el;
  }

  update(s: HudStats): void {
    const bs = SHOWN_BLENDSHAPES.map((k) => `${k} ${(s.blendshapes[k] ?? 0).toFixed(2)}`).join(
      '\n',
    );
    this.statsEl.textContent =
      `fps ${s.fps.toFixed(0)}  detect ${s.detectMs.toFixed(1)}ms  draw ${s.renderMs.toFixed(1)}ms\n` +
      `${s.delegate}  video ${s.videoSize}  detect ${s.detectSize}\n` +
      `face ${s.tracked ? 'yes' : 'no'}  fade ${s.opacity.toFixed(2)}\n${bs}`;
  }

  private slider(
    key: keyof OneEuroParams,
    value: number,
    min: number,
    max: number,
    step: number,
  ): HTMLLabelElement {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const name = document.createElement('span');
    name.style.minWidth = '9ch';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.flex = '1';
    const show = (): void => {
      name.textContent = `${key} ${Number(input.value)}`;
    };
    show();
    input.addEventListener('input', () => {
      show();
      this.cb.onSmoothing({ [key]: Number(input.value) });
    });
    label.append(name, input);
    return label;
  }
}
