/**
 * TryOn SDK — public entry point.
 *
 * The full `TryOn` API (create/open/setShade/...) arrives in Phase 8. Until then the building
 * blocks below are exported for the demo and for testing.
 */

export const VERSION = '0.0.3';

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
export { REGION_CONFIG, computeRegions, type Region, type RegionId } from './tracking/regions';
export { DEFAULT_ONE_EURO, type OneEuroParams } from './tracking/smoothing';
