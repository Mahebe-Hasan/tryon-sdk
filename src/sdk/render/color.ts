/**
 * Colour maths. Blends follow the W3C Compositing & Blending spec and operate on
 * gamma-encoded sRGB in 0–1 (like design tools). The GLSL versions in shaders/blend.glsl
 * must stay in sync with these CPU reference implementations (covered by unit tests).
 */

export type RGB = [number, number, number];

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'color',
  /**
   * Makeup mode (not W3C): the product colour, modulated by each pixel's brightness relative
   * to the region's average. The region shows the exact shade on average while keeping all of
   * its own light, shadow and texture — so the colour looks like it is ON the lips, not over.
   */
  'tint',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/** Index used by the shader's `u_mode` uniform. */
export function blendModeIndex(mode: BlendMode): number {
  return BLEND_MODES.indexOf(mode);
}

/** '#RGB', '#RRGGBB' or without '#'. Returns sRGB 0–1. Throws on invalid input. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Invalid hex colour: "${hex}"`);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToLinear(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Rec. 601 luma on gamma-encoded values (matches the shader's lum()). */
export function luma([r, g, b]: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---- Blend functions (b = backdrop, s = source) ------------------------------------------

const ch =
  (f: (b: number, s: number) => number) =>
  (b: RGB, s: RGB): RGB => [f(b[0], s[0]), f(b[1], s[1]), f(b[2], s[2])];

export const multiply = ch((b, s) => b * s);
export const screen = ch((b, s) => b + s - b * s);
export const overlay = ch((b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)));
export const softLight = ch((b, s) => {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
});

/** Luminosity used by the non-separable modes (W3C weights). */
export function lumW([r, g, b]: RGB): number {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

function clipColor(c: RGB): RGB {
  const l = lumW(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let out = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
}

function setLum(c: RGB, l: number): RGB {
  const d = l - lumW(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

/** Hue + saturation of the source, luminosity of the backdrop. */
export function colorBlend(b: RGB, s: RGB): RGB {
  return setLum(s, lumW(b));
}

/**
 * Tint: `s × shadeRatio`, where shadeRatio = pixel luminance / mean luminance of the region
 * (computed on the GPU from the mask). Clamped to 0–1.
 */
export function tint(s: RGB, shadeRatio: number): RGB {
  const r = Math.max(0, shadeRatio);
  return [Math.min(1, s[0] * r), Math.min(1, s[1] * r), Math.min(1, s[2] * r)];
}

export function blend(mode: BlendMode, b: RGB, s: RGB, shadeRatio = 1): RGB {
  switch (mode) {
    case 'tint':
      return tint(s, shadeRatio);
    case 'multiply':
      return multiply(b, s);
    case 'screen':
      return screen(b, s);
    case 'overlay':
      return overlay(b, s);
    case 'soft-light':
      return softLight(b, s);
    case 'color':
      return colorBlend(b, s);
    case 'normal':
      return [...s];
  }
}
