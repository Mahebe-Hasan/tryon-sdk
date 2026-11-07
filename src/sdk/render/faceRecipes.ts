import type { RegionId } from '../tracking/regions';
import type { PigmentParams } from './recipes';

/**
 * Face and eye product recipes (see docs/RENDERING_RESEARCH.md). Like lips, shoppers only
 * pick category + shade + finish + intensity. Two physical models are used:
 *
 *  - COVERAGE (`pigment` technique): a film that partly replaces the skin colour —
 *    foundation, skin tint, concealer. The region's mean CIELAB colour moves `shift` of the
 *    way to the shade; colour blotchiness is evened out (kC < 1); the face's large-scale
 *    light and shadow are kept (kL = 1); fine lines/pores are softened a little (`smooth`),
 *    as measured foundation fills fine wrinkles (Huang et al., NYCU).
 *
 *  - THIN LAYER (`layer` technique): a translucent pigment film that light passes through —
 *    blush, bronzer, contour, eyeshadow, highlighter (Kubelka-Munk thin layer). Each pixel is
 *    multiplied, in linear light, by (product ÷ the person's own mean skin colour)^density.
 *    At density 1 the region averages exactly the product colour; texture, pores and shading
 *    are untouched, which is what makes blush look natural rather than painted.
 *
 * Every product colour is lit by the measured scene light first (tracking/light.ts).
 */

export const FACE_CATEGORIES = [
  'foundation',
  'skin-tint',
  'concealer',
  'blush',
  'bronzer',
  'contour',
  'highlighter',
  'eyeshadow',
] as const;
export type FaceCategory = (typeof FACE_CATEGORIES)[number];

export const FACE_FINISHES = ['matte', 'natural', 'satin', 'dewy', 'shimmer', 'metallic'] as const;
export type FaceFinish = (typeof FACE_FINISHES)[number];

/** Parameters of the `layer` technique (see composite.frag.glsl). */
export interface LayerParams {
  /** Pigment density 0–1: how far the region moves toward the product colour. */
  density: number;
  /** Finish roughness (LipAT model): lower = shinier. Bare skin ≈ 0.3. */
  roughness: number;
  specScale: number;
  /** 0 = white shine; 1 = shine tinted by the product (metallic). */
  specTint: number;
  /** Additive light (highlighter): fraction of the product colour added as reflected light. */
  glow: number;
  sparkle: number;
  sparkleDensity: number;
  /** 0–1: apply only to skin (less on beard/hair). */
  skinOnly: number;
}

interface FinishShine {
  roughness: number;
  specScale: number;
  specTint: number;
  sparkle: number;
  sparkleDensity: number;
}

/** Finish → shine. Skin's own roughness ≈ 0.3 (LipAT); matte powders absorb shine. */
export const FACE_FINISH_PARAMS: Record<FaceFinish, FinishShine> = {
  matte: { roughness: 0.6, specScale: 0.6, specTint: 0, sparkle: 0, sparkleDensity: 260 },
  natural: { roughness: 0.35, specScale: 0.9, specTint: 0, sparkle: 0, sparkleDensity: 260 },
  satin: { roughness: 0.28, specScale: 1, specTint: 0, sparkle: 0, sparkleDensity: 260 },
  dewy: { roughness: 0.2, specScale: 1.15, specTint: 0, sparkle: 0, sparkleDensity: 260 },
  shimmer: { roughness: 0.25, specScale: 1.05, specTint: 0.2, sparkle: 0.12, sparkleDensity: 300 },
  metallic: { roughness: 0.18, specScale: 1.15, specTint: 0.7, sparkle: 0.06, sparkleDensity: 340 },
};

export type FaceRecipe =
  | {
      technique: 'pigment';
      regions: RegionId[];
      /** Region mean moves this far to the shade at intensity 1. */
      shift: number;
      kL: number;
      kC: number;
      smooth: number;
      feather: number;
      featherInset: number;
      defaultFinish: FaceFinish;
      finishes: readonly FaceFinish[];
      /** Cut these out with a crisp edge after feathering (e.g. the eyes). */
      erase?: RegionId[];
      /** Apply mainly where skin is darker ('dark') or redder ('red') than its surroundings. */
      target?: 'dark' | 'red';
    }
  | {
      technique: 'layer';
      regions: RegionId[];
      density: number;
      glow: number;
      feather: number;
      featherInset: number;
      defaultFinish: FaceFinish;
      finishes: readonly FaceFinish[];
      erase?: RegionId[];
    };

const SKIN_FINISHES = ['matte', 'natural', 'dewy'] as const;

