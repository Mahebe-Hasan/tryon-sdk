import { describe, expect, it } from 'vitest';
import {
  hexToRgb,
  layerFactor,
  linearToSrgb,
  rgbToLab,
  srgbToLinear,
  type Lab,
  type RGB,
} from '../../src/sdk/render/color';
import { REGION_CONFIG } from '../../src/sdk/tracking/regions';
import {
  FACE_FINISH_PARAMS,
  FACE_RECIPES,
  EYESHADOW_RECIPE,
  facePigmentParams,
  layerParams,
} from '../../src/sdk/render/faceRecipes';
import {
  DRAW_ORDER,
  finishesFor,
  lookEffects,
  productEffects,
} from '../../src/sdk/session/products';
import { computeRegions } from '../../src/sdk/tracking/regions';

const lin = (c: RGB): RGB => c.map(srgbToLinear) as RGB;

describe('layerFactor (thin translucent layer: blush, eyeshadow …)', () => {
  const skin = lin([0.78, 0.6, 0.5]);
  const blush = lin([0.88, 0.48, 0.56]);

  it('density 0 changes nothing; density 1 turns the mean skin into the product', () => {
    expect(layerFactor(blush, skin, 0)).toEqual([1, 1, 1]);
    const f = layerFactor(blush, skin, 1);
    skin.forEach((s, i) => expect(s * (f[i] as number)).toBeCloseTo(blush[i] as number, 9));
  });

  it('is multiplicative, so texture and shading survive (ratios between pixels kept)', () => {
    const f = layerFactor(blush, skin, 0.4);
    const pore = skin.map((v) => v * 0.8) as RGB; // a darker pore
    const out = (p: RGB): RGB => p.map((v, i) => v * (f[i] as number)) as RGB;
    out(pore).forEach((v, i) => expect(v / (out(skin)[i] as number)).toBeCloseTo(0.8, 9));
  });

  it('a pink blush adds redness relative to green (a natural flush)', () => {
    const f = layerFactor(blush, skin, 0.4);
    expect(f[0]).toBeGreaterThan(f[1]);
  });

  it('clamps extreme ratios', () => {
    const f = layerFactor([1, 1, 1], [0.0001, 0.0001, 0.0001], 1);
    f.forEach((v) => expect(v).toBeLessThanOrEqual(2.5));
  });
});

describe('face recipes', () => {
  it('coverage ordering: concealer > foundation > skin tint; tint keeps more own colour', () => {
    const shift = (c: 'foundation' | 'skin-tint' | 'concealer'): number => {
      const r = FACE_RECIPES[c];
      return r.technique === 'pigment' ? r.shift : 0;
    };
    expect(shift('concealer')).toBeGreaterThan(shift('foundation'));
    expect(shift('foundation')).toBeGreaterThan(shift('skin-tint'));
    const f = FACE_RECIPES.foundation;
    const t = FACE_RECIPES['skin-tint'];
    if (f.technique === 'pigment' && t.technique === 'pigment') expect(t.kC).toBeGreaterThan(f.kC);
  });

  it('foundation keeps the face shading (kL = 1) and only softens fine detail', () => {
    const f = FACE_RECIPES.foundation;
    expect(f.technique).toBe('pigment');
    if (f.technique !== 'pigment') return;
    expect(f.kL).toBe(1);
    expect(f.smooth).toBeGreaterThan(0);
    expect(f.smooth).toBeLessThan(0.6);
  });

  it('blush is a soft, sheer layer; highlighter adds light instead of absorbing it', () => {
    const b = FACE_RECIPES.blush;
    const h = FACE_RECIPES.highlighter;
    expect(b.technique).toBe('layer');
    if (b.technique === 'layer') {
      expect(b.feather).toBeGreaterThanOrEqual(0.08);
      // Liquid (dewy) blush is more saturated than powder (matte).
      expect(b.densityByFinish?.dewy).toBeGreaterThan(b.densityByFinish?.matte ?? 1);
    }
    if (h.technique === 'layer') {
      expect(h.density).toBe(0);
      expect(h.glow).toBeGreaterThan(0);
    }
  });

  it('matte damps shine, dewy boosts it (roughness around bare skin 0.3)', () => {
    expect(FACE_FINISH_PARAMS.matte.roughness).toBeGreaterThan(0.3);
    expect(FACE_FINISH_PARAMS.dewy.roughness).toBeLessThan(0.3);
  });

  it('intensity scales coverage and fades finish back toward bare skin', () => {
    const f = FACE_RECIPES.foundation;
    if (f.technique !== 'pigment') return;
    const full = facePigmentParams(f, 'matte', 1);
    const half = facePigmentParams(f, 'matte', 0.5);
    expect(half.shift).toBeCloseTo(full.shift / 2);
    expect(Math.abs(half.roughness - 0.3)).toBeLessThan(Math.abs(full.roughness - 0.3));
    const l = layerParams(0.4, 0, 'satin', 0.25);
    expect(l.density).toBeCloseTo(0.1);
  });
});

