import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { srgbToLinear, type RGB } from '../render/color';
import { connectionsToPaths, type Vec2 } from './paths';
import type { Point3 } from './smoothing';

/**
 * Scene light estimation from the whites of the eyes (sclera).
 *
 * A real lipstick reflects the room's light: in a dim or warm room it looks darker/warmer,
 * exactly like the skin around it. So a product colour (specified for daylight) must be
 * "lit" by the scene before it is put on the lips — otherwise it glows like a sticker.
 *
 * Skin and lip lightness vary hugely between people, so they cannot tell us the light.
 * The sclera can: it is melanin-free and nearly the same for everyone. Method from
 * Choi et al., "The human sclera and pupil as the calibration targets" (Electronic Imaging
 * 2017): segment the sclera inside the eye shape, take its BRIGHTEST region (avoids vessels
 * and eyelid shadow), and apply a von Kries (per-channel) correction against the measured
 * reference sclera colour. They report accuracy on par with a 24-patch colour checker.
 */

export const LIGHT_CONFIG = {
  /** Calibrated sclera colour from Choi et al. 2017 (sRGB 0–1). Warm, not pure white. */
  referenceSclera: [0.7, 0.59, 0.54] as RGB,
  /** Fraction of the brightest candidate sclera pixels to average. */
  brightestFraction: 0.35,
  /** Minimum sclera pixels (both eyes) for a usable estimate. */
  minPixels: 24,
  /** Ignore clipped glare (glasses, catchlights) above this sRGB value in every channel. */
  glareLevel: 0.97,
  /** Overall gain limits (linear). Below ~0.15 the sensor is too noisy to trust. */
  minGain: 0.15,
  maxGain: 1.6,
  /** White-balance correction allowed relative to the overall gain (sclera can be reddish). */
  maxChannelRatio: 1.25,
  /** Temporal smoothing time constant (light changes slowly). */
  smoothingMs: 600,
  /** Skip updates while blinking (blendshape score). */
  blinkThreshold: 0.45,
  /** Measure every N frames (cheap, but no need to do it every frame). */
  everyNFrames: 4,
  /** Crop scale: pixels per eye width in the sampled crop. */
  samplesPerEyeWidth: 56,
};

export interface IlluminantEstimate {
  /** Per-channel linear gains: observed / reference. Multiply a product's linear RGB by it. */
  gain: RGB;
  /** Number of sclera pixels used. */
  pixels: number;
}

/**
 * Pure estimator (unit-tested): from candidate sclera pixels (sRGB 0–1 triples), pick the
 * brightest fraction, average in linear light, and compare with the reference sclera.
 */
export function estimateIlluminant(
  pixels: readonly RGB[],
  cfg = LIGHT_CONFIG,
): IlluminantEstimate | null {
  const usable = pixels.filter(
    (p) => !(p[0] >= cfg.glareLevel && p[1] >= cfg.glareLevel && p[2] >= cfg.glareLevel),
  );
  if (usable.length < cfg.minPixels) return null;
  const lum = (p: RGB): number => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  const sorted = [...usable].sort((a, b) => lum(b) - lum(a));
  const n = Math.max(cfg.minPixels / 2, Math.round(sorted.length * cfg.brightestFraction));
  const top = sorted.slice(0, n);
  const mean: RGB = [0, 0, 0];
  for (const p of top) {
    mean[0] += srgbToLinear(p[0]);
    mean[1] += srgbToLinear(p[1]);
    mean[2] += srgbToLinear(p[2]);
  }
  mean[0] /= top.length;
  mean[1] /= top.length;
  mean[2] /= top.length;
  const ref = cfg.referenceSclera.map(srgbToLinear) as RGB;
  const raw: RGB = [mean[0] / ref[0], mean[1] / ref[1], mean[2] / ref[2]];
  // Overall exposure from luminance; white balance limited so a red/yellow sclera can't
  // swing the colour too far.
  const lumRaw = 0.2126 * raw[0] + 0.7152 * raw[1] + 0.0722 * raw[2] || 1;
  const overall = Math.min(cfg.maxGain, Math.max(cfg.minGain, lumRaw));
  const gain = raw.map((g) => {
    const ratio = Math.min(cfg.maxChannelRatio, Math.max(1 / cfg.maxChannelRatio, g / lumRaw));
    return overall * ratio;
  }) as RGB;
  return { gain, pixels: top.length };
}

