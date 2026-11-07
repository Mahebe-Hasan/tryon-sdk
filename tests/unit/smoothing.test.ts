import { describe, expect, it } from 'vitest';
import { LandmarkSmoother, OneEuroFilter } from '../../src/sdk/tracking/smoothing';
import { Presence } from '../../src/sdk/tracking/presence';

describe('OneEuroFilter', () => {
  it('passes the first value through', () => {
    expect(new OneEuroFilter().filter(0.5, 0)).toBe(0.5);
  });

  it('reduces jitter on a still signal', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    let maxDev = 0;
    for (let i = 0; i < 300; i++) {
      const noisy = 0.5 + (i % 2 === 0 ? 0.01 : -0.01);
      const out = f.filter(noisy, i / 30);
      if (i > 30) maxDev = Math.max(maxDev, Math.abs(out - 0.5));
    }
    expect(maxDev).toBeLessThan(0.01 * 0.5);
  });

  it('follows fast motion with less lag when beta is higher', () => {
    const run = (beta: number): number => {
      const f = new OneEuroFilter({ minCutoff: 1, beta, dCutoff: 1 });
      let out = 0;
      for (let i = 0; i <= 15; i++) out = f.filter(i * 0.02, i / 30);
      return 0.3 - out; // lag behind the true value
    };
    expect(run(50)).toBeLessThan(run(0));
  });

  it('ignores non-increasing timestamps', () => {
    const f = new OneEuroFilter();
    f.filter(1, 1);
    expect(f.filter(5, 1)).toBe(1);
  });
});

describe('LandmarkSmoother', () => {
  it('smooths every coordinate and does not mutate input', () => {
    const s = new LandmarkSmoother();
    const a = [{ x: 0, y: 0, z: 0 }];
    s.smooth(a, 0);
    const b = [{ x: 1, y: 1, z: 1 }];
    const out = s.smooth(b, 1 / 30);
    expect(out[0]?.x).toBeGreaterThan(0);
    expect(out[0]?.x).toBeLessThan(1);
    expect(b[0]).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('resets when the landmark count changes', () => {
    const s = new LandmarkSmoother();
    s.smooth([{ x: 0, y: 0, z: 0 }], 0);
    const out = s.smooth(
      [
        { x: 1, y: 1, z: 1 },
        { x: 2, y: 2, z: 2 },
      ],
      1,
    );
    expect(out).toEqual([
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 2, z: 2 },
    ]);
  });
});

describe('Presence', () => {
  it('fades in and out over fadeMs', () => {
    const p = new Presence(150);
    p.update(true, 0);
    expect(p.update(true, 75)).toBeCloseTo(0.5);
    expect(p.update(true, 200)).toBe(1);
    expect(p.update(false, 275)).toBeCloseTo(0.5);
    expect(p.update(false, 1000)).toBe(0);
  });
});