describe('productEffects / looks', () => {
  it('foundation → pigment on face skin; blush → layer on both cheeks', () => {
    const [f] = productEffects({ id: 'f', category: 'foundation', color: '#d9ae8c' });
    expect(f?.blend).toBe('pigment');
    expect(f?.regions).toEqual(['faceSkin']);
    const [b] = productEffects({ id: 'b', category: 'blush', color: '#e07a8f' });
    expect(b?.blend).toBe('layer');
    expect(b?.regions).toEqual(['blushLifted.R', 'blushLifted.L']); // default style
  });

  it('single-shade eyeshadow fills lid and a softer crease; tones give up to three zones', () => {
    const single = productEffects({ id: 'e', category: 'eyeshadow', color: '#9c6a3f' });
    expect(single.map((e) => e.id)).toEqual(['e:crease', 'e:lid']);
    const [crease, lid] = single;
    expect(crease?.layer?.density).toBeLessThan(lid?.layer?.density ?? 0);
    const three = productEffects({
      id: 't',
      category: 'eyeshadow',
      color: '#e8d2b0',
      tones: { lid: '#e8d2b0', crease: '#9c6a3f', outer: '#3c3a3e' },
    });
    expect(three).toHaveLength(3);
    expect(EYESHADOW_RECIPE.lid.regions).toEqual(['eyelidLid.R', 'eyelidLid.L']);
  });

  it('falls back to the default finish when a finish is not offered', () => {
    const [c] = productEffects({
      id: 'c',
      category: 'contour',
      color: '#6e5548',
      finish: 'metallic',
    });
    expect(c?.layer?.roughness).toBeCloseTo(FACE_FINISH_PARAMS.matte.roughness);
    expect(finishesFor('contour')).toEqual(['matte']);
  });

  it('a look is drawn base-first, lips last, whatever order products were added', () => {
    const fx = lookEffects([
      { id: 'lip', category: 'lipstick', color: '#9b1b30' },
      { id: 'blush', category: 'blush', color: '#e07a8f' },
      { id: 'base', category: 'foundation', color: '#d9ae8c' },
    ]);
    expect(fx.map((e) => e.id)).toEqual(['base', 'blush', 'lip']);
    expect(DRAW_ORDER.indexOf('foundation')).toBeLessThan(DRAW_ORDER.indexOf('lipstick'));
  });
});

describe('eyeshadow regions', () => {
  const landmarks = Array.from({ length: 478 }, (_, i) => ({
    x: (i % 22) / 22,
    y: Math.floor(i / 22) / 22,
    z: 0,
  }));
  it('lid, crease and outer zones exist for both eyes', () => {
    const ids = new Set(computeRegions(landmarks, 640, 480).map((r) => r.id));
    for (const z of ['eyelidLid', 'eyelidCrease', 'eyelidOuter']) {
      expect(ids.has(`${z}.R` as never)).toBe(true);
      expect(ids.has(`${z}.L` as never)).toBe(true);
    }
  });
});