function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec2;
    const b = poly[j] as Vec2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

const EYE_LOOPS = [
  connectionsToPaths(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE).closed[0] ?? [],
  connectionsToPaths(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE).closed[0] ?? [],
];
const IRIS = [
  { center: 468, ring: [469, 470, 471, 472] },
  { center: 473, ring: [474, 475, 476, 477] },
];

/** Samples the sclera from the live video every few frames and smooths the estimate. */
export class SceneLight {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  private frame = 0;
  private lastT: number | null = null;
  private _gain: RGB = [1, 1, 1];
  private _valid = false;

  constructor(public cfg = LIGHT_CONFIG) {}

  /** Smoothed per-channel linear gains (1,1,1 until the first good measurement). */
  get gain(): RGB {
    return this._gain;
  }
  get valid(): boolean {
    return this._valid;
  }

  reset(): void {
    this._gain = [1, 1, 1];
    this._valid = false;
    this.lastT = null;
  }

  update(
    video: CanvasImageSource,
    landmarks: readonly Point3[],
    w: number,
    h: number,
    blendshapes: Record<string, number>,
    tMs: number,
  ): void {
    if (this.frame++ % this.cfg.everyNFrames !== 0 || !this.ctx) return;
    const blink = Math.max(blendshapes.eyeBlinkLeft ?? 0, blendshapes.eyeBlinkRight ?? 0);
    if (blink > this.cfg.blinkThreshold) return;
    const pixels: RGB[] = [];
    for (let e = 0; e < 2; e++) this.sampleEye(video, landmarks, w, h, e, pixels);
    const est = estimateIlluminant(pixels, this.cfg);
    if (!est) return;
    const dt = this.lastT === null ? Infinity : Math.max(0, tMs - this.lastT);
    this.lastT = tMs;
    const k = this._valid ? 1 - Math.exp(-dt / this.cfg.smoothingMs) : 1;
    this._gain = this._gain.map((g, i) => g + ((est.gain[i] as number) - g) * k) as RGB;
    this._valid = true;
  }

  private sampleEye(
    video: CanvasImageSource,
    lm: readonly Point3[],
    w: number,
    h: number,
    eye: number,
    out: RGB[],
  ): void {
    const P = (i: number): Vec2 => {
      const p = lm[i];
      return p ? { x: p.x * w, y: p.y * h } : { x: 0, y: 0 };
    };
    const loop = (EYE_LOOPS[eye] ?? []).map(P);
    if (loop.length < 3) return;
    const xs = loop.map((p) => p.x);
    const ys = loop.map((p) => p.y);
    const x0 = Math.floor(Math.min(...xs));
    const y0 = Math.floor(Math.min(...ys));
    const bw = Math.ceil(Math.max(...xs)) - x0;
    const bh = Math.ceil(Math.max(...ys)) - y0;
    if (bw < 4 || bh < 2) return;
    const scale = Math.min(1, this.cfg.samplesPerEyeWidth / bw);
    const cw = Math.max(1, Math.round(bw * scale));
    const ch = Math.max(1, Math.round(bh * scale));
    if (this.canvas.width < cw || this.canvas.height < ch) {
      this.canvas.width = Math.max(this.canvas.width, cw);
      this.canvas.height = Math.max(this.canvas.height, ch);
    }
    const ctx = this.ctx as CanvasRenderingContext2D;
    ctx.drawImage(video, x0, y0, bw, bh, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    const iris = IRIS[eye] as { center: number; ring: number[] };
    const ic = P(iris.center);
    const ir = iris.ring.reduce((s, i) => s + Math.hypot(P(i).x - ic.x, P(i).y - ic.y), 0) / 4;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const p = { x: x0 + (x + 0.5) / scale, y: y0 + (y + 0.5) / scale };
        if (Math.hypot(p.x - ic.x, p.y - ic.y) < ir * 1.08) continue; // iris + limbus
        if (!pointInPolygon(p, loop)) continue;
        const i = (y * cw + x) * 4;
        out.push([(data[i] ?? 0) / 255, (data[i + 1] ?? 0) / 255, (data[i + 2] ?? 0) / 255]);
      }
    }
  }
}
