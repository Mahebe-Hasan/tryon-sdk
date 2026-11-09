import { describe, expect, it } from 'vitest';
import { LOW_LIGHT_CONFIG, LowLightState, meanLuma } from '../../src/sdk/tracking/lowLight';

const cfg = LOW_LIGHT_CONFIG;

/** Feeds a constant level every 100 ms from t0 to t1; returns the state changes seen. */
const feed = (s: LowLightState, level: number, t0: number, t1: number): boolean[] => {
  const out: boolean[] = [];
  for (let t = t0; t <= t1; t += 100) {
    const r = s.push(level, t);
    if (r !== null) out.push(r);
  }
  return out;
};

describe('LowLightState', () => {
  it('stays fine in normal light', () => {
    const s = new LowLightState();
    expect(feed(s, 0.5, 0, 5000)).toEqual([]);
    expect(s.isLow).toBe(false);
  });

  it('warns only after it has been dark for enterMs', () => {
    const s = new LowLightState();
    expect(feed(s, 0.1, 0, cfg.enterMs - 100)).toEqual([]);
    expect(s.push(0.1, cfg.enterMs)).toBe(true);
    expect(s.isLow).toBe(true);
  });

  it('ignores a short dip (a shadow or a blink)', () => {
    const s = new LowLightState();
    feed(s, 0.1, 0, 600);
    feed(s, 0.5, 700, 800);
    expect(feed(s, 0.1, 900, 900 + cfg.enterMs - 200)).toEqual([]);
    expect(s.isLow).toBe(false);
  });

  it('clears after it has been bright enough for exitMs, with hysteresis', () => {
    const s = new LowLightState();
    feed(s, 0.1, 0, cfg.enterMs);
    expect(s.isLow).toBe(true);
    // Between the two thresholds: still low.
    expect(feed(s, (cfg.lowLevel + cfg.okLevel) / 2, 2000, 5000)).toEqual([]);
    expect(feed(s, 0.5, 5100, 5100 + cfg.exitMs)).toEqual([false]);
    expect(s.isLow).toBe(false);
  });
});

describe('meanLuma', () => {
  it('is 0 for black, 1 for white and ~0.5 for mid grey', () => {
    expect(meanLuma(new Uint8ClampedArray([0, 0, 0, 255]))).toBe(0);
    expect(meanLuma(new Uint8ClampedArray([255, 255, 255, 255]))).toBeCloseTo(1, 5);
    expect(meanLuma(new Uint8ClampedArray([128, 128, 128, 255, 127, 127, 127, 255]))).toBeCloseTo(
      0.5,
      2,
    );
  });
});
