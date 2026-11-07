import type { RegionId } from '../tracking/regions';

/**
 * Product rendering recipes. Shoppers and brands never pick blend modes: a product's
 * CATEGORY and FINISH decide how it is rendered, as in commercial try-on (Perfect Corp's
 * API exposes only per-category texture enums + intensities; ModiFace/Banuba likewise).
 * Values come from the research in docs/RENDERING_RESEARCH.md — tune them there and here.
 */

export const LIP_CATEGORIES = [
  'lipstick',
  'liquid-lipstick',
  'lip-gloss',
  'lip-stain',
  'lip-liner',
] as const;
export type LipCategory = (typeof LIP_CATEGORIES)[number];

export const LIP_FINISHES = [
  'matte',
  'satin',
  'cream',
  'sheer',
  'gloss',
  'shimmer',
  'metallic',
] as const;
export type LipFinish = (typeof LIP_FINISHES)[number];

/** Parameters of the `pigment` technique (see composite.frag.glsl). */
export interface PigmentParams {
  /** How much of the lips' own lightness variation (lines, shading) shows through, 0–1. */
  kL: number;
  /** How much of the lips' own colour variation shows through, 0–1. */
  kC: number;
  /** Finish roughness for LipAT's specular update: 0.1 glossy … 0.7 matte (skin ≈ 0.3). */
  roughness: number;
  /** Extra multiplier on the updated shine (matte powders absorb more than roughness alone). */
  specScale: number;
  /** 0 = white shine (dielectric: gloss, cream); 1 = shine tinted by the product (metallic). */
  specTint: number;
  /** Synthetic wet highlight on the lower lip, 0–1 (gloss/vinyl look in flat lighting). */
  glossSpot: number;
  /** Face-anchored sparkle particles, 0–1 (shimmer, metallic). */
  sparkle: number;
  /** Sparkle cells per face width (smaller cells = finer shimmer). */
  sparkleDensity: number;
  /** How much the shade follows scene brightness (kept low: LipAT uses none). */
  lightAdapt: number;
}

export interface LipRecipe {
  regions: RegionId[];
  /** Pigment coverage at intensity 1. */
  opacity: number;
  kL: number;
  kC: number;
  /** Soft-edge radius as a fraction of face width. */
  feather: number;
  /** 0 = soft edge centred on the outline, 1 = fully inside the lip line. */
  featherInset: number;
  defaultFinish: LipFinish;
}

/** Finish → shine behaviour. Roughness values from LipAT (0.1 glossy, 0.7 matte). */
export const LIP_FINISH_PARAMS: Record<
  LipFinish,
  Omit<PigmentParams, 'kL' | 'kC' | 'lightAdapt'> & { opacityScale: number }
> = {
  matte: {
    roughness: 0.7,
    specScale: 0.55,
    specTint: 0,
    glossSpot: 0,
    sparkle: 0,
    sparkleDensity: 140,
    opacityScale: 1,
  },
  satin: {
    roughness: 0.4,
    specScale: 1,
    specTint: 0,
    glossSpot: 0.08,
    sparkle: 0,
    sparkleDensity: 140,
    opacityScale: 1,
  },
  cream: {
    roughness: 0.3,
    specScale: 1,
    specTint: 0,
    glossSpot: 0.16,
    sparkle: 0,
    sparkleDensity: 140,
    opacityScale: 1,
  },
  // Sheer: low pigment load, so the natural lip shows through.
  sheer: {
    roughness: 0.2,
    specScale: 1.05,
    specTint: 0,
    glossSpot: 0.25,
    sparkle: 0,
    sparkleDensity: 140,
    opacityScale: 0.55,
  },
  gloss: {
    roughness: 0.1,
    specScale: 1.15,
    specTint: 0,
    glossSpot: 0.5,
    sparkle: 0,
    sparkleDensity: 140,
    opacityScale: 1,
  },
  shimmer: {
    roughness: 0.25,
    specScale: 1,
    specTint: 0.15,
    glossSpot: 0.22,
    sparkle: 0.45,
    sparkleDensity: 170,
    opacityScale: 1,
  },
  metallic: {
    roughness: 0.2,
    specScale: 1.1,
    specTint: 0.7,
    glossSpot: 0.3,
    sparkle: 0.18,
    sparkleDensity: 220,
    opacityScale: 1,
  },
};

export const LIP_RECIPES: Record<LipCategory, LipRecipe> = {
  // Bullet lipstick: high pigment, some lip texture visible.
  lipstick: {
    regions: ['lips'],
    opacity: 0.88,
    kL: 0.85,
    kC: 0.35,
    feather: 0.012,
    featherInset: 1,
    defaultFinish: 'satin',
  },
  // Liquid lipstick dries to a full-coverage film that hides more of the lip.
  'liquid-lipstick': {
    regions: ['lips'],
    opacity: 0.95,
    kL: 0.7,
    kC: 0.2,
    feather: 0.01,
    featherInset: 1,
    defaultFinish: 'matte',
  },
  // Gloss: transparent tint, lips' own colour mostly visible, very shiny.
  'lip-gloss': {
    regions: ['lips'],
    opacity: 0.42,
    kL: 1,
    kC: 0.75,
    feather: 0.014,
    featherInset: 1,
    defaultFinish: 'gloss',
  },
  // Stain/tint: dyes the lips, natural texture and shine stay.
  'lip-stain': {
    regions: ['lips'],
    opacity: 0.6,
    kL: 1,
    kC: 0.6,
    feather: 0.016,
    featherInset: 1,
    defaultFinish: 'sheer',
  },
  // Liner: thin defined line along the outer lip edge.
  'lip-liner': {
    regions: ['lipLine'],
    opacity: 0.9,
    kL: 0.7,
    kC: 0.2,
    feather: 0.005,
    featherInset: 0.3,
    defaultFinish: 'matte',
  },
};

/**
 * Extra brightness adaptation from the lips themselves. 0: scene light is handled physically
 * by the sclera-based illuminant (tracking/light.ts), and lip lightness varies too much
 * between people to be a light meter.
 */
export const LIP_LIGHT_ADAPT = 0;

export function pigmentParams(category: LipCategory, finish: LipFinish): PigmentParams {
  const r = LIP_RECIPES[category];
  const f = LIP_FINISH_PARAMS[finish];
  return {
    kL: r.kL,
    kC: r.kC,
    roughness: f.roughness,
    specScale: f.specScale,
    specTint: f.specTint,
    glossSpot: f.glossSpot,
    sparkle: f.sparkle,
    sparkleDensity: f.sparkleDensity,
    lightAdapt: LIP_LIGHT_ADAPT,
  };
}