export const FACE_RECIPES: Record<Exclude<FaceCategory, 'eyeshadow'>, FaceRecipe> = {
  // Medium coverage: evens tone, keeps freckles/shading partly visible.
  foundation: {
    technique: 'pigment',
    regions: ['faceSkin'],
    shift: 0.5,
    kL: 1,
    kC: 0.5,
    // ~35% fine-detail reduction: fills fine lines without the "plastic" look.
    smooth: 0.18,
    feather: 0.07,
    featherInset: 0.15,
    defaultFinish: 'natural',
    finishes: SKIN_FINISHES,
  },
  // Sheer: own skin clearly visible, slight evening and glow.
  'skin-tint': {
    technique: 'pigment',
    regions: ['faceSkin'],
    shift: 0.25,
    kL: 1,
    kC: 0.8,
    smooth: 0.15,
    feather: 0.07,
    featherInset: 0.15,
    defaultFinish: 'dewy',
    finishes: SKIN_FINISHES,
  },
  // High coverage on the under-eye: neutralises darkness, softens fine lines.
  concealer: {
    technique: 'pigment',
    regions: ['underEye.R', 'underEye.L'],
    // Blended-out coverage: brightens/neutralises without a visible crescent.
    shift: 0.55,
    kL: 0.95,
    kC: 0.5,
    smooth: 0.3,
    feather: 0.05,
    featherInset: 0,
    erase: ['eye.R', 'eye.L'],
    defaultFinish: 'natural',
    finishes: SKIN_FINISHES,
  },
  // Sheer wash on the cheek apples with a wide soft falloff — the "natural flush".
  blush: {
    technique: 'layer',
    // Default placement; the product's `style` picks another (BLUSH_STYLES).
    regions: ['blushLifted.R', 'blushLifted.L'],
    // Natural flush: about +10 a* at the densest point, fading smoothly to 0.
    density: 0.3,
    glow: 0,
    feather: 0.085,
    featherInset: 0,
    defaultFinish: 'satin',
    finishes: ['matte', 'satin', 'shimmer'],
  },
  bronzer: {
    technique: 'layer',
    regions: [
      'contourCheek.R',
      'contourCheek.L',
      'contourJaw.R',
      'contourJaw.L',
      'cheek.R',
      'cheek.L',
    ],
    density: 0.2,
    glow: 0,
    feather: 0.09,
    featherInset: 0,
    defaultFinish: 'matte',
    finishes: ['matte', 'satin', 'shimmer'],
  },
  contour: {
    technique: 'layer',
    regions: [
      'contourCheek.R',
      'contourCheek.L',
      'contourJaw.R',
      'contourJaw.L',
      'contourNose.R',
      'contourNose.L',
    ],
    // A soft shadow, not a stripe: a few L* darker.
    density: 0.22,
    glow: 0,
    feather: 0.065,
    featherInset: 0,
    defaultFinish: 'matte',
    finishes: ['matte'],
  },
  // Light-reflecting: adds light on the high points rather than absorbing it.
  highlighter: {
    technique: 'layer',
    regions: [
      'highlightCheek.R',
      'highlightCheek.L',
      'highlightNose',
      'highlightCupidsBow',
      'highlightBrowBone.R',
      'highlightBrowBone.L',
    ],
    // Mostly extra shine where light already hits (finish roughness), plus a little light.
    density: 0,
    glow: 0.07,
    feather: 0.06,
    featherInset: 0,
    defaultFinish: 'shimmer',
    finishes: ['satin', 'shimmer', 'metallic'],
  },
};

/** How blush is worn. */
export const BLUSH_STYLES = {
  lifted: ['blushLifted.R', 'blushLifted.L'],
  draped: ['blushDraped.R', 'blushDraped.L'],
  sunkissed: ['blushSunkissed'],
  apples: ['blushApples.R', 'blushApples.L'],
  vertical: ['blushVertical.R', 'blushVertical.L'],
} as const satisfies Record<string, readonly RegionId[]>;
export type BlushStyle = keyof typeof BLUSH_STYLES;
export const BLUSH_STYLE_NAMES = Object.keys(BLUSH_STYLES) as BlushStyle[];

/** Eyeshadow is placed in up to three tones: lid (strongest), crease (blended), outer V. */
export const EYESHADOW_RECIPE = {
  // Soft blended edges everywhere, then the eye opening is cut out → crisp at the lash line.
  lid: { regions: ['eyelidLid.R', 'eyelidLid.L'] as RegionId[], density: 0.5, feather: 0.03 },
  crease: {
    regions: ['eyelidCrease.R', 'eyelidCrease.L'] as RegionId[],
    density: 0.3,
    feather: 0.05,
  },
  outer: {
    regions: ['eyelidOuter.R', 'eyelidOuter.L'] as RegionId[],
    density: 0.4,
    feather: 0.035,
  },
  erase: ['eye.R', 'eye.L'] as RegionId[],
  /** With a single shade, the crease gets it at this fraction for a soft upward fade. */
  singleShadeCreaseScale: 0.55,
  defaultFinish: 'matte' as FaceFinish,
  finishes: ['matte', 'satin', 'shimmer', 'metallic'] as readonly FaceFinish[],
};

export function facePigmentParams(
  r: Extract<FaceRecipe, { technique: 'pigment' }>,
  finish: FaceFinish,
  intensity: number,
): PigmentParams {
  const f = FACE_FINISH_PARAMS[finish];
  return {
    kL: r.kL,
    // Lower intensity = less evening of colour too.
    kC: 1 - (1 - r.kC) * intensity,
    roughness: mixRough(f.roughness, intensity),
    specScale: 1 + (f.specScale - 1) * intensity,
    specTint: f.specTint,
    glossSpot: 0,
    sparkle: f.sparkle * intensity,
    sparkleDensity: f.sparkleDensity,
    lightAdapt: 0,
    shift: r.shift * intensity,
    smooth: r.smooth * intensity,
    skinOnly: 1,
    target: r.target === 'dark' ? 1 : r.target === 'red' ? 2 : 0,
  };
}

export function layerParams(
  density: number,
  glow: number,
  finish: FaceFinish,
  intensity: number,
): LayerParams {
  const f = FACE_FINISH_PARAMS[finish];
  return {
    density: density * intensity,
    roughness: mixRough(f.roughness, intensity),
    specScale: 1 + (f.specScale - 1) * intensity,
    specTint: f.specTint,
    glow: glow * intensity,
    sparkle: f.sparkle * intensity,
    sparkleDensity: f.sparkleDensity,
    skinOnly: 0.8,
  };
}

/** Blend a finish roughness toward bare skin (0.3) as intensity falls. */
function mixRough(r: number, intensity: number): number {
  return 0.3 + (r - 0.3) * intensity;
}
