import type { Vec2 } from './paths';
import type { Point3 } from './smoothing';

export interface FaceMetrics {
  /** Distance between the face-side landmarks 234 and 454, in frame pixels. */
  width: number;
  /** Point between the eyes (landmark 168), frame pixels. */
  center: Vec2;
  /** Head roll in radians (0 = upright). */
  roll: number;
  /**
   * Column-major 3×3 affine: frame px → face space (1 unit = face width, origin between the
   * eyes, x along the face's left-right axis). Feeds the renderer's face-anchored effects.
   */
  transform: Float32Array;
}

/**
 * Where a wet lip highlight naturally sits: on the fullest part of the lower lip, a little
 * above its middle (between inner-lip 14 and outer-lip 17), elongated along the mouth axis
 * (61 → 291). Returned in frame px for the renderer's synthetic gloss spot.
 */
export function lipGlossSpot(
  landmarks: readonly Point3[],
  w: number,
  h: number,
): { x: number; y: number; rx: number; ry: number; ax: number; ay: number } {
  const P = (i: number): Vec2 => {
    const p = landmarks[i];
    return p ? { x: p.x * w, y: p.y * h } : { x: 0, y: 0 };
  };
  const inner = P(14);
  const outer = P(17);
  const left = P(61);
  const right = P(291);
  const mouthW = Math.max(1, Math.hypot(right.x - left.x, right.y - left.y));
  const lowerLipH = Math.max(1, Math.hypot(outer.x - inner.x, outer.y - inner.y));
  return {
    x: inner.x + (outer.x - inner.x) * 0.42,
    y: inner.y + (outer.y - inner.y) * 0.42,
    rx: mouthW * 0.2,
    ry: lowerLipH * 0.24,
    ax: (right.x - left.x) / mouthW,
    ay: (right.y - left.y) / mouthW,
  };
}

export function faceMetrics(landmarks: readonly Point3[], w: number, h: number): FaceMetrics {
  const P = (i: number): Vec2 => {
    const p = landmarks[i];
    return p ? { x: p.x * w, y: p.y * h } : { x: 0, y: 0 };
  };
  const a = P(234);
  const b = P(454);
  const c = P(168);
  const width = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  const ex = { x: (b.x - a.x) / width, y: (b.y - a.y) / width };
  const ey = { x: -ex.y, y: ex.x };
  const transform = new Float32Array([
    ex.x / width,
    ey.x / width,
    0,
    ex.y / width,
    ey.y / width,
    0,
    -(c.x * ex.x + c.y * ex.y) / width,
    -(c.x * ey.x + c.y * ey.y) / width,
    1,
  ]);
  return { width, center: c, roll: Math.atan2(ex.y, ex.x), transform };
}
