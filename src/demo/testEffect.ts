import {
  BLEND_MODES,
  FINISHES,
  type BlendMode,
  type EffectSpec,
  type FaceView,
  type Finish,
} from '../sdk/index';

/**
 * Phase 2 test controls: apply one solid colour to a chosen region set and tweak blend
 * mode, finish, opacity and feather live. Real product effects arrive in Phases 3–5.
 */

interface Preset {
  label: string;
  regions: EffectSpec['regions'];
  color: string;
  blend: BlendMode;
  finish: Finish;
  opacity: number;
  /** × face width */
  feather: number;
}

const PRESETS: Record<string, Preset> = {
  lips: {
    label: 'Lips',
    regions: ['lips'],
    color: '#9b1b30',
    blend: 'normal',
    finish: 'satin',
    opacity: 0.75,
    feather: 0.006,
  },
  cheeks: {
    label: 'Cheeks',
    regions: ['cheek.R', 'cheek.L'],
    color: '#e8747c',
    blend: 'normal',
    finish: 'satin',
    opacity: 0.35,
    feather: 0.08,
  },
  eyelids: {
    label: 'Eyelids',
    regions: ['eyelid.R', 'eyelid.L'],
    color: '#b5603a',
    blend: 'multiply',
    finish: 'shimmer',
    opacity: 0.55,
    feather: 0.02,
  },
  liner: {
    label: 'Lash line + wing',
    regions: ['lashLine.R', 'lashLine.L', 'linerWing.R', 'linerWing.L'],
    color: '#111111',
    blend: 'normal',
    finish: 'matte',
    opacity: 0.85,
    feather: 0.004,
  },
  brows: {
    label: 'Brows',
    regions: ['brow.R', 'brow.L'],
    color: '#4a3328',
    blend: 'multiply',
    finish: 'matte',
    opacity: 0.45,
    feather: 0.01,
  },
  iris: {
    label: 'Iris',
    regions: ['iris.R', 'iris.L'],
    color: '#3f7fbf',
    blend: 'color',
    finish: 'satin',
    opacity: 0.7,
    feather: 0.004,
  },
  skin: {
    label: 'Face skin',
    regions: ['faceSkin'],
    color: '#d9a07e',
    blend: 'soft-light',
    finish: 'satin',
    opacity: 0.35,
    feather: 0.04,
  },
  underEye: {
    label: 'Under-eye',
    regions: ['underEye.R', 'underEye.L'],
    color: '#e6c3a5',
    blend: 'normal',
    finish: 'satin',
    opacity: 0.4,
    feather: 0.02,
  },
  contour: {
    label: 'Contour',
    regions: [
      'contourCheek.R',
      'contourCheek.L',
      'contourJaw.R',
      'contourJaw.L',
      'contourNose.R',
      'contourNose.L',
    ],
    color: '#7a5240',
    blend: 'multiply',
    finish: 'matte',
    opacity: 0.35,
    feather: 0.04,
  },
  highlight: {
    label: 'Highlight',
    regions: [
      'highlightCheek.R',
      'highlightCheek.L',
      'highlightNose',
      'highlightCupidsBow',
      'highlightBrowBone.R',
      'highlightBrowBone.L',
    ],
    color: '#fff1d6',
    blend: 'screen',
    finish: 'shimmer',
    opacity: 0.45,
    feather: 0.03,
  },
};

export function mountTestEffect(host: HTMLElement, view: FaceView, initial: string | null): void {
  const state: Preset & { key: string } = {
    key: initial && initial in PRESETS ? initial : 'lips',
    ...(PRESETS[initial ?? 'lips'] ?? (PRESETS.lips as Preset)),
  };
  let enabled = initial !== 'off';

  host.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = 'Test effect';
  const grid = document.createElement('div');
  grid.className = 'fx-grid';
  host.append(title, grid);

  const field = (label: string, input: HTMLElement): void => {
    const l = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    l.append(span, input);
    grid.append(l);
  };
  const select = (
    options: readonly string[],
    labels?: Record<string, string>,
  ): HTMLSelectElement => {
    const s = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = labels?.[o] ?? o;
      s.append(opt);
    }
    return s;
  };
  const range = (min: number, max: number, step: number): HTMLInputElement => {
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    return r;
  };

  const regionSel = select(
    ['off', ...Object.keys(PRESETS)],
    Object.fromEntries([['off', 'Off'], ...Object.entries(PRESETS).map(([k, p]) => [k, p.label])]),
  );
  const color = document.createElement('input');
  color.type = 'color';
  const blendSel = select(BLEND_MODES);
  const finishSel = select(FINISHES);
  const opacity = range(0, 1, 0.01);
  const feather = range(0, 0.1, 0.001);

  field('Region', regionSel);
  field('Colour', color);
  field('Blend', blendSel);
  field('Finish', finishSel);
  field('Opacity', opacity);
  field('Feather', feather);

  const sync = (): void => {
    regionSel.value = enabled ? state.key : 'off';
    color.value = state.color;
    blendSel.value = state.blend;
    finishSel.value = state.finish;
    opacity.value = String(state.opacity);
    feather.value = String(state.feather);
    for (const c of [color, blendSel, finishSel, opacity, feather]) c.disabled = !enabled;
  };
  const apply = (): void => {
    view.setEffects(
      enabled
        ? [
            {
              id: 'test',
              regions: state.regions,
              color: state.color,
              blend: state.blend,
              finish: state.finish,
              opacity: state.opacity,
              feather: state.feather,
            },
          ]
        : [],
    );
  };

  regionSel.addEventListener('change', () => {
    enabled = regionSel.value !== 'off';
    const p = PRESETS[regionSel.value];
    if (p) Object.assign(state, p, { key: regionSel.value });
    sync();
    apply();
  });
  color.addEventListener('input', () => {
    state.color = color.value;
    apply();
  });
  blendSel.addEventListener('change', () => {
    state.blend = blendSel.value as BlendMode;
    apply();
  });
  finishSel.addEventListener('change', () => {
    state.finish = finishSel.value as Finish;
    apply();
  });
  opacity.addEventListener('input', () => {
    state.opacity = Number(opacity.value);
    apply();
  });
  feather.addEventListener('input', () => {
    state.feather = Number(feather.value);
    apply();
  });

  sync();
  apply();
}
