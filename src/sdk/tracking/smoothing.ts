/**
 * One Euro filter (Casiez et al., CHI 2012): adaptive low-pass that removes jitter when
 * the signal is still and reduces lag when it moves fast.
 *  - minCutoff (Hz): lower = smoother when still, but more lag.
 *  - beta: higher = less lag during fast motion.
 */
export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

/** Defaults tuned for normalised (0–1) landmark coordinates. */
export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.5, beta: 20, dCutoff: 1 };

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(public params: OneEuroParams = DEFAULT_ONE_EURO) {}

  /** @param t timestamp in seconds */
  filter(value: number, t: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = t - this.t;
    if (dt <= 0) return this.x;
    this.t = t;
    const { minCutoff, beta, dCutoff } = this.params;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(dCutoff, dt) * (rawDx - this.dx);
    const cutoff = minCutoff + beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
  }
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Applies a One Euro filter to every x/y/z of a landmark list. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[] = [];
  private _params: OneEuroParams;

  constructor(params: Partial<OneEuroParams> = {}) {
    this._params = { ...DEFAULT_ONE_EURO, ...params };
  }

  get params(): OneEuroParams {
    return this._params;
  }

  setParams(p: Partial<OneEuroParams>): void {
    this._params = { ...this._params, ...p };
    for (const f of this.filters) f.params = this._params;
  }

  /** @param tSec timestamp in seconds. Returns a new array; input is not mutated. */
  smooth(points: readonly Point3[], tSec: number): Point3[] {
    const needed = points.length * 3;
    if (this.filters.length !== needed) {
      this.filters = Array.from({ length: needed }, () => new OneEuroFilter(this._params));
    }
    const out: Point3[] = new Array<Point3>(points.length);
    for (let i = 0; i < points.length; i++) {
      const p = points[i] as Point3;
      const j = i * 3;
      out[i] = {
        x: (this.filters[j] as OneEuroFilter).filter(p.x, tSec),
        y: (this.filters[j + 1] as OneEuroFilter).filter(p.y, tSec),
        z: (this.filters[j + 2] as OneEuroFilter).filter(p.z, tSec),
      };
    }
    return out;
  }

  reset(): void {
    for (const f of this.filters) f.reset();
  }
}
