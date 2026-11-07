import { describe, expect, it } from 'vitest';
import {
  BLEND_MODES,
  blend,
  blendModeIndex,
  colorBlend,
  hexToLinear,
  hexToRgb,
  linearToSrgb,
  lumW,
  multiply,
  overlay,
  rgbToHex,
  screen,
  softLight,
  srgbToLinear,
  type RGB,
} from '../../src/sdk/render/color';
import { BLEND_GLSL } from '../../src/sdk/render/blend';

const close = (a: RGB, b: RGB, d = 1e-6): void => {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, -Math.log10(d)));
};

describe('hex conversion', () => {
  it('parses 6- and 3-digit hex, with or without #', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb('00FF00')).toEqual([0, 1, 0]);
    expect(hexToRgb('#00f')).toEqual([0, 0, 1]);
  });

  it('rejects invalid colours', () => {
    expect(() => hexToRgb('#12')).toThrow(/Invalid hex/);
    expect(() => hexToRgb('#gggggg')).toThrow(/Invalid hex/);
  });

  it('round-trips through rgbToHex', () => {
    for (const hex of ['#9b1b30', '#c27c7c', '#000000', '#ffffff']) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });
});

describe('sRGB ↔ linear', () => {
  it('matches known values', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 10);
  });

  it('round-trips', () => {
    for (let v = 0; v <= 1; v += 0.05) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
  });

  it('hexToLinear converts each channel', () => {
    close(hexToLinear('#808080'), [0.2158605, 0.2158605, 0.2158605], 1e-6);
  });
});

describe('blend functions', () => {
  const g: RGB = [0.5, 0.5, 0.5];

  it('multiply / screen', () => {
    close(multiply(g, g), [0.25, 0.25, 0.25]);
    close(screen(g, g), [0.75, 0.75, 0.75]);
    close(multiply([0.8, 0.6, 0.4], [1, 1, 1]), [0.8, 0.6, 0.4]);
  });

  it('overlay uses the backdrop to pick multiply or screen', () => {
    close(overlay([0.25, 0.25, 0.25], g), [0.25, 0.25, 0.25]);
    close(overlay([0.75, 0.75, 0.75], [0.2, 0.2, 0.2]), [0.6, 0.6, 0.6]);
  });

  it('soft-light with a 50% grey source leaves the backdrop unchanged', () => {
    const b: RGB = [0.1, 0.4, 0.9];
    close(softLight(b, g), b);
  });

  it('soft-light darkens with dark sources and lightens with light ones', () => {
    const b: RGB = [0.5, 0.5, 0.5];
    expect(softLight(b, [0.2, 0.2, 0.2])[0]).toBeLessThan(0.5);
    expect(softLight(b, [0.8, 0.8, 0.8])[0]).toBeGreaterThan(0.5);
    // both branches of D(b)
    expect(softLight([0.2, 0.2, 0.2], [1, 1, 1])[0]).toBeCloseTo(
      ((16 * 0.2 - 12) * 0.2 + 4) * 0.2,
      9,
    );
    expect(softLight([0.64, 0.64, 0.64], [1, 1, 1])[0]).toBeCloseTo(0.8, 9);
  });

  it('color keeps the backdrop luminosity and the source hue', () => {
    const b: RGB = [0.6, 0.55, 0.5];
    const s: RGB = [0.6, 0.1, 0.2];
    const out = colorBlend(b, s);
    expect(lumW(out)).toBeCloseTo(lumW(b), 6);
    expect(out[0]).toBeGreaterThan(out[1]);
    out.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    });
  });

  it('normal returns the source', () => {
    close(blend('normal', g, [0.1, 0.2, 0.3]), [0.1, 0.2, 0.3]);
  });

  it('every mode stays within 0–1 for in-range inputs', () => {
    const vals = [0, 0.1, 0.25, 0.5, 0.75, 1];
    for (const mode of BLEND_MODES) {
      for (const b of vals)
        for (const s of vals) {
          const out = blend(mode, [b, 1 - b, b / 2], [s, s / 3, 1 - s]);
          out.forEach((v) => {
            expect(v).toBeGreaterThanOrEqual(-1e-9);
            expect(v).toBeLessThanOrEqual(1 + 1e-9);
          });
        }
    }
  });
});

describe('GLSL blend library stays in sync', () => {
  it('maps every BLEND_MODES index to a shader branch', () => {
    expect(blendModeIndex('normal')).toBe(0);
    BLEND_MODES.slice(1).forEach((_, i) => {
      expect(BLEND_GLSL).toContain(`mode == ${i + 1}`);
    });
  });
});
