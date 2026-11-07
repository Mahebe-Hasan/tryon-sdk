import {
  BLUSH_STYLE_NAMES,
  finishesFor,
  type BlushStyle,
  type FaceView,
  type Product,
  type ProductCategory,
  type ProductFinish,
} from '../sdk/index';

/**
 * Look builder, like a shop: pick a product type, tap a shade, choose finish and intensity.
 * Several products stack into one look (foundation + blush + eyeshadow + lipstick …).
 * Rendering is decided entirely by the SDK's product recipes.
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
const SHADES: Record<ProductCategory, Shade[]> = {
  foundation: SKIN,
  'skin-tint': SKIN,
  concealer: SKIN.map((s) => ({ name: `${s.name} Light`, hex: lighten(s.hex, 0.12) })),
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

export function mountTestEffect(host: HTMLElement, view: FaceView, initial: string | null): void {
  const look = new Map<string, Product & { shadeName: string }>();
  let category: ProductCategory = 'lipstick';
  let showMakeup = true;
  const finishByCat = new Map<ProductCategory, ProductFinish>();
  const intensityByCat = new Map<ProductCategory, number>();
  let blushStyle: BlushStyle = 'lifted';

  host.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = 'Build a look';
  const applied = document.createElement('div');
  applied.className = 'chips';
  const grid = document.createElement('div');
  grid.className = 'fx-grid';
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  swatches.setAttribute('role', 'radiogroup');
  const shadeName = document.createElement('p');
  shadeName.className = 'shade-name';
  host.append(title, grid, swatches, shadeName, applied);

  const field = (label: string, input: HTMLElement): HTMLLabelElement => {
    const l = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    l.append(span, input);
    grid.append(l);
    return l;
  };

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
  const intensity = document.createElement('input');
  intensity.type = 'range';
  intensity.min = '0.15';
  intensity.max = '1';
  intensity.step = '0.05';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn';

  field('Product', categorySel);
  field('Finish', finishSel);
  const styleSel = document.createElement('select');
  const STYLE_LABELS: Record<BlushStyle, string> = {
    lifted: 'Lifted (to temples)',
    draped: 'Draped (cheekbone)',
    sunkissed: 'Sun-kissed (over nose)',
    apples: 'Apples (round)',
  };
  for (const st of BLUSH_STYLE_NAMES) {
    const o = document.createElement('option');
    o.value = st;
    o.textContent = STYLE_LABELS[st];
    styleSel.append(o);
  }
  const styleField = field('Style', styleSel);
  field('Intensity', intensity);
  field('Before / after', toggle);

  const current = (): (Product & { shadeName: string }) | undefined => {
    const p = look.get(slotOf(category));
    return p && p.category === category ? p : undefined;
  };

  const apply = (): void => {
    view.setProducts(showMakeup ? [...look.values()] : []);
    toggle.textContent = showMakeup ? 'Show without' : 'Show with';
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
      ...(category === 'blush' && { style: blushStyle }),
    });
    showMakeup = true;
    syncPanel();
    apply();
  };

  const updateCurrent = (): void => {
    const p = current();
    if (!p) return;
    p.finish = finishByCat.get(category) ?? p.finish;
    p.intensity = intensityByCat.get(category) ?? p.intensity;
    if (category === 'blush') p.style = blushStyle;
    apply();
  };

  function syncPanel(): void {
    categorySel.value = category;
    finishSel.innerHTML = '';
    for (const f of finishesFor(category)) {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = FINISH_LABELS[f];
      finishSel.append(o);
    }
    finishSel.value = finishByCat.get(category) ?? (finishesFor(category)[0] as ProductFinish);
    intensity.value = String(intensityByCat.get(category) ?? 1);
    styleField.hidden = category !== 'blush';
    styleSel.value = blushStyle;
    const cur = current();
    swatches.innerHTML = '';
    swatches.setAttribute('aria-label', `${LABELS[category]} shade`);
    for (const s of SHADES[category]) {
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
    if (look.size === 0) return;
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
  finishSel.addEventListener('change', () => {
    finishByCat.set(category, finishSel.value as ProductFinish);
    updateCurrent();
  });
  styleSel.addEventListener('change', () => {
    blushStyle = styleSel.value as BlushStyle;
    updateCurrent();
  });
  intensity.addEventListener('input', () => {
    intensityByCat.set(category, Number(intensity.value));
    updateCurrent();
  });
  toggle.addEventListener('click', () => {
    showMakeup = !showMakeup;
    apply();
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
