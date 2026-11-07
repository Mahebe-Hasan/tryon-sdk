/**
 * TryOn SDK — public entry point.
 *
 * The full `TryOn` API (create/open/setShade/...) arrives in Phase 8. Until then the building
 * blocks below are exported for the demo and for testing.
 */

export const VERSION = '0.0.10';

export const PRIVACY_STATEMENT =
  'Your camera stays on your device. The try-on runs entirely in your browser — no images or video are uploaded, stored, or shared.';

export interface EnvironmentSupport {
  /** Page is served over HTTPS or from localhost (required for camera access). */
  secureContext: boolean;
  /** `navigator.mediaDevices.getUserMedia` exists. */
  camera: boolean;
  /** A WebGL2 context can be created. */
  webgl2: boolean;
}

export function checkSupport(win: Window = window): EnvironmentSupport {
  return {
    secureContext: win.isSecureContext,
    camera: typeof win.navigator.mediaDevices?.getUserMedia === 'function',
    webgl2: hasWebGL2(win.document),
  };
}

function hasWebGL2(doc: Document): boolean {
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const ok = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export { Camera, type CameraState, type Facing } from './camera/camera';
export {
  FaceView,
  type FaceViewOptions,
  type FaceViewEvents,
  type EffectSpec,
} from './session/faceView';
export {
  createRenderer,
  BLEND_MODES,
  FINISHES,
  FINISH_PRESETS,
  RENDER_CONFIG,
  type BlendMode,
  type Finish,
  type RendererPreference,
} from './render/index';
export {
  LIP_CATEGORIES,
  LIP_FINISHES,
  LIP_RECIPES,
  LIP_FINISH_PARAMS,
  pigmentParams,
  type LipCategory,
  type LipFinish,
  type PigmentParams,
} from './render/recipes';
export {
  DRAW_ORDER,
  finishesFor,
  isFaceCategory,
  isLipCategory,
  lipProductEffect,
  lookEffects,
  productEffects,
  type LipProduct,
  type Product,
  type ProductCategory,
  type ProductFinish,
} from './session/products';
export {
  FACE_SHAPE_PLACEMENTS,
  CONCEALER_TYPES,
  CONCEALER_RECIPES,
  type Placement,
  type ConcealerType,
} from './render/placements';
export {
  FACE_SHAPES,
  FACE_SHAPE_CONFIG,
  classifyFaceShape,
  faceShapeFeatures,
  type FaceShape,
  type FaceShapeFeatures,
} from './tracking/faceShape';
export {
  EYESHADOW_RECIPE,
  BLUSH_STYLES,
  BLUSH_STYLE_NAMES,
  type BlushStyle,
  FACE_CATEGORIES,
  FACE_FINISHES,
  FACE_FINISH_PARAMS,
  FACE_RECIPES,
  type FaceCategory,
  type FaceFinish,
  type LayerParams,
} from './render/faceRecipes';
export { LIGHT_CONFIG, estimateIlluminant, type IlluminantEstimate } from './tracking/light';
export { REGION_CONFIG, computeRegions, type Region, type RegionId } from './tracking/regions';
export { DEFAULT_ONE_EURO, type OneEuroParams } from './tracking/smoothing';
