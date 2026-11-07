import type { FaceShape } from '../tracking/faceShape';
import type { RegionId } from '../tracking/regions';
import type { BlushStyle, FaceFinish, FaceRecipe } from './faceRecipes';

/**
 * Where blush, contour, bronzer and highlighter go for each face shape — the standard
 * makeup-artist rules (references supplied by the product owner: face-shape charts for blush,
 * contour/highlight placement and the round-face guide):
 *
 *  - Round:    contour temples + down the sides of the face; vertical blush; highlight down
 *              the centre (forehead, nose, chin) → elongates.
 *  - Oval:     light contour under cheekbones/temples; lifted blush; classic highlight.
 *  - Square:   contour temples and jaw corners (softens angles); angled/lifted blush.
 *  - Oblong:   contour hairline and under the chin (shortens); horizontal (sun-kissed) blush;
 *              highlight across the cheekbones, not down the centre.
 *  - Heart:    contour temples/forehead sides; blush on the apples; highlight the chin.
 *  - Diamond:  contour the widest cheekbone area; blush on the apples; highlight forehead and chin.
 *  - Triangle: contour the jaw; draped blush and highlight up top to balance.
 */
export interface Placement {
  blush: BlushStyle;
  contour: RegionId[];
  bronzer: RegionId[];
  highlighter: RegionId[];
}

const both = (base: string): RegionId[] => [`${base}.R` as RegionId, `${base}.L` as RegionId];

export const FACE_SHAPE_PLACEMENTS: Record<FaceShape, Placement> = {
  oval: {
    blush: 'lifted',
    contour: [...both('contourCheek'), ...both('contourTemple')],
    bronzer: [...both('contourTemple'), ...both('contourCheek'), ...both('contourJaw')],
    highlighter: [
      'highlightForehead',
      ...both('highlightUnderEye'),
      'highlightNose',
      'highlightChin',
      ...both('highlightCheek'),
    ],
  },
  round: {
    blush: 'vertical',
    contour: [...both('contourTemple'), ...both('contourSideFace'), ...both('contourCheek')],
    bronzer: [...both('contourTemple'), ...both('contourSideFace'), ...both('contourJaw')],
    highlighter: [
      'highlightForehead',
      'highlightNose',
      'highlightChin',
      ...both('highlightUnderEye'),
    ],
  },
  square: {
    blush: 'lifted',
    contour: [...both('contourTemple'), ...both('contourCheek'), ...both('contourJawCorner')],
    bronzer: [...both('contourTemple'), ...both('contourCheek'), ...both('contourJawCorner')],
    highlighter: [
      'highlightForehead',
      ...both('highlightUnderEye'),
      'highlightNose',
      'highlightChin',
    ],
  },
  oblong: {
    blush: 'sunkissed',
    contour: ['contourHairline', 'contourUnderChin', ...both('contourCheek')],
    bronzer: ['contourHairline', ...both('contourCheek'), 'contourUnderChin'],
    highlighter: [...both('highlightCheek'), ...both('highlightUnderEye'), 'highlightCupidsBow'],
  },
  heart: {
    blush: 'apples',
    contour: [...both('contourTemple'), ...both('contourCheek')],
    bronzer: [...both('contourTemple'), ...both('contourCheek')],
    highlighter: [
      'highlightChin',
      ...both('highlightUnderEye'),
      'highlightNose',
      ...both('highlightCheek'),
    ],
  },
  diamond: {
    blush: 'apples',
    contour: [...both('contourCheek'), ...both('contourSideFace')],
    bronzer: [...both('contourTemple'), ...both('contourCheek')],
    highlighter: [
      'highlightForehead',
      'highlightChin',
      ...both('highlightUnderEye'),
      'highlightNose',
    ],
  },
  triangle: {
    blush: 'draped',
    contour: [...both('contourJaw'), ...both('contourJawCorner'), ...both('contourCheek')],
    bronzer: [...both('contourCheek'), ...both('contourJaw')],
    highlighter: [
      'highlightForehead',
      ...both('highlightCheek'),
      ...both('highlightUnderEye'),
      ...both('highlightBrowBone'),
    ],
  },
};

/**
 * Concealer types (standard colour-correction theory):
 *  - cover:    own skin shade over darker/uneven spots (under-eye, sides of the nose),
 *              applied more where the skin is darker than its surroundings.
 *  - brighten: a shade lighter than the skin on the high points (under-eye triangle, nose
 *              bridge, centre forehead, chin, above the cheek apples).
 *  - peach:    peach/orange corrector cancels blue-purple darkness (dark circles).
 *  - green:    green corrector cancels redness; applied only where skin is redder than average.
 */
export const CONCEALER_TYPES = ['cover', 'brighten', 'peach', 'green'] as const;
export type ConcealerType = (typeof CONCEALER_TYPES)[number];

type PigmentRecipe = Extract<FaceRecipe, { technique: 'pigment' }>;
const SKIN_FINISHES: readonly FaceFinish[] = ['natural', 'matte', 'dewy'];

export const CONCEALER_RECIPES: Record<ConcealerType, PigmentRecipe> = {
  cover: {
    technique: 'pigment',
    regions: [...both('underEye'), ...both('contourNose')],
    shift: 0.6,
    kL: 0.95,
    kC: 0.45,
    smooth: 0.3,
    feather: 0.045,
    featherInset: 0,
    target: 'dark',
    erase: both('eye'),
    defaultFinish: 'natural',
    finishes: SKIN_FINISHES,
  },
  brighten: {
    technique: 'pigment',
    regions: [
      ...both('highlightUnderEye'),
      'highlightNose',
      'highlightForehead',
      'highlightChin',
      ...both('highlightCheek'),
    ],
    shift: 0.45,
    kL: 1,
    kC: 0.7,
    smooth: 0.2,
    feather: 0.05,
    featherInset: 0,
    erase: both('eye'),
    defaultFinish: 'natural',
    finishes: SKIN_FINISHES,
  },
  peach: {
    technique: 'pigment',
    regions: both('underEye'),
    shift: 0.45,
    kL: 0.95,
    kC: 0.4,
    smooth: 0.2,
    feather: 0.045,
    featherInset: 0,
    target: 'dark',
    erase: both('eye'),
    defaultFinish: 'natural',
    finishes: SKIN_FINISHES,
  },
  green: {
    technique: 'pigment',
    regions: ['faceSkin'],
    // Neutralise, don't paint green: a red patch moves to about the surrounding skin tone
    // (synthetic check: a* 27 → ~13 with skin at 18), plain skin untouched.
    shift: 0.2,
    kL: 1,
    kC: 0.35,
    smooth: 0,
    feather: 0.06,
    featherInset: 0.15,
    target: 'red',
    defaultFinish: 'natural',
    finishes: SKIN_FINISHES,
  },
};
