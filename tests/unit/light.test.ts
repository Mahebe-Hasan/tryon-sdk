import { describe, expect, it } from 'vitest';
import { LIGHT_CONFIG, estimateIlluminant } from '../../src/sdk/tracking/light';
import { linearToSrgb, srgbToLinear, type RGB } from '../../src/sdk/render/color';

const ref = LIGHT_CONFIG.referenceSclera;
/** Reference sclera under a light with linear gains g, as the camera would record it. */
const lit = (g: RGB): RGB =>
  ref.map((c, i) => linearToSrgb(Math.min(1, srgbToLinear(c) * (g[i] as number)))) as RGB;

/** Eye-region pixels: some sclera, plus darker lashes/lid/vessels that must be ignored. */
const eyePixels = (sclera: RGB): RGB[] => {
  const out: RGB[] = [];
  for (let i = 0; i < 40; i++) out.push(sclera);
  for (let i = 0; i < 60; i++) out.push([0.25, 0.18, 0.15]); // lid skin / lashes / shadow
  return out;
};

describe('estimateIlluminant (sclera white reference, Choi et al. 2017)', () => {
  it('returns ~1 for a correctly exposed daylight image', () => {
    const est = estimateIlluminant(eyePixels(ref));
    expect(est).not.toBeNull();
    est?.gain.forEach((g) => expect(g).toBeCloseTo(1, 2));
  });

  it('measures a dim room (half the light) from the brightest sclera pixels only', () => {
    const est = estimateIlluminant(eyePixels(lit([0.5, 0.5, 0.5])));
    est?.gain.forEach((g) => expect(g).toBeCloseTo(0.5, 2));
  });

  it('measures a warm (tungsten-like) light as higher red than blue gain', () => {
    const est = estimateIlluminant(eyePixels(lit([0.8, 0.65, 0.5])));
    expect(est?.gain[0]).toBeGreaterThan(est?.gain[1] ?? 0);
    expect(est?.gain[1]).toBeGreaterThan(est?.gain[2] ?? 0);
  });

  it('limits white-balance swings (a red sclera cannot turn the light red)', () => {
    const est = estimateIlluminant(eyePixels(lit([2, 0.6, 0.6])));
    const [r, g] = est?.gain ?? [0, 0, 0];
    expect(r / g).toBeLessThanOrEqual(LIGHT_CONFIG.maxChannelRatio ** 2 + 1e-9);
  });

  it('ignores clipped glare and needs enough pixels', () => {
    const glare: RGB[] = Array.from({ length: 50 }, () => [1, 1, 1]);
    expect(estimateIlluminant(glare)).toBeNull();
    expect(estimateIlluminant(eyePixels(ref).slice(0, 10))).toBeNull();
  });

  it('clamps extreme exposure', () => {
    const dark = estimateIlluminant(eyePixels([0.02, 0.02, 0.02]).map(() => [0.02, 0.02, 0.02]));
    dark?.gain.forEach((g) =>
      expect(g).toBeGreaterThanOrEqual(LIGHT_CONFIG.minGain / LIGHT_CONFIG.maxChannelRatio),
    );
  });
});
