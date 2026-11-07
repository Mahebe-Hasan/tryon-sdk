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
   * Makeup pigment transfer (not W3C; used for lip products). The industry method from the
   * Shiseido US10939742 patent and Amazon's LipAT (WACV 2024): split the image into diffuse
   * colour and specular shine, shift the region's mean CIELAB colour to the product colour
   * while keeping each pixel's deviation from that mean (texture/shading), rescale the shine
   * by the product's roughness, then screen-blend the shine back. See `pigmentTransfer`,
   * `lipSpecular` and docs/RENDERING_RESEARCH.md.
   */
  'pigment',
  /**
   * Thin translucent pigment layer (blush, bronzer, contour, eyeshadow, highlighter): each
   * pixel × (product ÷ region mean)^density in linear light (Kubelka-Munk thin layer). See
   * `layerFactor` and docs/RENDERING_RESEARCH.md.
   */
  'layer',
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

// ---- CIELAB (D65), matches shaders/lab.glsl --------------------------------------------

export type Lab = [number, number, number];

const WHITE_D65 = [0.95047, 1, 1.08883] as const;

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
}
function labFInv(t: number): number {
  return t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27);
}

/** sRGB (0–1) → CIELAB (L 0–100, a/b roughly −128..127), D65 white. */
export function rgbToLab([r, g, b]: RGB): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / WHITE_D65[0];
  const y = (0.2126729 * R + 0.7151522 * G + 0.072175 * B) / WHITE_D65[1];
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / WHITE_D65[2];
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB → sRGB (0–1, clamped). */
export function labToRgb([L, a, bb]: Lab): RGB {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const x = labFInv(fx) * WHITE_D65[0];
  const y = labFInv(fy) * WHITE_D65[1];
  const z = labFInv(fz) * WHITE_D65[2];
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const c = (v: number): number => Math.min(1, Math.max(0, linearToSrgb(Math.max(0, v))));
  return [c(R), c(G), c(B)];
}

/** CIE76 colour difference. ΔE < ~2.3 is a "just noticeable difference". */
export function deltaE76(p: Lab, q: Lab): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * Pigment transfer for one pixel (CPU reference of the shader):
 *   L' = L_product + kL·(L − L̄),  ab' = ab_product + kC·(ab − āb̄)
 * where L̄/āb̄ are the region's mask-weighted mean. kL/kC ∈ [0,1] are how much of the lip's own
 * lightness/colour variation shows through (Shiseido's α; LipAT uses 1). Full-coverage
 * products use lower values.
 */
export function pigmentTransfer(
  pixel: Lab,
  regionMean: Lab,
  product: Lab,
  kL: number,
  kC: number,
): Lab {
  return [
    product[0] + kL * (pixel[0] - regionMean[0]),
    product[1] + kC * (pixel[1] - regionMean[1]),
    product[2] + kC * (pixel[2] - regionMean[2]),
  ];
}

/**
 * Specular update by product roughness (LipAT eq. 4, regressed on PBR renders):
 *   S' = 1 − (1 − S)^γ,  γ = 2.42·e^(−1.55·roughness)
 * roughness 0.1 = glossy (γ≈2.07, boosts shine), 0.7 = matte (γ≈0.82, damps it), bare skin ≈0.3.
 */
export function lipSpecular(s: number, roughness: number): number {
  const gamma = 2.42 * Math.exp(-1.55 * roughness);
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, s)), gamma);
}

/**
 * Thin-layer factor (CPU reference of the shader): per linear channel
 * (product ÷ regionMean)^density, ratio clamped to 0–2.5. Multiply a linear skin pixel by it.
 * At density 1 a pixel equal to the region mean becomes the product colour; at 0 nothing changes.
 */
export function layerFactor(productLin: RGB, regionMeanLin: RGB, density: number): RGB {
  return productLin.map((p, i) => {
    const ratio = Math.min(2.5, Math.max(0, p / Math.max(regionMeanLin[i] as number, 0.02)));
    return Math.pow(ratio, density);
  }) as RGB;
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
 * Simple per-pixel blends. `pigment` needs region statistics, so here it degrades to the
 * pixel-equals-region-mean case (the exact product colour); use `pigmentTransfer` for the
 * full per-pixel behaviour.
 */
export function blend(mode: BlendMode, b: RGB, s: RGB): RGB {
  switch (mode) {
    case 'pigment':
    case 'layer':
      return [...s];
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
