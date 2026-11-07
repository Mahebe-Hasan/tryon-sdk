import type { Point3 } from './smoothing';

/**
 * Face-shape detection from landmarks, used to choose makeup placement (blush, contour,
 * bronzer, highlighter) the way makeup artists do.
 *
 * Features (all relative to cheekbone width 234↔454): face length 10↔152, forehead width
 * 54↔284, jaw width 172↔397, and the jaw angle at the gonion.
 *
 * Calibration (2026-11-08): MediaPipe's mesh is regularised, so real differences between
 * shapes are small (length/width 1.10–1.21, jaw 0.75–0.85). Prototypes below were fitted on
 * 21 labelled faces (a 16-face contour chart + labelled photos): 14/15 usable samples correct;
 * the miss was a chart "square" whose jaw the mesh smooths into an oval. Users can override.
 */

export const FACE_SHAPES = [
  'oval',
  'round',
  'square',
  'oblong',
  'heart',
  'diamond',
  'triangle',
] as const;
export type FaceShape = (typeof FACE_SHAPES)[number];

export interface FaceShapeFeatures {
  /** Face length ÷ cheekbone width. */
  length: number;
  /** Forehead width ÷ cheekbone width. */
  forehead: number;
  /** Jaw width ÷ cheekbone width. */
  jaw: number;
  /** Mean jaw angle at the gonions, degrees (smaller = more angular). */
  jawAngle: number;
  /** Left/right cheek distance ratio from the nose tip (1 = facing the camera). */
  yaw: number;
}

export const FACE_SHAPE_CONFIG = {
  /** Population centre of the features (from the calibration set). */
  center: { length: 1.165, forehead: 0.865, jaw: 0.79, jawAngle: 135.5 },
  /** Feature spread used to normalise distances. */
  scale: { length: 0.035, forehead: 0.02, jaw: 0.02, jawAngle: 2.5 },
  /** Prototypes in normalised units: [length, forehead, jaw, jawAngle]. */
  prototypes: {
    oval: [0.2, 0, -0.3, 0.3],
    round: [-1.5, 0, 0.2, 1.0],
    square: [-0.4, -0.3, 2.2, -2.2],
    oblong: [1.2, 0, 0.4, -0.3],
    heart: [0, 0.8, -1.3, 1.2],
    diamond: [0.6, -0.9, -0.9, 0.6],
    triangle: [-0.4, -1.6, 1.0, 0],
  } satisfies Record<FaceShape, [number, number, number, number]>,
  /** Only measure near-frontal faces (|yaw ratio − 1| below this) with little roll. */
  maxYaw: 0.12,
  maxRollRad: 0.2,
  /** Frames collected before deciding; then the vote keeps updating slowly. */
  minFrames: 20,
  windowFrames: 90,
};

const d = (a: Point3, b: Point3, w: number, h: number): number =>
  Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);

function angleAt(o: Point3, a: Point3, b: Point3, w: number, h: number): number {
  const v1 = { x: (a.x - o.x) * w, y: (a.y - o.y) * h };
  const v2 = { x: (b.x - o.x) * w, y: (b.y - o.y) * h };
  const c = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

export function faceShapeFeatures(
  lm: readonly Point3[],
  w: number,
  h: number,
): FaceShapeFeatures | null {
  const p = (i: number): Point3 | undefined => lm[i];
  const ids = [10, 152, 54, 284, 172, 397, 234, 454, 1];
  if (ids.some((i) => !p(i))) return null;
  const P = (i: number): Point3 => p(i) as Point3;
  const cheek = d(P(234), P(454), w, h);
  if (cheek < 1) return null;
  return {
    length: d(P(10), P(152), w, h) / cheek,
    forehead: d(P(54), P(284), w, h) / cheek,
    jaw: d(P(172), P(397), w, h) / cheek,
    jawAngle: (angleAt(P(172), P(234), P(152), w, h) + angleAt(P(397), P(454), P(152), w, h)) / 2,
    yaw: d(P(1), P(234), w, h) / Math.max(1e-6, d(P(1), P(454), w, h)),
  };
}

/** Nearest prototype; returns the shape and distances (smaller = closer) for all shapes. */
export function classifyFaceShape(
  f: FaceShapeFeatures,
  cfg = FACE_SHAPE_CONFIG,
): { shape: FaceShape; distances: Record<FaceShape, number> } {
  const v = [
    (f.length - cfg.center.length) / cfg.scale.length,
    (f.forehead - cfg.center.forehead) / cfg.scale.forehead,
    (f.jaw - cfg.center.jaw) / cfg.scale.jaw,
    (f.jawAngle - cfg.center.jawAngle) / cfg.scale.jawAngle,
  ];
  const distances = {} as Record<FaceShape, number>;
  let shape: FaceShape = 'oval';
  for (const s of FACE_SHAPES) {
    const proto = cfg.prototypes[s];
    distances[s] = Math.hypot(...proto.map((x, i) => x - (v[i] as number)));
    if (distances[s] < distances[shape]) shape = s;
  }
  return { shape, distances };
}

/** Collects frontal frames and votes, so the shape is stable rather than flickering. */
export class FaceShapeTracker {
  private votes: FaceShape[] = [];
  private _shape: FaceShape | null = null;
  private _features: FaceShapeFeatures | null = null;

  constructor(public cfg = FACE_SHAPE_CONFIG) {}

  get shape(): FaceShape | null {
    return this._shape;
  }
  get features(): FaceShapeFeatures | null {
    return this._features;
  }

  reset(): void {
    this.votes = [];
    this._shape = null;
  }

  /** @returns true when the decided shape changed. */
  update(lm: readonly Point3[], w: number, h: number, rollRad: number): boolean {
    const f = faceShapeFeatures(lm, w, h);
    if (!f || Math.abs(f.yaw - 1) > this.cfg.maxYaw || Math.abs(rollRad) > this.cfg.maxRollRad) {
      return false;
    }
    this._features = f;
    this.votes.push(classifyFaceShape(f, this.cfg).shape);
    if (this.votes.length > this.cfg.windowFrames) this.votes.shift();
    if (this.votes.length < this.cfg.minFrames) return false;
    const counts = new Map<FaceShape, number>();
    for (const s of this.votes) counts.set(s, (counts.get(s) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'oval';
    const changed = best !== this._shape;
    this._shape = best;
    return changed;
  }
}
