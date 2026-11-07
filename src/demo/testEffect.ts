import {
  BLUSH_STYLE_NAMES,
  CONCEALER_TYPES,
  FACE_SHAPES,
  finishesFor,
  type BlushStyle,
  type ConcealerType,
  type FaceShape,
  type FaceView,
  type Product,
  type ProductCategory,
  type ProductFinish,
} from '../sdk/index';

/**
 * Look builder, like a shop: pick a product type, tap a shade, choose finish and intensity.
 * Several products stack into one look. Placement of blush/contour/bronzer/highlighter
 * follows the detected face shape (overridable). Rendering is decided by the SDK recipes.
 */

interface Shade {
  name: string;
  hex: string;
}

const LABELS: Record<ProductCategory, string> = {
  foundation: 'Foundation',
  'skin-tint': 'Skin tint',
  concealer: 'Concealer',
  blush: 'Blush',
  bronzer: 'Bronzer',
  contour: 'Contour',
  highlighter: 'Highlighter',
  eyeshadow: 'Eyeshadow',
  lipstick: 'Lipstick',
  'liquid-lipstick': 'Liquid lipstick',
  'lip-gloss': 'Lip gloss',
  'lip-stain': 'Lip stain / tint',
  'lip-liner': 'Lip liner',
};

const GROUPS: { label: string; items: ProductCategory[] }[] = [
  { label: 'Face', items: ['foundation', 'skin-tint', 'concealer'] },
  { label: 'Cheeks', items: ['blush', 'bronzer', 'contour', 'highlighter'] },
  { label: 'Eyes', items: ['eyeshadow'] },
  { label: 'Lips', items: ['lipstick', 'liquid-lipstick', 'lip-gloss', 'lip-stain', 'lip-liner'] },
];

const FINISH_LABELS: Record<ProductFinish, string> = {
  matte: 'Matte',
  satin: 'Satin',
  cream: 'Cream',
  sheer: 'Sheer',
  gloss: 'Gloss',
  shimmer: 'Shimmer',
  metallic: 'Metallic',
  natural: 'Natural',
  dewy: 'Dewy',
};

const SHAPE_LABELS: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  oblong: 'Oblong (long)',
  heart: 'Heart',
  diamond: 'Diamond',
  triangle: 'Triangle (pear)',
};

const STYLE_LABELS: Record<BlushStyle, string> = {
  lifted: 'Lifted (to temples)',
  draped: 'Draped (cheekbone)',
  sunkissed: 'Sun-kissed (across nose)',
  apples: 'Apples (round)',
  vertical: 'Vertical (outer cheek)',
};

const CONCEALER_LABELS: Record<ConcealerType, string> = {
  cover: 'Cover (your shade)',
  brighten: 'Brighten (lighter shade)',
  peach: 'Peach corrector (dark circles)',
  green: 'Green corrector (redness)',
};

