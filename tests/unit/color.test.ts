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
  rgbToLab,
  labToRgb,
  deltaE76,
  pigmentTransfer,
  lipSpecular,
  type Lab,
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

describe('CIELAB (D65)', () => {
  it('matches reference values', () => {
    const white = rgbToLab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(100, 2);
    expect(Math.abs(white[1])).toBeLessThan(0.01);
    expect(Math.abs(white[2])).toBeLessThan(0.01);
    // sRGB pure red ≈ L 53.24, a 80.09, b 67.20 (standard published value)
    const red = rgbToLab([1, 0, 0]);
    expect(red[0]).toBeCloseTo(53.24, 1);
    expect(red[1]).toBeCloseTo(80.09, 1);
    expect(red[2]).toBeCloseTo(67.2, 1);
  });

  it('round-trips sRGB → Lab → sRGB', () => {
    for (const hex of ['#9b1b30', '#c27c7c', '#e8b07a', '#5a2a1e', '#20120f', '#f4e1dc']) {
      close(labToRgb(rgbToLab(hexToRgb(hex))), hexToRgb(hex), 1e-4);
    }
  });

  it('deltaE76 is 0 for equal colours and grows with difference', () => {
    const a = rgbToLab(hexToRgb('#9b1b30'));
    expect(deltaE76(a, a)).toBe(0);
    expect(deltaE76(a, rgbToLab(hexToRgb('#9c1b30')))).toBeLessThan(1);
    expect(deltaE76(a, rgbToLab(hexToRgb('#c27c7c')))).toBeGreaterThan(20);
  });
});

describe('pigment transfer (Shiseido / LipAT lipstick method)', () => {
  const mean: Lab = [52, 22, 12]; // a typical bare-lip mean
  const product = rgbToLab(hexToRgb('#9b1b30'));

  it('a pixel at the region mean becomes exactly the product colour', () => {
    expect(pigmentTransfer(mean, mean, product, 0.85, 0.35)).toEqual(product);
  });

  it('keeps kL of the lightness variation and kC of the colour variation', () => {
    const pixel: Lab = [62, 26, 10]; // lighter, slightly redder spot
    const out = pigmentTransfer(pixel, mean, product, 0.85, 0.35);
    expect(out[0] - product[0]).toBeCloseTo(0.85 * 10, 9);
    expect(out[1] - product[1]).toBeCloseTo(0.35 * 4, 9);
    expect(out[2] - product[2]).toBeCloseTo(0.35 * -2, 9);
  });

  it('the region mean of the output equals the product colour (any texture)', () => {
    const pixels: Lab[] = [
      [40, 18, 10],
      [60, 25, 14],
      [55, 20, 8],
      [53, 25, 16],
    ];
    const mu: Lab = [0, 1, 2].map(
      (c) => pixels.reduce((s, p) => s + (p[c] as number), 0) / pixels.length,
    ) as Lab;
    const outs = pixels.map((p) => pigmentTransfer(p, mu, product, 0.8, 0.3));
    [0, 1, 2].forEach((c) => {
      const avg = outs.reduce((s, p) => s + (p[c] as number), 0) / outs.length;
      expect(avg).toBeCloseTo(product[c] as number, 9);
    });
  });
});

describe('lipSpecular (LipAT roughness → shine)', () => {
  it('glossy (0.1) boosts shine, matte (0.7) damps it, skin (0.3) about unchanged', () => {
    const s = 0.3;
    expect(lipSpecular(s, 0.1)).toBeGreaterThan(s);
    expect(lipSpecular(s, 0.7)).toBeLessThan(s);
    expect(Math.abs(lipSpecular(s, 0.3) - s)).toBeLessThan(0.15);
  });

  it('keeps 0 → 0 and stays within 0–1', () => {
    for (const r of [0, 0.1, 0.4, 0.7, 1]) {
      expect(lipSpecular(0, r)).toBe(0);
      expect(lipSpecular(1, r)).toBeCloseTo(1, 9);
    }
  });
});
