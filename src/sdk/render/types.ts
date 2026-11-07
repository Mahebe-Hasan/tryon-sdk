import type { RegionShape } from '../tracking/regions';
import type { BlendMode, RGB } from './color';
import type { PigmentParams } from './recipes';
import type { LayerParams } from './faceRecipes';

/** Finishes the face renderer understands (nail finishes come in Phase 6). */
export const FINISHES = ['matte', 'satin', 'cream', 'gloss', 'shimmer', 'metallic'] as const;
export type Finish = (typeof FINISHES)[number];

export interface FinishParams {
  /** 0–1: darken the frame's own highlights (matte powder look). */
  matte: number;
  /** 0–1: add back the frame's own highlights on top of the colour. */
  highlightKeep: number;
  /** 0–1: strength of the white specular layer built from the frame's bright spots. */
  gloss: number;
  /** 0–1: face-anchored twinkling sparkle. */
  sparkle: number;
  /** 0–1: exaggerate shading contrast for a foil/metal look. */
  metal: number;
}

/** Tunable look of each finish (build plan rule 9: config, not hardcoded). */
export const FINISH_PRESETS: Record<Finish, FinishParams> = {
  matte: { matte: 0.85, highlightKeep: 0, gloss: 0, sparkle: 0, metal: 0 },
  satin: { matte: 0, highlightKeep: 0.5, gloss: 0.15, sparkle: 0, metal: 0 },
  cream: { matte: 0, highlightKeep: 0.8, gloss: 0.25, sparkle: 0, metal: 0 },
  gloss: { matte: 0, highlightKeep: 1, gloss: 0.9, sparkle: 0, metal: 0 },
  shimmer: { matte: 0, highlightKeep: 0.8, gloss: 0.45, sparkle: 0.6, metal: 0 },
  metallic: { matte: 0, highlightKeep: 1, gloss: 0.6, sparkle: 0.25, metal: 0.5 },
};

export const RENDER_CONFIG = {
  /** Mask texture resolution relative to the video (feathering hides the lower res). */
  maskScale: 0.5,
  /** Luminance (0–1) at which a shade is shown exactly as specified. */
  referenceLuminance: 0.5,
  /** How much each blend mode follows scene brightness (0 = never, 1 = fully). */
  lightAdaptByMode: {
    normal: 0.7,
    multiply: 0,
    screen: 0.3,
    overlay: 0.3,
    'soft-light': 0.3,
    color: 0,
    pigment: 0, // pigment effects carry their own lightAdapt (PigmentParams)
    layer: 0, // layer effects are lit by the scene illuminant
  } satisfies Record<BlendMode, number>,
  /** How much skin/lip texture (local contrast) to put back on top, per blend mode. */
  detailByMode: {
    normal: 0.9,
    multiply: 0,
    screen: 0.4,
    overlay: 0,
    'soft-light': 0,
    color: 0,
    pigment: 0, // pigment keeps texture through kL/kC instead
    layer: 0, // layer multiplies the real pixels, so texture is kept
  } satisfies Record<BlendMode, number>,
  /** Shine estimate: brightness above the local average that counts as specular. */
  specThreshold: 0.015,
  /** Shine estimate gain (higher = more of the bright detail treated as shine). */
  specGain: 1.8,
  /**
   * Pigment light adaptation reference: mean diffuse lip L* (CIELAB) treated as "normal
   * light". Approximate — real bare-lip L* varies widely across people (see research doc),
   * which is why lip light adaptation is kept weak and capped at ±12 L*.
   */
  pigmentReferenceL: 50,
  /** Minimum mask blur (in mask texels) so every edge is anti-aliased. */
  minFeatherTexels: 0.8,
  /** Sparkle cells per face width. */
  sparkleDensity: 120,
};

export interface RenderEffect {
  id: string;
  shapes: RegionShape[];
  /** sRGB 0–1. */
  color: RGB;
  blend: BlendMode;
  finish: Finish;
  /** 0–1, already multiplied by product opacity × intensity × tracking fade. */
  opacity: number;
  /** Soft-edge radius in frame pixels. */
  featherPx: number;
  /**
   * Where the soft edge sits: 0 = centred on the outline (blush, contour), 1 = entirely
   * inside it, so nothing bleeds past the outline (lips). Default 0.
   */
  featherInset?: number;
  /** Required when blend = 'pigment' (lip products, foundation, skin tint, concealer). */
  pigment?: PigmentParams;
  /** Required when blend = 'layer' (blush, bronzer, contour, highlighter, eyeshadow). */
  layer?: LayerParams;
  /**
   * Where the synthetic wet highlight sits (frame px): centre, radii along / across the lip
   * axis, and the unit lip axis. Lips only; omitted = no synthetic highlight.
   */
  glossSpot?: { x: number; y: number; rx: number; ry: number; ax: number; ay: number };
}

export interface FrameInfo {
  /** Seconds, for animated effects (sparkle). */
  time: number;
  /** Face width in frame pixels (scales texture-detail and sparkle). 0 if no face. */
  faceWidth: number;
  /**
   * Column-major 3×3 affine mapping frame pixels → face space (1 unit = face width,
   * origin between the eyes, rotated with the head). Used to anchor sparkle to the face.
   */
  faceTransform: Float32Array | null;
  /**
   * Scene light as per-channel linear gains relative to daylight (from the sclera, see
   * tracking/light.ts). Product colours are multiplied by it so they are lit like the face.
   * Omitted = [1, 1, 1].
   */
  illuminant?: RGB;
}

export type RendererKind = 'webgl2' | 'canvas2d';

export interface Renderer {
  readonly kind: RendererKind;
  readonly canvas: HTMLCanvasElement;
  /**
   * Snapshot the current camera frame. Call this immediately before running detection on
   * the same source, so the makeup is drawn on exactly the frame the landmarks came from
   * (otherwise the video can advance during detection and the makeup trails by a frame).
   */
  captureFrame(source: TexImageSource, width: number, height: number): void;
  /** Draw the captured frame with `effects` applied into `canvas`. */
  render(effects: RenderEffect[], frame: FrameInfo): void;
  destroy(): void;
}
