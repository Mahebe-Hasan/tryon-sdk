import type { RegionShape } from '../tracking/regions';
import type { BlendMode, RGB } from './color';

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
  } satisfies Record<BlendMode, number>,
  /** How much skin/lip texture (local contrast) to put back on top, per blend mode. */
  detailByMode: {
    normal: 0.9,
    multiply: 0,
    screen: 0.4,
    overlay: 0,
    'soft-light': 0,
    color: 0,
  } satisfies Record<BlendMode, number>,
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
}

export type RendererKind = 'webgl2' | 'canvas2d';

export interface Renderer {
  readonly kind: RendererKind;
  readonly canvas: HTMLCanvasElement;
  /** Draw `source` with `effects` applied into `canvas` (resized to the source). */
  render(
    source: TexImageSource,
    width: number,
    height: number,
    effects: RenderEffect[],
    frame: FrameInfo,
  ): void;
  destroy(): void;
}