describe('realism fixes', () => {
  it('blush styles change placement (lifted, draped, sun-kissed, apples)', () => {
    const regions = (style: 'lifted' | 'draped' | 'sunkissed' | 'apples') =>
      productEffects({ id: 'b', category: 'blush', color: '#e07a8f', style })[0]?.regions;
    expect(regions('draped')).toEqual(['blushDraped.R', 'blushDraped.L']);
    expect(regions('sunkissed')).toEqual(['blushSunkissed']);
    expect(regions('apples')).toEqual(['blushApples.R', 'blushApples.L']);
  });

  it('eyeshadow and concealer cut the eye opening out (crisp lash line, eyes untouched)', () => {
    for (const fx of productEffects({ id: 'e', category: 'eyeshadow', color: '#9c6a3f' })) {
      expect(fx.erase).toEqual(['eye.R', 'eye.L']);
    }
    expect(productEffects({ id: 'c', category: 'concealer', color: '#f3d9c6' })[0]?.erase).toEqual([
      'eye.R',
      'eye.L',
    ]);
  });

  it('face products apply to skin only; lips do not use the skin filter', () => {
    expect(
      productEffects({ id: 'f', category: 'foundation', color: '#d9ae8c' })[0]?.pigment?.skinOnly,
    ).toBe(1);
    expect(
      productEffects({ id: 'l', category: 'lipstick', color: '#9b1b30' })[0]?.pigment?.skinOnly,
    ).toBe(0);
  });

  it('blush regions exist for both sides plus sun-kissed', () => {
    const landmarks = Array.from({ length: 478 }, (_, i) => ({
      x: (i % 22) / 22,
      y: Math.floor(i / 22) / 22,
      z: 0,
    }));
    const ids = new Set(computeRegions(landmarks, 640, 480).map((r) => r.id));
    for (const id of [
      'blushLifted.R',
      'blushDraped.L',
      'blushApples.R',
      'blushSunkissed',
      'eye.R',
      'eye.L',
    ]) {
      expect(ids.has(id as never)).toBe(true);
    }
  });
});

describe('blush strength (calibrated on brand photos of the same face)', () => {
  // Bare cheek ≈ L 80, a* 14; a pastel pink blush like the reference shade.
  const skin: RGB = [233 / 255, 188 / 255, 170 / 255];
  const pink = hexToRgb('#F59AA5');
  /** Peak coverage of a stroke of width w blurred with sigma = feather / 2 (both × face width). */
  const peak = (w: number, feather: number): number => erf(w / 2 / ((feather / 2) * Math.SQRT2));
  const shift = (density: number, cover: number): Lab => {
    const sl = lin(skin);
    const f = layerFactor(lin(pink), sl, density);
    const full = sl.map((v, i) => linearToSrgb(v * (f[i] as number))) as RGB;
    const out = skin.map((v, i) => v + ((full[i] as number) - v) * cover) as RGB;
    const a = rgbToLab(out);
    const b = rgbToLab(skin);
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  };
  const b = FACE_RECIPES.blush;
  const cover = peak(REGION_CONFIG.blush.liftedWidth, b.feather);
  const d = (f: 'matte' | 'satin' | 'dewy'): number =>
    b.technique === 'layer' ? (b.densityByFinish?.[f] ?? b.density) : 0;

  it('powder (matte) ≈ +13 a*, a few L* darker', () => {
    const [dL, da] = shift(d('matte'), cover);
    expect(da).toBeGreaterThan(10);
    expect(da).toBeLessThan(17);
    expect(dL).toBeLessThan(-2);
    expect(dL).toBeGreaterThan(-9);
  });

  it('liquid (dewy) ≈ +23 a*', () => {
    const [, da] = shift(d('dewy'), cover);
    expect(da).toBeGreaterThan(18);
    expect(da).toBeLessThan(27);
  });
});

/** Abramowitz–Stegun erf (max error 1.5e-7). */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return Math.sign(x) * y;
}
