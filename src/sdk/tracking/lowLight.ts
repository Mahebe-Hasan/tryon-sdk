import type { Point3 } from './smoothing';

/**
 * Low-light detection, so the host page can ask the shopper to move somewhere brighter.
 *
 * Phone cameras raise exposure in dim rooms until they can't. Past that point the image gets
 * dark and noisy, tracking gets jittery and the colours on screen stop meaning anything. We
 * measure the mean brightness (sRGB luma, 0–1) of the face box (or the whole frame when no face
 * is found) on a tiny downscaled copy every few frames, and report "low" only after it has
 * stayed below the threshold for a while (and "ok" after it has recovered), so a passing
 * shadow or a blink doesn't flash a warning.
 */
export const LOW_LIGHT_CONFIG = {
  /** Measure every N frames (cheap, but there's no need to do it every frame). */
  everyNFrames: 10,
  /** Size of the downscaled sample (longest side, px). */
  sampleSize: 32,
  /** Mean luma below this counts as dark (well-lit faces measure about 0.45–0.65). */
  lowLevel: 0.2,
  /** Mean luma above this counts as bright enough again (hysteresis). */
  okLevel: 0.27,
  /** How long it must stay dark before warning (ms). */
  enterMs: 1500,
  /** How long it must stay bright before clearing the warning (ms). */
  exitMs: 800,
};

export type LowLightConfig = typeof LOW_LIGHT_CONFIG;

/**
 * Pure state machine (unit-tested): feed brightness levels with timestamps; returns the new
 * state when it changes (true = too dark, false = fine), otherwise null.
 */
export class LowLightState {
  private low = false;
  private since: number | null = null;

  constructor(private cfg: LowLightConfig = LOW_LIGHT_CONFIG) {}

  get isLow(): boolean {
    return this.low;
  }

  push(level: number, tMs: number): boolean | null {
    const crossing = this.low ? level > this.cfg.okLevel : level < this.cfg.lowLevel;
    if (!crossing) {
      this.since = null;
      return null;
    }
    this.since ??= tMs;
    if (tMs - this.since < (this.low ? this.cfg.exitMs : this.cfg.enterMs)) return null;
    this.low = !this.low;
    this.since = null;
    return this.low;
  }

  reset(): void {
    this.low = false;
    this.since = null;
  }
}

/** Mean sRGB luma (0–1) of RGBA pixels. */
export function meanLuma(data: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += 4) {
    sum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
    n++;
  }
  return n ? sum / n / 255 : 0;
}

/** Samples the live video and tracks the low-light state. */
export class LowLightMonitor {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  private frame = 0;
  private readonly state: LowLightState;
  /** Last measured level (0–1), for debugging. */
  level = 1;

  constructor(private cfg: LowLightConfig = LOW_LIGHT_CONFIG) {
    this.state = new LowLightState(cfg);
  }

  get isLow(): boolean {
    return this.state.isLow;
  }

  reset(): void {
    this.state.reset();
    this.frame = 0;
  }

  /** Returns the new state when it changes, otherwise null. */
  update(
    video: CanvasImageSource,
    w: number,
    h: number,
    landmarks: readonly Point3[] | null,
    tMs: number,
  ): boolean | null {
    if (this.frame++ % this.cfg.everyNFrames !== 0 || !this.ctx || w < 2 || h < 2) return null;
    let x0 = 0;
    let y0 = 0;
    let bw = w;
    let bh = h;
    if (landmarks && landmarks.length) {
      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;
      for (const p of landmarks) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      x0 = Math.max(0, Math.floor(minX * w));
      y0 = Math.max(0, Math.floor(minY * h));
      bw = Math.min(w - x0, Math.ceil((maxX - minX) * w));
      bh = Math.min(h - y0, Math.ceil((maxY - minY) * h));
      if (bw < 8 || bh < 8) {
        x0 = 0;
        y0 = 0;
        bw = w;
        bh = h;
      }
    }
    const scale = this.cfg.sampleSize / Math.max(bw, bh);
    const cw = Math.max(1, Math.round(bw * scale));
    const ch = Math.max(1, Math.round(bh * scale));
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.ctx.drawImage(video, x0, y0, bw, bh, 0, 0, cw, ch);
    this.level = meanLuma(this.ctx.getImageData(0, 0, cw, ch).data);
    return this.state.push(this.level, tMs);
  }
}