/** Invented sample shades (no brand assets). */
const SKIN: Shade[] = [
  { name: 'Porcelain', hex: '#f3d9c6' },
  { name: 'Ivory', hex: '#ebc8ae' },
  { name: 'Sand', hex: '#d9ae8c' },
  { name: 'Honey', hex: '#c8956b' },
  { name: 'Caramel', hex: '#a9744e' },
  { name: 'Chestnut', hex: '#8a5a3c' },
  { name: 'Espresso', hex: '#5e3b28' },
  { name: 'Ebony', hex: '#3f2619' },
];
const LIPS: Shade[] = [
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
const CONCEALER_SHADES: Record<ConcealerType, Shade[]> = {
  cover: SKIN,
  brighten: SKIN.map((s) => ({ name: `${s.name} Light`, hex: lighten(s.hex, 0.14) })),
  peach: [
    { name: 'Soft Peach', hex: '#f6c3a4' },
    { name: 'Peach', hex: '#f2a77e' },
    { name: 'Apricot', hex: '#e98e5c' },
    { name: 'Deep Orange', hex: '#cf6d3b' },
  ],
  green: [
    { name: 'Mint', hex: '#cfe8c6' },
    { name: 'Green', hex: '#a9d6a0' },
  ],
};
const SHADES: Record<ProductCategory, Shade[]> = {
  foundation: SKIN,
  'skin-tint': SKIN,
  concealer: SKIN,
  blush: [
    { name: 'Peach Glow', hex: '#f2a08a' },
    { name: 'Soft Rose', hex: '#e07a8f' },
    { name: 'Berry Flush', hex: '#b4466a' },
    { name: 'Coral Kiss', hex: '#f07860' },
    { name: 'Mauve Dusk', hex: '#b9788a' },
    { name: 'Brick Warmth', hex: '#b4553f' },
  ],
  bronzer: [
    { name: 'Sun-kissed', hex: '#b8835a' },
    { name: 'Bronze', hex: '#94603b' },
    { name: 'Deep Bronze', hex: '#6e4428' },
  ],
  contour: [
    { name: 'Soft Taupe', hex: '#8c6f5e' },
    { name: 'Cool Brown', hex: '#6e5548' },
    { name: 'Deep Shade', hex: '#4a372e' },
  ],
  highlighter: [
    { name: 'Champagne', hex: '#f5e3c2' },
    { name: 'Pearl', hex: '#f4eef0' },
    { name: 'Rose Gold', hex: '#f0c4b0' },
    { name: 'Gold', hex: '#e8c27a' },
  ],
  eyeshadow: [
    { name: 'Champagne', hex: '#e8d2b0' },
    { name: 'Rose Gold', hex: '#d49a8a' },
    { name: 'Copper', hex: '#b5652f' },
    { name: 'Bronze', hex: '#9c6a3f' },
    { name: 'Plum', hex: '#6b3a55' },
    { name: 'Smoky', hex: '#3c3a3e' },
    { name: 'Emerald', hex: '#2f6f5a' },
    { name: 'Navy', hex: '#2b3a5c' },
  ],
  lipstick: LIPS,
  'liquid-lipstick': LIPS,
  'lip-gloss': LIPS,
  'lip-stain': LIPS,
  'lip-liner': LIPS,
};

/** Lip colour products share one slot (only one worn at a time); liner has its own. */
function slotOf(c: ProductCategory): string {
  return ['lipstick', 'liquid-lipstick', 'lip-gloss', 'lip-stain'].includes(c) ? 'lips' : c;
}

function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): string =>
    Math.round(v + (255 - v) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

type Applied = Product & { shadeName: string };

export function mountTestEffect(host: HTMLElement, view: FaceView, initial: string | null): void {
  const look = new Map<string, Applied>();
  let category: ProductCategory = 'lipstick';
  const finishByCat = new Map<ProductCategory, ProductFinish>();
  const intensityByCat = new Map<ProductCategory, number>();
  let blushStyle: BlushStyle | 'auto' = 'auto';
  let concealerType: ConcealerType = 'cover';

  host.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = 'Build a look';
  const shapeRow = document.createElement('div');
  shapeRow.className = 'fx-grid';
  const grid = document.createElement('div');
  grid.className = 'fx-grid';
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  swatches.setAttribute('role', 'radiogroup');
  const shadeName = document.createElement('p');
  shadeName.className = 'shade-name';
  const applied = document.createElement('div');
  applied.className = 'chips';
  host.append(title, shapeRow, grid, swatches, shadeName, applied);

  const field = (parent: HTMLElement, label: string, input: HTMLElement): HTMLLabelElement => {
    const l = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    l.append(span, input);
    parent.append(l);
    return l;
  };
  const select = (options: [string, string][]): HTMLSelectElement => {
    const s = document.createElement('select');
    for (const [v, t] of options) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      s.append(o);
    }
    return s;
  };

  // Face shape: auto (shows the detected shape) or a manual override.
  const shapeSel = select([
    ['auto', 'Auto (detecting…)'],
    ...FACE_SHAPES.map((s): [string, string] => [s, SHAPE_LABELS[s]]),
  ]);
  field(shapeRow, 'Face shape', shapeSel);
  const autoOption = shapeSel.options[0] as HTMLOptionElement;
  view.events.on('face-shape', ({ detected }) => {
    autoOption.textContent = detected ? `Auto (${SHAPE_LABELS[detected]})` : 'Auto (detecting…)';
  });
  shapeSel.addEventListener('change', () => {
    view.setFaceShape(shapeSel.value === 'auto' ? null : (shapeSel.value as FaceShape));
  });

  const categorySel = document.createElement('select');
  for (const g of GROUPS) {
    const og = document.createElement('optgroup');
    og.label = g.label;
    for (const c of g.items) {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = LABELS[c];
      og.append(o);
    }
    categorySel.append(og);
  }
  const finishSel = document.createElement('select');
  const styleSel = select([
    ['auto', 'Auto (best for face shape)'],
    ...BLUSH_STYLE_NAMES.map((s): [string, string] => [s, STYLE_LABELS[s]]),
  ]);
  const concealerSel = select(
    CONCEALER_TYPES.map((t): [string, string] => [t, CONCEALER_LABELS[t]]),
  );
  const intensity = document.createElement('input');
  intensity.type = 'range';
  intensity.min = '0.15';
  intensity.max = '1';
  intensity.step = '0.05';

  field(grid, 'Product', categorySel);
  const concealerField = field(grid, 'Type', concealerSel);
  const styleField = field(grid, 'Style', styleSel);
  field(grid, 'Finish', finishSel);
  field(grid, 'Intensity', intensity);

  const shadesFor = (c: ProductCategory): Shade[] =>
    c === 'concealer' ? CONCEALER_SHADES[concealerType] : SHADES[c];

  const current = (): Applied | undefined => {
    const p = look.get(slotOf(category));
    return p && p.category === category ? p : undefined;
  };

  const extras = (c: ProductCategory): Partial<Product> => ({
    ...(c === 'blush' && blushStyle !== 'auto' && { style: blushStyle }),
    ...(c === 'concealer' && { variant: concealerType }),
  });

  const apply = (): void => {
    view.setProducts([...look.values()]);
    renderChips();
  };

  const setShade = (s: Shade): void => {
    look.set(slotOf(category), {
      id: slotOf(category),
      category,
      color: s.hex,
      shadeName: s.name,
      finish: finishByCat.get(category) ?? (finishesFor(category)[0] as ProductFinish),
      intensity: intensityByCat.get(category) ?? 1,
      ...extras(category),
    });
    syncPanel();
    apply();
  };

  const updateCurrent = (): void => {
    const p = current();
    if (!p) return;
    p.finish = finishByCat.get(category) ?? p.finish;
    p.intensity = intensityByCat.get(category) ?? p.intensity;
    delete p.style;
    Object.assign(p, extras(category));
    apply();
  };

  function syncPanel(): void {
    categorySel.value = category;
    concealerField.hidden = category !== 'concealer';
    styleField.hidden = category !== 'blush';
    concealerSel.value = concealerType;
    styleSel.value = blushStyle;
    finishSel.innerHTML = '';
    for (const f of finishesFor(category)) {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = FINISH_LABELS[f];
      finishSel.append(o);
    }
    finishSel.value = finishByCat.get(category) ?? (finishesFor(category)[0] as ProductFinish);
    intensity.value = String(intensityByCat.get(category) ?? 1);
    const cur = current();
    swatches.innerHTML = '';
    swatches.setAttribute('aria-label', `${LABELS[category]} shade`);
    for (const s of shadesFor(category)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = s.hex;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', s.name);
      b.setAttribute('aria-checked', String(cur?.color === s.hex));
      b.title = s.name;
      b.addEventListener('click', () => setShade(s));
      swatches.append(b);
    }
    shadeName.textContent = cur
      ? `${cur.shadeName} · ${LABELS[category]}`
      : `Tap a shade to apply ${LABELS[category].toLowerCase()}`;
  }

  function renderChips(): void {
    applied.innerHTML = '';
    for (const [slot, p] of look) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('aria-label', `Remove ${LABELS[p.category]} ${p.shadeName}`);
      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.background = p.color;
      chip.append(dot, `${LABELS[p.category]} · ${p.shadeName}`, ' ✕');
      chip.addEventListener('click', () => {
        look.delete(slot);
        syncPanel();
        apply();
      });
      applied.append(chip);
    }
  }

  categorySel.addEventListener('change', () => {
    category = categorySel.value as ProductCategory;
    syncPanel();
  });
  concealerSel.addEventListener('change', () => {
    concealerType = concealerSel.value as ConcealerType;
    // A different concealer type is a different product: cleared until a shade is picked.
    if (current()) look.delete('concealer');
    syncPanel();
    apply();
  });
  styleSel.addEventListener('change', () => {
    blushStyle = styleSel.value as BlushStyle | 'auto';
    updateCurrent();
  });
  finishSel.addEventListener('change', () => {
    finishByCat.set(category, finishSel.value as ProductFinish);
    updateCurrent();
  });
  intensity.addEventListener('input', () => {
    intensityByCat.set(category, Number(intensity.value));
    updateCurrent();
  });

  // Start with a ruby lipstick so the camera shows something straight away (?fx=off: none).
  if (initial !== 'off') {
    const ruby = LIPS[0] as Shade;
    look.set('lips', {
      id: 'lips',
      category: 'lipstick',
      color: ruby.hex,
      shadeName: ruby.name,
      finish: 'satin',
      intensity: 1,
    });
  }
  syncPanel();
  apply();
}
