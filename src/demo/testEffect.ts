import {
  LIP_CATEGORIES,
  LIP_FINISHES,
  LIP_RECIPES,
  type FaceView,
  type LipCategory,
  type LipFinish,
} from '../sdk/index';

/**
 * Lip try-on panel, like a shop: product type, shade, finish, intensity. Rendering (blend,
 * coverage, texture, shine, edges) is decided by the SDK's product recipes — never by the
 * shopper. Face and eye products get the same treatment in Phases 4–5.
 */

const CATEGORY_LABELS: Record<LipCategory, string> = {
  lipstick: 'Lipstick',
  'liquid-lipstick': 'Liquid lipstick',
  'lip-gloss': 'Lip gloss',
  'lip-stain': 'Lip stain / tint',
  'lip-liner': 'Lip liner',
};

const FINISH_LABELS: Record<LipFinish, string> = {
  matte: 'Matte',
  satin: 'Satin',
  cream: 'Cream',
  sheer: 'Sheer',
  gloss: 'Gloss',
  shimmer: 'Shimmer',
  metallic: 'Metallic',
};

/** Invented sample shades (no brand assets). */
const SHADES: { name: string; hex: string }[] = [
  { name: 'Ruby', hex: '#9b1b30' },
  { name: 'Nude Rose', hex: '#c27c7c' },
  { name: 'Coral Crush', hex: '#e8604c' },
  { name: 'Berry Bliss', hex: '#7b2d4a' },
  { name: 'Mocha Silk', hex: '#8a5a44' },
  { name: 'Fuchsia Pop', hex: '#c2185b' },
  { name: 'Brick Velvet', hex: '#a3402e' },
  { name: 'Mauve Mist', hex: '#b07a8c' },
  { name: 'Cherry Red', hex: '#d0213a' },
  { name: 'Plum Noir', hex: '#4a1c2e' },
];

export function mountTestEffect(host: HTMLElement, view: FaceView, initial: string | null): void {
  const state = {
    on: initial !== 'off',
    category: 'lipstick' as LipCategory,
    shade: 0,
    finish: LIP_RECIPES.lipstick.defaultFinish as LipFinish,
    intensity: 1,
  };

  host.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = 'Lip try-on';
  const grid = document.createElement('div');
  grid.className = 'fx-grid';
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  swatches.setAttribute('role', 'radiogroup');
  swatches.setAttribute('aria-label', 'Shade');
  const shadeName = document.createElement('p');
  shadeName.className = 'shade-name';
  host.append(title, swatches, shadeName, grid);

  const field = (label: string, input: HTMLElement): void => {
    const l = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    l.append(span, input);
    grid.append(l);
  };
  const select = <T extends string>(options: readonly T[], labels: Record<T, string>) => {
    const s = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = labels[o];
      s.append(opt);
    }
    return s;
  };

  const categorySel = select(LIP_CATEGORIES, CATEGORY_LABELS);
  const finishSel = select(LIP_FINISHES, FINISH_LABELS);
  const intensity = document.createElement('input');
  intensity.type = 'range';
  intensity.min = '0.2';
  intensity.max = '1';
  intensity.step = '0.05';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn';

  field('Product', categorySel);
  field('Finish', finishSel);
  field('Intensity', intensity);
  field('Before / after', toggle);

  const swatchBtns = SHADES.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = s.hex;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', s.name);
    b.title = s.name;
    b.addEventListener('click', () => {
      state.shade = i;
      state.on = true;
      sync();
    });
    swatches.append(b);
    return b;
  });

  const sync = (): void => {
    categorySel.value = state.category;
    finishSel.value = state.finish;
    intensity.value = String(state.intensity);
    toggle.textContent = state.on ? 'Show without' : 'Show with';
    swatchBtns.forEach((b, i) => b.setAttribute('aria-checked', String(i === state.shade)));
    const shade = SHADES[state.shade] ?? SHADES[0];
    shadeName.textContent = `${shade?.name ?? ''} · ${CATEGORY_LABELS[state.category]} · ${FINISH_LABELS[state.finish]}`;
    view.setLipProducts(
      state.on && shade
        ? [
            {
              id: 'lip',
              category: state.category,
              color: shade.hex,
              finish: state.finish,
              intensity: state.intensity,
            },
          ]
        : [],
    );
  };

  categorySel.addEventListener('change', () => {
    state.category = categorySel.value as LipCategory;
    state.finish = LIP_RECIPES[state.category].defaultFinish;
    sync();
  });
  finishSel.addEventListener('change', () => {
    state.finish = finishSel.value as LipFinish;
    sync();
  });
  intensity.addEventListener('input', () => {
    state.intensity = Number(intensity.value);
    sync();
  });
  toggle.addEventListener('click', () => {
    state.on = !state.on;
    sync();
  });

  sync();
}
